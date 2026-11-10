import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { evaluateWaterLevelProfile, getWaterLevelControl, resolveWaterLevel, AQUARIUM1_DEVICE_ID } from '../../src/utils/waterLevelProfile.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { evaluateAquariumReading, assessAquarium } from '../../src/utils/conditionAssessment.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { evaluateTelemetryValidity, toConditionSummary } from '../../src/utils/monitoringAssessmentCore.ts';
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
const reading = { temperatureC: 23, waterLevelPercent: 50, waterLevelReadingValid: true, waterLevelTargetHeightCm: 6, updatedAt: now, online: true };

test('target is volume in cubic cm divided by internal base area', () => {
  const result = evaluateWaterLevelProfile(profile);
  assert.equal(result.targetHeightCm, 6);
  assert.deepEqual(getWaterLevelControl(profile), result.profile);
  assert.equal(getWaterLevelControl({ ...profile, deviceId: 'OTHER' }), null);
  assert.equal(evaluateWaterLevelProfile({ ...profile, workingWaterVolumeLiters: 10.5 }).targetHeightCm, 7);
});
test('unfinished, malformed, impossible and blind-zone profiles never yield a target', () => {
  for (const value of [undefined, null, 0, -1, NaN, Infinity, '50', true]) {
    assert.equal(evaluateWaterLevelProfile({ ...profile, tankLengthCm: value }).profile, null);
  }
  assert.match(evaluateWaterLevelProfile({ tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10 }).message, /exceeds tank capacity/);
  assert.match(evaluateWaterLevelProfile({ ...profile, workingWaterVolumeLiters: 15 }).message, /blind zone/);
});
test('new profile must match device target, and legacy 20.2 span cannot masquerade as profile level', () => {
  assert.equal(resolveWaterLevel(profile, reading).valid, true);
  assert.equal(resolveWaterLevel(profile, { waterLevelPercent: 90 }).valid, false);
  assert.equal(resolveWaterLevel({ ...profile, workingWaterVolumeLiters: 10.5 }, reading).valid, false);
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
test('profile edits hide obsolete levels without hiding temperature or producing water-level maintenance', () => {
  const invalid = { ...profile, tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10 };
  const snapshot = getFreshTelemetrySnapshot(reading, now, invalid);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
  assert.match(snapshot.waterLevelMessage, /capacity/);
  const assessment = assessAquarium({ aquarium: { ...invalid, minTemp: 20, maxTemp: 24, minLevel: 70 },
    reading, source: 'live', now, ruleConfig: seedRuleConfig() });
  assert.equal(assessment.parameters.find(p => p.parameter === 'waterLevel')?.severity, 'unavailable');
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

test('new shared engine excludes invalid profile levels without suppressing valid temperature', () => {
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

test('a fresh old-geometry server summary cannot override current profile validity', () => {
  const config = seedRuleConfig();
  const aquarium = { ...profile, species: ['Goldfish'], minTemp: 20, maxTemp: 24, minLevel: 70 };
  const result = evaluateAquariumReading(aquarium, reading, config);
  const summary = { ...toConditionSummary(result, now, now), waterLevelTargetHeightCm: 6 };
  const options = { aquarium, reading, source: 'live', now, ruleConfig: config,
    engineState: { condition: summary, cleaning: null, bioloadLevel: null } };
  assert.equal(assessAquarium(options).origin, 'server');
  assert.equal(assessAquarium({ ...options, aquarium: { ...aquarium, workingWaterVolumeLiters: 10.5 } }).origin, 'client');
  assert.equal(assessAquarium({ ...options, engineState: { ...options.engineState, condition: { ...summary, waterLevelTargetHeightCm: 5 } } }).origin, 'client');
  if (hasMobile) assert.deepEqual(assessTelemetry(aquarium, reading, 'live', now, config, options.engineState), assessAquarium(options));
});

test('profile edits synchronize only geometry without creating incomplete control records', () => {
  for (const relative of ['src/services/deviceService.ts', ...(hasMobile ? ['../smart-aqua-mobile/src/services/firebase-service.ts'] : [])]) {
    const source = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    assert.match(source, relative.startsWith('src/')
      ? /await update\(control, \{ waterLevelProfile: evaluateWaterLevelProfile/
      : /await update\(control, \{ waterLevelProfile: getWaterLevelControl/);
    assert.match(source, /if \(!\(await get\(control\)\)\.exists\(\)\) return/);
    assert.match(source, /profile saved, but water-level device synchronization failed|assertRealtimeDeviceAccess/);
  }
});
