// Offline numerical/control tests from owner-supplied observations only.
// No telemetry is generated for, or written to, a live application.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../../firmware/Aquarium1Device/', import.meta.url);
const header = readFileSync(new URL('LoadCompensation.h', root), 'utf8');
const source = readFileSync(new URL('Aquarium1Device.ino', root), 'utf8');
const clean = body => body.replace(/\b(\d+(?:\.\d+)?)f\b/g, '$1')
  .replace(/\b(\d+)U\b/g, '$1').replace(/\bconst float\b/g, 'const');
const enabled = header.match(/constexpr bool ENABLED = (true|false);/)?.[1] === 'true';
const context = vm.createContext({ ENABLED: enabled, NAN: NaN, isfinite: Number.isFinite });
const observationSpan = header.match(/constexpr float OBSERVATION_SPAN_CM = ([^;]+);/)?.[1];
assert.ok(observationSpan);
context.OBSERVATION_SPAN_CM = vm.runInContext(clean(observationSpan), context);
for (const name of ['PH_REFERENCE', 'TDS_REFERENCE_PPM', 'LEVEL_REFERENCE_PERCENT']) {
  const entries = header.match(new RegExp(`${name}\\[4\\] = \\{([^}]+)\\}`))?.[1];
  assert.ok(entries);
  context[name] = vm.runInContext(`[${clean(entries)}]`, context);
}
for (const name of ['stateIndex', 'phShift', 'tdsShift', 'distanceShift', 'voltage', 'ph', 'tds', 'distance']) {
  const match = header.match(new RegExp(`inline (?:float|unsigned) ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}`));
  assert.ok(match, name);
  const args = match[1].replace(/\b(?:float|bool)\s+/g, '');
  vm.runInContext(`function ${name}(${args}) {${clean(match[2])}}`, context);
}
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);

test('adapter profile enabled for supervised testing, not the superseded laptop profile', () => {
  assert.equal(enabled, true);
  assert.match(header, /EXPERIMENTAL AQ1 5V\/2A-adapter profile/);
  assert.doesNotMatch(header, /PH_REFERENCE_V|TDS_REFERENCE_V|2\.135f/);
});

test('profile uses both adapter observations per ON state, with observed settled OFF reference', () => {
  assert.deepEqual(Array.from(context.PH_REFERENCE), [8.9, 4.75, 9.75, 5.2]);
  assert.deepEqual(Array.from(context.TDS_REFERENCE_PPM), [89, 181, 103.5, 188]);
  Array.from(context.LEVEL_REFERENCE_PERCENT).forEach((value, index) => near(value, [68.7, 68.7, 53.15, 54.3][index]));
  for (const [light, filter, index, ph, tds, cm] of [
    [false, false, 0, 0, 0, 0], [true, false, 1, -4.15, 92, 0],
    [false, true, 2, 0.85, 14.5, 1.0574], [true, true, 3, -3.7, 99, 0.9792],
  ]) {
    assert.equal(context.stateIndex(light, filter), index);
    near(context.phShift(light, filter), ph);
    near(context.tdsShift(light, filter), tds);
    near(context.distanceShift(light, filter), cm);
    near(context.ph(context.PH_REFERENCE[index], light, filter), 8.9);
    near(context.tds(context.TDS_REFERENCE_PPM[index], light, filter), 89);
    const rawDistance = 27 - context.LEVEL_REFERENCE_PERCENT[index] * 6.8 / 100;
    near((27 - context.distance(rawDistance, cm)) * 100 / 6.8, 68.7);
  }
});

test('fixed subtraction preserves subsequent real input changes instead of locking a baseline', () => {
  for (const light of [false, true]) for (const filter of [false, true]) {
    const state = context.stateIndex(light, filter);
    near(context.ph(context.PH_REFERENCE[state] + 0.2, light, filter), 9.1);
    near(context.tds(context.TDS_REFERENCE_PPM[state] + 50, light, filter), 139);
    const rawDistance = 27 - context.LEVEL_REFERENCE_PERCENT[state] * 6.8 / 100;
    near(context.distance(rawDistance + 0.4, context.distanceShift(light, filter)), 22.7284);
  }
  near(context.ph(9.3, false, false), 9.3, 'OFF drift is not forced to 8.9');
  context.ENABLED = false;
  try {
    near(context.phShift(true, true), 0);
    near(context.tdsShift(true, true), 0);
    near(context.distanceShift(true, true), 0);
    near(context.ph(5.2, true, true), 5.2);
    near(context.tds(172, true, true), 172);
  } finally { context.ENABLED = true; }
});

test('raw clipping and invalid adjusted inputs cannot be disguised as valid measurements', () => {
  for (const raw of [NaN, Infinity, -Infinity, -1, 0, 3.3, 5])
    assert.ok(Number.isNaN(context.voltage(raw, false)));
  assert.ok(Number.isNaN(context.voltage(3.129, true)));
  near(context.voltage(2.34, false), 2.34);
  assert.ok(Number.isNaN(context.ph(context.voltage(3.129, true), true, false)));
  for (const raw of [NaN, Infinity, -Infinity, -1, 0, 14.01])
    assert.ok(Number.isNaN(context.ph(raw, true, false)));
  assert.ok(Number.isNaN(context.ph(12, true, false)), 'corrected pH above 14 is invalid, not clamped');
  assert.ok(Number.isNaN(context.ph(0.5, false, true)));
  for (const raw of [NaN, Infinity, -Infinity, -1, 50])
    assert.ok(Number.isNaN(context.tds(raw, true, true)));
  near(context.tds(0, false, false), 0);
  for (const raw of [NaN, Infinity, -1, 0, 19.9, 801])
    assert.ok(Number.isNaN(context.distance(raw, 1)));
  assert.ok(Number.isNaN(context.distance(20.5, 1)), 'adjustment must not make a blind-zone reading valid');
  near(context.distance(21, 1), 20);
});

test('historical distance model remains reproducible but is not active water-level calibration', () => {
  const full = Number(source.match(/FULL_CM = ([\d.]+)f/)?.[1]);
  near(full, 27 - 67.45 / 100 * (27 - 20.2));
  near(context.OBSERVATION_SPAN_CM, 6.8);
  const percent = distance => Math.min(100, Math.max(0, (27 - distance) / (27 - full) * 100));
  for (const light of [false, true]) for (const filter of [false, true]) {
    const shift = context.distanceShift(light, filter);
    near(percent(context.distance(full + shift, shift)), 100);
    near(percent(context.distance(full + shift + (27 - full) / 2, shift)), 50);
    near(percent(context.distance(27 + shift, shift)), 0);
    assert.ok(percent(context.distance(full + shift + 1, shift)) < 90);
  }
  near(context.distanceShift(false, true), 1.0574);
  near(context.distanceShift(true, true), 0.9792);
});

test('observed residual variation remains visible instead of forcing exact OFF readings', () => {
  near(context.tds(204, true, true), 105);
  near(context.tds(172, true, true), 73);
  near(context.ph(10, false, true), 9.15);
  near(context.ph(9.5, false, true), 8.65);
});

test('profile is bypassed during absent or unknown 12V power, never summed across loads', () => {
  const block = source.match(/  const bool compensationPowered[\s\S]*?(?=  \/\/ END AQ1 LOAD COMPENSATION)/)?.[0];
  assert.ok(block);
  const executable = block.replace(/const bool/g, 'const')
    .replace(/PowerSignal::State::Present/g, 'PowerPresent')
    .replace(/LoadCompensation::/g, 'LoadCompensation.');
  for (const measuredPower of ['present', 'absent', 'unknown']) {
    for (const sampleLight of [false, true]) for (const sampleFilter of [false, true]) {
      const run = vm.createContext({ measuredPower, PowerPresent: 'present', sampleLight, sampleFilter,
        rawPhValue: NaN, rawTdsPpm: NaN, phValue: 5.2, tdsPpm: 188, LoadCompensation: context });
      vm.runInContext(executable, run);
      const powered = measuredPower === 'present';
      near(run.phValue, context.ph(5.2, sampleLight && powered, sampleFilter && powered));
      near(run.tdsPpm, context.tds(188, sampleLight && powered, sampleFilter && powered));
      near(run.rawPhValue, 5.2);
      near(run.rawTdsPpm, 188);
    }
  }
});

for (const [name, folder] of [['repository', root], ['owner sketch', new URL('../../../Aquarium1Device/', import.meta.url)]]) {
  if (!existsSync(folder)) continue;
  const sketch = readFileSync(new URL('Aquarium1Device.ino', folder), 'utf8');
  test(`${name}: includes identical AQ1-only profile and retains raw/current measurements`, () => {
    assert.equal(readFileSync(new URL('LoadCompensation.h', folder), 'utf8').replaceAll('\r\n', '\n'), header.replaceAll('\r\n', '\n'));
    assert.match(sketch, /#include "LoadCompensation.h"/);
    assert.match(sketch, /phV = LoadCompensation::voltage\(phV, analogRead\(PH_PIN\) >= 4095\)/);
    assert.match(sketch, /tdsV = LoadCompensation::voltage\(tdsV, analogRead\(TDS_PIN\) >= 4095\)/);
    assert.match(sketch, /rawPhValue = phValue;\s*rawTdsPpm = tdsPpm;/);
    assert.match(sketch, /phValue = LoadCompensation::ph\(rawPhValue, compensateLight, compensateFilter\)/);
    assert.match(sketch, /tdsPpm = LoadCompensation::tds\(rawTdsPpm, compensateLight, compensateFilter\)/);
    assert.match(sketch, /rawDistanceCm = distanceCm;/);
    assert.doesNotMatch(sketch, /LoadCompensation::distance(?:Shift)?\s*\(/);
    assert.match(sketch, /tdsPpm = analogRead\(TDS_PIN\) >= 4095 \? NAN : meterReferencedTds\(tdsV\)/);
    assert.match(sketch, /phValue = fitPH\(phV\)/);
    assert.match(sketch, /SENSOR_READ_INTERVAL_MS = 10000/);
    assert.match(sketch, /EXPERIMENTAL 5V\/2A adapter profile; accuracy not verified; disable for laptop USB/);
    assert.match(sketch, /Water-level distance: current echo median; load correction disabled/);
    assert.match(sketch, /Raw -> adjusted:/);
    const guard = sketch.lastIndexOf('if (sampleRelayRevision != relayRevision)');
    assert.ok(guard > sketch.indexOf('bool cloudCycle()'));
    assert.ok(guard < sketch.indexOf('JsonDocument telemetry;', sketch.indexOf('bool cloudCycle()')));
    assert.doesNotMatch(sketch, /lastOffReadings|waterReadingState|baselinePpm/);
  });
}

test('current water-level processing preserves valid raw echoes in every load state', () => {
  const begin = source.indexOf('  const uint32_t us = medianEcho(echoes);');
  const end = source.indexOf('  sampleAt = millis();', begin);
  assert.ok(begin > 0 && end > begin);
  const processing = clean(source.slice(begin, end))
    .replace(/const uint32_t/g, 'const').replace(/WaterLevel::/g, 'WaterLevel.');
  // Isolated numerical regression input; never uploaded as telemetry.
  const pulseUs = 1226;
  const raw = pulseUs * 0.0343 / 2;
  assert.ok(Number.isNaN(context.distance(raw, context.distanceShift(false, true))),
    'old filter-only subtraction rejected this valid raw distance');
  assert.ok(Number.isFinite(context.distance(raw, context.distanceShift(true, true))),
    'old both-on subtraction happened to leave this distance valid');
  for (const light of [false, true]) for (const filter of [false, true]) {
    const run = vm.createContext({ echoes: [], medianEcho: () => pulseUs,
      isfinite: Number.isFinite, NAN: NaN, PROFILE_LEVEL_ENABLED: false,
      EMPTY_CM: 27, FULL_CM: 22.4134, compensateLight: light, compensateFilter: filter,
      constrain: (value, min, max) => Math.min(max, Math.max(min, value)),
      rawDistanceCm: NaN, distanceCm: NaN, levelPct: NaN, levelValid: false,
    });
    vm.runInContext(processing, run);
    near(run.distanceCm, raw);
    near(run.rawDistanceCm, raw);
    assert.equal(run.levelValid, true);
    near(run.levelPct, Math.min(100, (27 - raw) * 100 / (27 - 22.4134)));
  }
  for (const pulse of [0, 1160, 47000]) {
    const run = vm.createContext({ echoes: [], medianEcho: () => pulse,
      isfinite: Number.isFinite, NAN: NaN, PROFILE_LEVEL_ENABLED: false,
      EMPTY_CM: 27, FULL_CM: 22.4134,
      constrain: (value, min, max) => Math.min(max, Math.max(min, value)),
      rawDistanceCm: NaN, distanceCm: NaN, levelPct: NaN, levelValid: true,
    });
    vm.runInContext(processing, run);
    assert.equal(run.levelValid, false, 'no echo, blind-zone and over-range inputs stay invalid');
    assert.ok(Number.isNaN(run.levelPct));
  }
});

test('relay revisions reject mixed-state batches, including ON -> OFF transitions', () => {
  const body = source.match(/bool setOutput\(bool light, bool on\) \{([\s\S]*?)\r?\n\}/)?.[1];
  const state = vm.createContext({ armed: true, lightOn: false, filterOn: false, relayRevision: 0,
    LIGHT_PIN: 16, FILTER_PIN: 17, HIGH: 1, LOW: 0, digitalWrite() {}, Serial: { println() {}, printf() {} } });
  vm.runInContext(`function setOutput(light, on) {${body}}`, state);
  state.setOutput(true, true);
  assert.equal(state.relayRevision, 1);
  state.setOutput(true, true);
  assert.equal(state.relayRevision, 1, 'repeating an unchanged command is not a transition');
  state.setOutput(true, false);
  assert.equal(state.relayRevision, 2, 'returning to OFF must not make an older OFF sample current again');
  const gate = source.match(/  if \(sampleRelayRevision != relayRevision\) \{\s*telemetrySamplePending = false;\s*return true;\s*\}/)?.[0];
  assert.ok(gate);
  for (const revision of [0, 1, 2]) {
    const run = new Function('sampleRelayRevision', 'relayRevision', `let telemetrySamplePending = true; ${gate} return false;`);
    assert.equal(run(0, revision), revision !== 0);
  }
});

test('temperature, turbidity, power and AQ2 remain unchanged by AQ1 compensation/calibration', () => {
  assert.match(source, /FULL_CM = 22\.4134f/);
  assert.match(source, /EMPTY_CM = 27\.0f/);
  assert.match(source, /turbV = voltage\(TURB_PIN\)/);
  assert.match(source, /powerSignalV = voltage\(POWER_PIN\)/);
  const aq2 = readFileSync(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8');
  assert.doesNotMatch(aq2, /LoadCompensation|relayRevision/);
});
