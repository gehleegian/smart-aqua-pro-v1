import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('firmware/Aquarium1Device/Aquarium1Device.ino', root), 'utf8');
const names = ['PH4_V', 'PH686_V', 'PH918_V'];
function calculator(text, overrides = {}) {
  const values = names.map(name => overrides[name] ?? Number(text.match(new RegExp(`\\b${name} = ([0-9.]+)f`))?.[1]));
  const body = text.match(/float fitPH\(float v\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(body);
  const calculate = Function('v', ...names, 'NAN', 'isfinite', body
    .replace(/const float /g, 'const ').replace(/(\d)f\b/g, '$1'));
  return v => calculate(v, ...values, NaN, Number.isFinite);
}

test('stored pH buffer references are preserved exactly', () => {
  const calculate = calculator(source);
  assert.ok(Math.abs(calculate(2.438) - 4.01) < 1e-10);
  assert.ok(Math.abs(calculate(2.287) - 6.86) < 1e-10);
  assert.ok(Math.abs(calculate(2.103) - 9.18) < 1e-10);
  assert.ok(Math.abs(calculate(2.215) - 7.767826086956522) < 1e-10);
});

test('the reported 2.069 V input computes pH 9.61 rather than failing the old buffer-voltage gate', () => {
  const ph = calculator(source)(2.069);
  assert.equal(ph.toFixed(2), '9.61');
  assert.match(source, /phValue = fitPH\(phV\)/);
  assert.doesNotMatch(source, /phV >= PH918_V && phV <= PH4_V \? fitPH/);
  assert.match(source, /outside buffer span: extrapolated; verify with meter/);
  assert.match(source, /telemetry\["phReadingValid"\] = isfinite\(phValue\)/);
  const now = 1794000000000;
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry({
    temperatureC: 24, waterLevelPercent: 80, ph, phReadingValid: true, updatedAt: now, online: true,
  }), now);
  assert.equal(snapshot.hasFreshPhTelemetry, true);
  assert.equal(snapshot.ph.toFixed(2), '9.61');
});

test('invalid values and malformed calibration remain invalid instead of being clamped to a plausible pH', () => {
  const calculate = calculator(source);
  for (const v of [NaN, Infinity, -Infinity, -1, 0, 1, 3.3, 5]) assert.ok(Number.isNaN(calculate(v)), String(v));
  assert.ok(Number.isNaN(calculator(source, { PH4_V: 2.287 })(2.069)), 'zero slope interval rejected');
  assert.ok(Number.isNaN(calculator(source, { PH918_V: 2.5 })(2.069)), 'reversed calibration rejected');
});

test('actual Aquarium 1 sketch and repository firmware use the same pH transfer curve', () => {
  const actual = readFileSync(new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url), 'utf8');
  const calculate = calculator(actual);
  for (const v of [2.438, 2.287, 2.103, 2.215, 2.069, 3.3]) assert.equal(calculate(v), calculator(source)(v));
  assert.match(actual, /phValue = fitPH\(phV\)/);
  assert.match(actual, /telemetry\["phReadingValid"\] = isfinite\(phValue\)/);
});
