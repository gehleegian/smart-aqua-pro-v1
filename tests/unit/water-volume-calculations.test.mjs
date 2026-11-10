import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateCurrentWaterVolume,
  calculateObservedWaterDecrease,
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
    currentVolumeLiters: 7.2,
    volumeToOperationalTargetLiters: 1.8,
  });
});

test('missing, obsolete, unsupported or invalid profile inputs never yield a volume estimate', () => {
  for (const [candidateProfile, candidateTelemetry] of [
    [{ ...profile, deviceId: 'OTHER' }, telemetry(80, 1_000)],
    [profile, { ...telemetry(80, 1_000), waterLevelTargetHeightCm: 5 }],
    [profile, { ...telemetry(80, 1_000), waterLevelReadingValid: false }],
    [profile, telemetry(101, 1_000)],
    [{ ...profile, workingWaterVolumeLiters: 100 }, telemetry(80, 1_000)],
  ]) {
    assert.equal(calculateCurrentWaterVolume(candidateProfile, candidateTelemetry).status, 'unavailable');
  }
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
