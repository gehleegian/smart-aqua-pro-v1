import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCurrentWaterVolume,
  calculateObservedWaterDecrease,
  calculateHistoricalWaterLoss,
} from '../../src/utils/waterVolumeCalculations.ts';
import { AQUARIUM1_DEVICE_ID } from '../../src/utils/waterLevelProfile.ts';

const profile = {
  deviceId: AQUARIUM1_DEVICE_ID,
  tankLengthCm: 50,
  tankWidthCm: 30,
  tankHeightCm: 25,
  workingWaterVolumeLiters: 9,
};
const telemetry = (waterLevelPercent, updatedAt) => ({
  waterLevelPercent,
  waterLevelReadingValid: true,
  waterLevelTargetHeightCm: 6,
  updatedAt,
});

test('validated profile-based percentage yields current volume and volume needed to reach the operational target', () => {
  assert.deepEqual(calculateCurrentWaterVolume(profile, telemetry(80, 1_000)), {
    status: 'available',
    measuredAt: 1_000,
    tankCapacityLiters: 37.5,
    operationalTargetLiters: 9,
    currentVolumeLiters: 7.2,
    volumeToOperationalTargetLiters: 1.8,
  });
});

test('missing, obsolete or invalid calibration never yields a volume estimate', () => {
  for (const [candidateProfile, candidateTelemetry] of [
    [profile, { ...telemetry(80, 1_000), waterLevelTargetHeightCm: undefined }],
    [profile, { ...telemetry(80, 1_000), waterLevelTargetHeightCm: 5 }],
    [profile, { ...telemetry(80, 1_000), waterLevelReadingValid: false }],
    [profile, telemetry(101, 1_000)],
    [{ ...profile, workingWaterVolumeLiters: 100 }, telemetry(80, 1_000)],
    [{ ...profile, tankLengthCm: 1e154, tankWidthCm: 1e154, tankHeightCm: 1e308, workingWaterVolumeLiters: 9 }, telemetry(80, 1_000)],
  ]) {
    assert.equal(calculateCurrentWaterVolume(candidateProfile, candidateTelemetry).status, 'unavailable');
  }
});

test('Aquarium 2 uses its own synchronized profile target, never an untagged fallback percentage', () => {
  const aquarium2 = { ...profile, deviceId: 'AQUARIUM-2' };
  assert.equal(calculateCurrentWaterVolume(aquarium2, telemetry(80, 1_000)).status, 'available');
  assert.equal(calculateCurrentWaterVolume(aquarium2, { ...telemetry(80, 1_000), waterLevelTargetHeightCm: undefined }).status, 'unavailable');
  assert.equal(calculateCurrentWaterVolume(aquarium2, { ...telemetry(80, 1_000), waterLevelTargetHeightCm: 5 }).status, 'unavailable');
});

test('two compatible observations yield net observed decrease and a daily rate, never an evaporation claim', () => {
  const result = calculateObservedWaterDecrease(profile, telemetry(90, 1_000), telemetry(80, 86_401_000));
  assert.deepEqual(result, {
    status: 'available',
    from: 1_000,
    to: 86_401_000,
    observedDecreaseLiters: 0.9,
    averageObservedDecreaseLitersPerDay: 0.9,
  });
  assert.equal(Object.hasOwn(result, 'evaporation'), false);
});

test('level increases and non-increasing timestamps are insufficient for a water-decrease rate', () => {
  assert.equal(calculateObservedWaterDecrease(profile, telemetry(80, 1_000), telemetry(90, 86_401_000)).status, 'unavailable');
  assert.equal(calculateObservedWaterDecrease(profile, telemetry(90, 1_000), telemetry(80, 1_000)).status, 'unavailable');
});

test('current volume rejects stale and future readings when evaluated at a known time', () => {
  assert.equal(calculateCurrentWaterVolume(profile, telemetry(80, 1_000), 61_001).status, 'unavailable');
  assert.equal(calculateCurrentWaterVolume(profile, telemetry(80, 2_000), 1_000).status, 'unavailable');
  assert.equal(calculateCurrentWaterVolume(profile, telemetry(80, 1_000), 61_000).status, 'available');
});

test('historical loss uses synchronized consecutive samples and actual timestamps', () => {
  const samples = Array.from({ length: 289 }, (_, index) =>
    telemetry(90 - index / 28.8, 1_000 + index * 300_000));
  assert.deepEqual(calculateHistoricalWaterLoss(profile, samples), {
    status: 'available', from: 1_000, to: 86_401_000,
    observedDecreaseLiters: 0.9, averageObservedDecreaseLitersPerDay: 0.9,
  });
  for (const interrupted of [
    samples.map((sample, index) => index === 100 ? telemetry(95, sample.updatedAt) : sample),
    samples.filter((_, index) => index !== 100),
    samples.map((sample, index) => index === 100 ? { ...sample, waterLevelTargetHeightCm: undefined } : sample),
    samples.map((sample, index) => index === 100 ? { ...sample, waterLevelReadingValid: false } : sample),
  ]) assert.equal(calculateHistoricalWaterLoss(profile, interrupted).status, 'unavailable');
  assert.equal(calculateHistoricalWaterLoss(profile, samples.slice(0, 1)).status, 'unavailable');
  assert.equal(calculateHistoricalWaterLoss(profile, samples.slice(0, 100)).status, 'unavailable');
  assert.equal(calculateHistoricalWaterLoss({ ...profile, deviceId: 'AQUARIUM-2' }, samples).status, 'available');
});
