import {
  AQUARIUM1_DEVICE_ID,
  evaluateWaterLevelProfile,
  resolveWaterLevel,
  type LevelProfileInput,
} from './waterLevelProfile.ts';

type WaterLevelObservation = {
  waterLevelPercent?: unknown;
  waterLevelReadingValid?: unknown;
  waterLevelTargetHeightCm?: unknown;
  updatedAt?: unknown;
};

type Unavailable = { status: 'unavailable'; reason: string };

function roundLiters(value: number) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Converts a synchronized Aquarium 1 profile-based level into an operational
 * volume estimate. This is geometry-derived software output, not a physically
 * calibrated or certified volume measurement. `volumeToOperationalTargetLiters`
 * is not labelled a safe refill quantity because no overflow/headroom sensor or
 * refill-event contract exists.
 */
export function calculateCurrentWaterVolume(
  profile: LevelProfileInput,
  observation: WaterLevelObservation
): Unavailable | {
  status: 'available';
  measuredAt: number;
  currentVolumeLiters: number;
  volumeToOperationalTargetLiters: number;
} {
  if (profile.deviceId !== AQUARIUM1_DEVICE_ID) {
    return { status: 'unavailable', reason: 'Profile-based water-volume conversion is only configured for Aquarium 1.' };
  }
  const setup = evaluateWaterLevelProfile(profile);
  if (!setup.profile) return { status: 'unavailable', reason: setup.message };
  if (!resolveWaterLevel(profile, observation).valid) {
    return { status: 'unavailable', reason: 'A valid synchronized profile-based water-level reading is required.' };
  }
  if (typeof observation.updatedAt !== 'number' || !Number.isFinite(observation.updatedAt)) {
    return { status: 'unavailable', reason: 'A valid reading timestamp is required.' };
  }
  const fraction = (observation.waterLevelPercent as number) / 100;
  const currentVolumeLiters = roundLiters(setup.profile.workingWaterVolumeLiters * fraction);
  return {
    status: 'available',
    measuredAt: observation.updatedAt,
    currentVolumeLiters,
    volumeToOperationalTargetLiters: roundLiters(setup.profile.workingWaterVolumeLiters - currentVolumeLiters),
  };
}

/**
 * Calculates only net observed decrease between two compatible measurements.
 * It deliberately does not call the result evaporation or infer a leak.
 */
export function calculateObservedWaterDecrease(
  profile: LevelProfileInput,
  previous: WaterLevelObservation,
  current: WaterLevelObservation
): Unavailable | {
  status: 'available';
  from: number;
  to: number;
  observedDecreaseLiters: number;
  averageObservedDecreaseLitersPerDay: number;
} {
  const before = calculateCurrentWaterVolume(profile, previous);
  const after = calculateCurrentWaterVolume(profile, current);
  if (before.status === 'unavailable') return before;
  if (after.status === 'unavailable') return after;
  if (after.measuredAt <= before.measuredAt) {
    return { status: 'unavailable', reason: 'Observations must have increasing timestamps.' };
  }
  const observedDecreaseLiters = roundLiters(before.currentVolumeLiters - after.currentVolumeLiters);
  if (observedDecreaseLiters <= 0) {
    return { status: 'unavailable', reason: 'The observations do not show a net water-volume decrease.' };
  }
  const elapsedDays = (after.measuredAt - before.measuredAt) / 86_400_000;
  return {
    status: 'available',
    from: before.measuredAt,
    to: after.measuredAt,
    observedDecreaseLiters,
    averageObservedDecreaseLitersPerDay: roundLiters(observedDecreaseLiters / elapsedDays),
  };
}
