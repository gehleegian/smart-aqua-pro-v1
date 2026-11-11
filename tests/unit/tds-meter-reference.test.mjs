import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const root = new URL('../../', import.meta.url);
const firmware = readFileSync(new URL('firmware/Aquarium1Device/Aquarium1Device.ino', root), 'utf8');
const names = ['TDS_LOW_V', 'TDS_LOW_PPM', 'TDS_HIGH_V', 'TDS_HIGH_PPM', 'TDS_CHECKED_MIN_V', 'TDS_CHECKED_MAX_V'];

// Exercise the actual scalar C++ expression, which is also valid JavaScript
// after stripping float suffixes. This is not physical accuracy verification.
function calculator(source, enabled = true, overrides = {}) {
  const constants = names.map(name => {
    const expression = source.match(new RegExp(`\\b${name} = ([^,;\\r\\n]+)`))?.[1];
    assert.ok(expression, name);
    return overrides[name] ?? Function(`return (${expression.replace(/(\d)f\b/g, '$1')});`)();
  });
  const body = source.match(/float meterReferencedTds\(float v\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  const calculate = Function('v', ...names, 'TDS_METER_REFERENCE_ENABLED', 'NAN', 'isfinite', body
    .replace(/const float /g, 'const ').replace(/(\d)f\b/g, '$1'));
  return v => calculate(v, ...constants, enabled, NaN, Number.isFinite);
}

test('two-point estimate reproduces the corrected normal-temperature 80 and 314 ppm references', () => {
  const calculate = calculator(firmware);
  assert.equal(calculate(0.169), 80);
  assert.equal(calculate(1.304), 314);
  assert.ok(Math.abs(calculate((0.169 + 1.304) / 2) - 197) < 1e-9);
  assert.equal(Math.round(calculate(0.169)), 80);
  assert.equal(Math.round(calculate(1.303)), 314);
});

test('values outside the checked span use the unchanged line, not a clamp to the endpoints', () => {
  const calculate = calculator(firmware);
  assert.ok(Math.abs(calculate(0.142) - 74.43348017621146) < 1e-9);
  assert.equal(Math.round(calculate(2.455)), 551);
  assert.ok(calculate(0.167) < 80);
  assert.ok(calculate(2.455) > 314);
  assert.match(firmware, /outside checked span: extrapolated; verify with meter/);
});

test('saturation, disabled reference and malformed inputs/calibration remain invalid', () => {
  const calculate = calculator(firmware);
  for (const v of [0, -1, 3.3, 5, NaN, Infinity, -Infinity]) {
    assert.ok(Number.isNaN(calculate(v)), String(v));
  }
  assert.ok(Number.isNaN(calculator(firmware, false)(1.304)), 'uncompared device stays disabled');
  assert.ok(Number.isNaN(calculator(firmware, true, { TDS_HIGH_V: 0.169 })(1)), 'zero voltage interval');
  assert.ok(Number.isNaN(calculator(firmware, true, { TDS_HIGH_PPM: 79 })(1)), 'reversed ppm references');
  assert.ok(Number.isNaN(calculator(firmware, true, { TDS_LOW_PPM: -100 })(0.1)), 'negative result not clamped');
  assert.doesNotMatch(firmware, /SALT_EQ_REF_PPM|TDS_BASE_V|TDS_REF_V/);
  assert.match(firmware, /tdsPpm = analogRead\(TDS_PIN\) >= 4095 \? NAN : meterReferencedTds\(tdsV\)/);
  assert.match(firmware, /telemetry\["tdsReadingValid"\] = isfinite\(tdsPpm\)/);
  assert.match(firmware, /if \(isfinite\(tdsPpm\)\) telemetry\["tdsPpm"\] = tdsPpm/);
});

test('ppm-only telemetry becomes displayable without inventing a purity percentage', () => {
  const now = 1794000000000;
  for (const voltage of [0.169, 1.304]) {
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry({
    temperatureC: 24, waterLevelPercent: 80, updatedAt: now, online: true,
    tdsPpm: calculator(firmware)(voltage), tdsReadingValid: true,
  }), now);
  assert.equal(snapshot.tdsPpm, calculator(firmware)(voltage));
  assert.equal(snapshot.validity.tds.status, 'valid');
  assert.equal(snapshot.tdsPercent, null);
  assert.equal(snapshot.hasFreshPurityTelemetry, false);
  }
  for (const voltage of [0.142, 2.455]) {
    const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry({
      temperatureC: 24, waterLevelPercent: 80, updatedAt: now, online: true,
      tdsPpm: calculator(firmware)(voltage), tdsReadingValid: true,
    }), now);
    assert.equal(snapshot.tdsPpm, null);
    assert.equal(snapshot.validity.tds.status, 'invalid');
  }
});

test('actual Aquarium 1 sketch uses the same expression; owner-confirmed Aquarium 2 is also enabled', () => {
  const local = new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url);
  if (existsSync(local)) {
    const calculate = calculator(readFileSync(local, 'utf8'));
    for (const v of [0.169, 1.304, 0.142, 0.167, 0.174, 2.455]) assert.equal(calculate(v), calculator(firmware)(v));
  }
  const a1 = readFileSync(new URL('firmware/Aquarium1Device/Config.h', root), 'utf8');
  const a2 = readFileSync(new URL('firmware/Aquarium2Device/Config.h', root), 'utf8');
  assert.match(a1, /#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1/);
  assert.match(a2, /#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1/);
});

test('an unavailable TDS reference is not described as proof of a broken sensor', async () => {
  const { getSensorDisplay } = await loadTsModule(new URL('src/utils/sensorDisplay.ts', root));
  const result = getSensorDisplay({ tds: { status: 'invalid', reason: 'tdsReadingValid is false' } }, 'tds', true, () => '0');
  assert.equal(result.value, 'Unavailable');
  assert.match(result.status, /invalid\/clipped or not calibrated/);
  assert.equal(result.isError, true);
});
