import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateWaterLevelProfile, getWaterLevelControl, resolveWaterLevel, AQUARIUM1_DEVICE_ID } from '../../src/utils/waterLevelProfile.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { mapTelemetry } from '../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts';
import { assessTelemetry } from '../../../smart-aqua-mobile/src/utils/monitoring-assessment.ts';
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
  for (const parse of [normalizeTelemetry, mapTelemetry]) {
    const parsed = parse(partial);
    assert.equal(parsed.waterLevelPercent, undefined);
    assert.equal(parsed.waterLevelReadingValid, false);
  }
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry(partial), now, profile);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
  assert.ok(Number.isNaN(snapshot.waterLevelPercent));
  assert.equal(normalizeTelemetry({ ...partial, waterLevelReadingValid: undefined }), null);
  assert.equal(getFreshTelemetrySnapshot(partial, now+31000, profile), null);
});
test('profile edits hide obsolete levels without hiding temperature or producing water-level maintenance', () => {
  const invalid = { ...profile, tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10 };
  const snapshot = getFreshTelemetrySnapshot(reading, now, invalid);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
  assert.match(snapshot.waterLevelMessage, /capacity/);
  const assessment = assessTelemetry({ ...invalid, minTemp: 20, maxTemp: 24, minLevel: 70 }, reading, 'live', now);
  assert.equal(assessment.parameters.find(p => p.parameter === 'waterLevel')?.severity, 'unavailable');
});
test('shared profile contract stays byte-identical on web/mobile; firmware fixes empty at 27', () => {
  const root = new URL('../../', import.meta.url);
  const web = readFileSync(new URL('src/utils/waterLevelProfile.ts', root), 'utf8');
  const mobile = readFileSync(new URL('../smart-aqua-mobile/src/utils/waterLevelProfile.ts', root), 'utf8');
  assert.equal(web.replaceAll('\r\n','\n'), mobile.replaceAll('\r\n','\n'));
  const firmware = readFileSync(new URL('firmware/Aquarium1Device/WaterLevel.h', root), 'utf8');
  assert.match(firmware, /EMPTY_CM = 27\.0f/);
  assert.match(firmware, /liters \* 1000\.0f \/ \(length \* width\)/);
});

test('profile edits synchronize only geometry without creating incomplete control records', () => {
  for (const relative of ['src/services/deviceService.ts', '../smart-aqua-mobile/src/services/firebase-service.ts']) {
    const source = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    assert.match(source, /await update\(control, \{ waterLevelProfile: getWaterLevelControl/);
    assert.match(source, /if \(!\(await get\(control\)\)\.exists\(\)\) return/);
    assert.match(source, /profile saved, but water-level device synchronization failed|assertRealtimeDeviceAccess/);
  }
});
