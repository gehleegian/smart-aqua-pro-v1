import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { evaluateWaterLevelProfile, getWaterLevelControl, resolveWaterLevel, AQUARIUM1_DEVICE_ID } from '../../src/utils/waterLevelProfile.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { evaluateAquariumReading, assessAquarium, getEffectiveThresholds } from '../../src/utils/conditionAssessment.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { evaluateTelemetryValidity, toConditionSummary, assessmentConfigurationKey } from '../../src/utils/monitoringAssessmentCore.ts';
const mobileRoot = new URL('../../../smart-aqua-mobile/', import.meta.url);
const hasMobile = existsSync(new URL('src/utils/waterLevelProfile.ts', mobileRoot));
let mapTelemetry, assessTelemetry, mobileSnapshot;
if (hasMobile) {
  ({ mapTelemetry } = await import(new URL('src/utils/device-telemetry-parser.ts', mobileRoot).href));
  ({ assessTelemetry } = await import(new URL('src/utils/monitoring-assessment.ts', mobileRoot).href));
  ({ getFreshTelemetrySnapshot: mobileSnapshot } = await import(new URL('src/utils/device-telemetry.ts', mobileRoot).href));
}
const profile = { deviceId: AQUARIUM1_DEVICE_ID, tankLengthCm: 50, tankWidthCm: 30, tankHeightCm: 25, workingWaterVolumeLiters: 9 };
const now = 1794000000000;
const reading = { temperatureC: 23, waterLevelPercent: 50, waterLevelReadingValid: true, updatedAt: now, online: true };

test('optional geometry helper is retained but no longer sent to device control', () => {
  const result = evaluateWaterLevelProfile(profile);
  assert.equal(result.targetHeightCm, 6);
  assert.equal(getWaterLevelControl(profile), null);
  assert.equal(getWaterLevelControl({ ...profile, deviceId: 'OTHER' }), null);
  assert.equal(evaluateWaterLevelProfile({ ...profile, workingWaterVolumeLiters: 10.5 }).targetHeightCm, 7);
});
test('unfinished, malformed, impossible and submerged-sensor targets never yield a target', () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity, '50', true]) {
    assert.equal(evaluateWaterLevelProfile({ ...profile, tankLengthCm: value }).profile, null);
  }
  assert.match(evaluateWaterLevelProfile({ tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10 }).message, /exceeds tank capacity/);
  assert.equal(evaluateWaterLevelProfile({ ...profile, workingWaterVolumeLiters: 15 }).targetHeightCm, 10);
  assert.match(evaluateWaterLevelProfile({ ...profile, tankHeightCm: 40, workingWaterVolumeLiters: 41 }).message, /mounting height/);
});

test('both registered devices use fixed-calibration telemetry independent of dimensions or litres', () => {
  for (const deviceId of [AQUARIUM1_DEVICE_ID, 'SAQ-TEST-0002']) {
    const tank = { ...profile, deviceId, tankLengthCm: 60.96, tankWidthCm: 25.4, tankHeightCm: 24.13, workingWaterVolumeLiters: 19.9 };
    const raw = { ...reading, waterLevelPercent: (27 - 22.1) / (27 - 20.2) * 100 };
    assert.equal(getWaterLevelControl(tank), null);
    const resolved = resolveWaterLevel(tank, raw);
    assert.equal(resolved.valid, true);
    assert.equal(resolved.message, 'Live telemetry');
    assert.ok(raw.waterLevelPercent > 72 && raw.waterLevelPercent < 73);
    assert.equal(resolveWaterLevel(tank, { ...raw, waterLevelReadingValid: false, waterLevelPercent: undefined }).valid, false);
    assert.equal(resolveWaterLevel({ deviceId }, raw).valid, true);
    assert.equal(resolveWaterLevel({ ...tank, workingWaterVolumeLiters: 1 }, raw).valid, true);
    const web = getFreshTelemetrySnapshot(normalizeTelemetry(raw), now, tank);
    assert.equal(web.hasFreshWaterLevelTelemetry, true);
    assert.equal(web.waterLevelMessage, 'Live telemetry');
    if (hasMobile) {
      const mobile = mobileSnapshot(mapTelemetry(raw), now, tank);
      assert.equal(mobile.waterLevelPercent, web.waterLevelPercent);
      assert.equal(mobile.waterLevelMessage, web.waterLevelMessage);
    }
  }
});
test('fixed level needs no geometry metadata; old volume-based firmware is not relabelled', () => {
  assert.equal(resolveWaterLevel(profile, reading).valid, true);
  assert.equal(resolveWaterLevel(profile, { waterLevelPercent: 90 }).valid, true);
  assert.equal(resolveWaterLevel({ ...profile, workingWaterVolumeLiters: 10.5 }, reading).valid, true);
  assert.equal(resolveWaterLevel(profile, { ...reading, waterLevelTargetHeightCm: 6 }).valid, false);
  assert.equal(resolveWaterLevel(profile, { ...reading, waterLevelReadingValid: false }).valid, false);
  assert.equal(resolveWaterLevel(undefined, { waterLevelPercent: 0 }).valid, true);
});
test('explicit invalid level keeps other telemetry live without inventing zero percent', () => {
  const partial = { ...reading, waterLevelPercent: undefined, waterLevelReadingValid: false };
  for (const parse of [normalizeTelemetry, ...(hasMobile ? [mapTelemetry] : [])]) {
    const parsed = parse(partial);
    assert.equal(parsed.waterLevelPercent, undefined);
    assert.equal(parsed.waterLevelReadingValid, false);
  }
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry(partial), now, profile);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
  assert.ok(Number.isNaN(snapshot.waterLevelPercent));
  assert.equal(normalizeTelemetry({ ...partial, waterLevelReadingValid: undefined }), null);
  assert.equal(getFreshTelemetrySnapshot(partial, now+60001, profile), null);
});
test('incomplete aquarium dimensions no longer hide valid fixed-calibration readings', () => {
  const invalid = { ...profile, tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10 };
  const snapshot = getFreshTelemetrySnapshot(reading, now, invalid);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, true);
  assert.equal(snapshot.waterLevelPercent, 50);
  const assessment = assessAquarium({ aquarium: { ...invalid, species: ['Goldfish'], minTemp: 20, maxTemp: 24, minLevel: 70 },
    reading, source: 'live', now, ruleConfig: seedRuleConfig({ approved: true }) });
  assert.notEqual(assessment.parameters.find(p => p.parameter === 'waterLevel')?.severity, 'unavailable');
});
test('shared profile contract stays byte-identical on web/mobile; firmware fixes empty at 27', () => {
  const root = new URL('../../', import.meta.url);
  const web = readFileSync(new URL('src/utils/waterLevelProfile.ts', root), 'utf8');
  if (hasMobile) {
    const mobile = readFileSync(new URL('../smart-aqua-mobile/src/utils/waterLevelProfile.ts', root), 'utf8');
    assert.equal(web.replaceAll('\r\n','\n'), mobile.replaceAll('\r\n','\n'));
  }
  const server = readFileSync(new URL('functions/src/shared/waterLevelProfile.ts', root), 'utf8');
  assert.equal(web.replaceAll('\r\n','\n'), server.replaceAll('\r\n','\n'));
  const firmware = readFileSync(new URL('firmware/Aquarium1Device/WaterLevel.h', root), 'utf8');
  assert.match(firmware, /EMPTY_CM = 27\.0f/);
  assert.match(firmware, /liters \* 1000\.0f \/ \(length \* width\)/);
});

test('both actual upload folders disable profile level and preserve fixed references and echo minimum', () => {
  for (const device of [1, 2]) {
    for (const root of [new URL(`../../firmware/Aquarium${device}Device/`, import.meta.url),
      new URL(`../../../Aquarium${device}Device/`, import.meta.url)]) {
      if (!existsSync(root)) continue;
      assert.match(readFileSync(new URL('Config.h', root), 'utf8'), /PROFILE_LEVEL_ENABLED = false/);
      const sketch = readFileSync(new URL(`Aquarium${device}Device.ino`, root), 'utf8');
      assert.match(sketch, /EMPTY_CM = 27\.0f/);
      assert.equal(Number(sketch.match(/FULL_CM = ([\d.]+)f/)?.[1]), device === 1 ? 22.4134 : 20.2);
      assert.match(sketch, /\(EMPTY_CM - distanceCm\) \* 100\.0f\s*\/\s*\(EMPTY_CM - FULL_CM\)/);
      assert.match(sketch, /levelValid\s*=\s*isfinite\(distanceCm\)\s*&&\s*distanceCm >= 20\.0f\s*&&\s*distanceCm <= 800\.0f/);
      const helper = readFileSync(new URL('WaterLevel.h', root), 'utf8');
      assert.match(helper, /MIN_CM = 20\.0f/);
      assert.match(helper, /target < EMPTY_CM/);
      assert.doesNotMatch(helper, /EMPTY_CM - target >= MIN_CM/);
      assert.match(helper, /distance >= MIN_CM/);
    }
  }
});

test('web and mobile keep other sensor validity and matching profile water levels in parity', { skip: !hasMobile }, () => {
  for (const patch of [{}, { waterLevelReadingValid: false, waterLevelPercent: undefined },
    { waterLevelReadingValid: false, waterLevelPercent: 2 }, { waterLevelTargetHeightCm: 5 },
    { waterLevelTargetHeightCm: undefined }, { waterLevelPercent: 101 }]) {
    const raw = { ...reading, ...patch };
    const web = getFreshTelemetrySnapshot(normalizeTelemetry(raw), now, profile);
    const mobile = mobileSnapshot(mapTelemetry(raw), now, profile);
    assert.equal(web.hasFreshWaterLevelTelemetry, mobile.hasFreshWaterLevelTelemetry);
    assert.equal(web.waterLevelMessage, mobile.waterLevelMessage);
    assert.equal(web.waterLevelPercent, mobile.waterLevelPercent);
    assert.deepEqual(web.validity, mobile.validity);
    assert.equal(web.hasFreshTemperatureTelemetry, true);
  }
});

test('active fixed formula gives the chosen endpoints and never turns invalid echoes into full', () => {
  for (const device of [1, 2]) {
    for (const root of [new URL(`../../firmware/Aquarium${device}Device/`, import.meta.url),
      new URL(`../../../Aquarium${device}Device/`, import.meta.url)]) {
      if (!existsSync(root)) continue;
      const source = readFileSync(new URL(`Aquarium${device}Device.ino`, root), 'utf8');
      const calculation = source.match(/levelValid\s*=\s*isfinite\(distanceCm\)[\s\S]*?(?=\s*if\s*\(PROFILE_LEVEL_ENABLED\))/)?.[0];
      assert.ok(calculation);
      // Execute only the existing pure formula as offline test fixtures, never telemetry.
      const calculate = new Function('distanceCm', 'EMPTY_CM', 'FULL_CM', 'isfinite', 'constrain', 'NAN',
        `let levelValid, levelPct; ${calculation.replace(/(?<=\d)f\b/g, '')}; return { levelValid, levelPct };`);
      const full = Number(source.match(/FULL_CM = ([\d.]+)f/)?.[1]);
      assert.equal(full, device === 1 ? 22.4134 : 20.2);
      const run = distance => calculate(distance, 27, full, Number.isFinite, (n, min, max) => Math.min(max, Math.max(min, n)), NaN);
      assert.equal(run(27).levelPct, 0);
      assert.equal(run(full).levelPct, 100);
      assert.equal(run(20).levelPct, 100);
      assert.ok(Math.abs(run((27 + full) / 2).levelPct - 50) < 0.0001);
      assert.ok(run(full + 1).levelPct < 90, 'must still detect lower water, not force 90-99%');
      for (const invalid of [NaN, Infinity, 0, 19.9, 801]) {
        assert.equal(run(invalid).levelValid, false);
        assert.ok(Number.isNaN(run(invalid).levelPct));
      }
    }
  }
});

test('shared engine excludes invalid echoes and former profile levels without suppressing temperature', () => {
  const config = seedRuleConfig({ approved: true });
  const aquarium = { ...profile, species: ['Goldfish'], minTemp: 20, maxTemp: 24, minLevel: 70 };
  for (const raw of [{ ...reading, waterLevelReadingValid: false }, { ...reading, waterLevelTargetHeightCm: 4 }]) {
    const result = evaluateAquariumReading(aquarium, raw, config);
    assert.equal(result.perParameter.find(p => p.parameter === 'waterLevelPercent').status, 'unavailable');
    assert.equal(result.perParameter.find(p => p.parameter === 'temperatureC').status, 'normal');
    assert.ok(result.matchedRules.filter(r => r.parameter === 'waterLevelPercent').every(r => r.ruleId === 'sensor_fault'));
    assert.equal(evaluateTelemetryValidity({ ...raw, waterLevelReadingValid: false }).waterLevel.status, 'invalid');
  }
});

test('former profile-mode summaries cannot override fixed readings; profile edits do not affect them', () => {
  const config = seedRuleConfig();
  const aquarium = { ...profile, species: ['Goldfish'], minTemp: 20, maxTemp: 24, minLevel: 70 };
  const result = evaluateAquariumReading(aquarium, reading, config);
  const summary = toConditionSummary(result, now, now, assessmentConfigurationKey(getEffectiveThresholds(aquarium, config), config.rules));
  const options = { aquarium, reading, source: 'live', now, ruleConfig: config,
    engineState: { condition: summary, cleaning: null, bioloadLevel: null } };
  assert.equal(assessAquarium(options).origin, 'server');
  assert.equal(assessAquarium({ ...options, aquarium: { ...aquarium, workingWaterVolumeLiters: 10.5 } }).origin, 'server');
  assert.equal(assessAquarium({ ...options, engineState: { ...options.engineState, condition: { ...summary, waterLevelTargetHeightCm: 5 } } }).origin, 'client');
  if (hasMobile) assert.deepEqual(assessTelemetry(aquarium, reading, 'live', now, config, options.engineState), assessAquarium(options));
});

test('profile synchronization remains disabled without creating control records or equipment commands', () => {
  for (const relative of ['src/services/deviceService.ts', ...(hasMobile ? ['../smart-aqua-mobile/src/services/firebase-service.ts'] : [])]) {
    const source = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    assert.match(source, relative.startsWith('src/')
      ? /await update\(control, \{\s*waterLevelProfile: evaluateWaterLevelProfile/
      : /await update\(control, \{ waterLevelProfile: getWaterLevelControl/);
    assert.match(source, /if \(!\(await get\(control\)\)\.exists\(\)\) return/);
    assert.match(source, /profile saved, but water-level device synchronization failed|assertRealtimeDeviceAccess/);
  }
});
