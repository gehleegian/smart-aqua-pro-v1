import {
  evaluateWaterLevelProfile,
  type LevelProfileInput,
} from './waterLevelProfile.ts';
import { TELEMETRY_STALE_MS } from './monitoringAssessmentCore.ts';

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
 * Converts a synchronized profile-based level into an operational
 * volume estimate. This is geometry-derived software output, not a physically
 * calibrated or certified volume measurement. `volumeToOperationalTargetLiters`
 * is not labelled a safe refill quantity because no overflow/headroom sensor or
 * refill-event contract exists.
 */
export function calculateCurrentWaterVolume(
  profile: LevelProfileInput,
  observation: WaterLevelObservation,
  now?: number
): Unavailable | {
  status: 'available';
  measuredAt: number;
  tankCapacityLiters: number;
  operationalTargetLiters: number;
  currentVolumeLiters: number;
  volumeToOperationalTargetLiters: number;
} {
  const setup = evaluateWaterLevelProfile(profile);
  if (!setup.profile) return { status: 'unavailable', reason: setup.message };
  const tankCapacityLiters = setup.profile.tankLengthCm * setup.profile.tankWidthCm * setup.profile.tankHeightCm / 1000;
  if (!Number.isFinite(tankCapacityLiters)) {
    return { status: 'unavailable', reason: 'Tank dimensions produce an invalid capacity.' };
  }
  if (observation.waterLevelReadingValid === false ||
      typeof observation.waterLevelPercent !== 'number' || !Number.isFinite(observation.waterLevelPercent) ||
      observation.waterLevelPercent < 0 || observation.waterLevelPercent > 100 ||
      typeof observation.waterLevelTargetHeightCm !== 'number' ||
      !Number.isFinite(observation.waterLevelTargetHeightCm) ||
      Math.abs(observation.waterLevelTargetHeightCm - setup.targetHeightCm!) > 0.0001) {
    return { status: 'unavailable', reason: 'A valid synchronized profile-based water-level reading is required.' };
  }
  if (typeof observation.updatedAt !== 'number' || !Number.isFinite(observation.updatedAt)) {
    return { status: 'unavailable', reason: 'A valid reading timestamp is required.' };
  }
  if (now !== undefined && (!Number.isFinite(now) || observation.updatedAt > now ||
      now - observation.updatedAt > TELEMETRY_STALE_MS)) {
    return { status: 'unavailable', reason: 'Water-level telemetry is stale or has an invalid timestamp.' };
  }
  const fraction = (observation.waterLevelPercent as number) / 100;
  const currentVolumeLiters = roundLiters(setup.profile.workingWaterVolumeLiters * fraction);
  return {
    status: 'available',
    measuredAt: observation.updatedAt,
    tankCapacityLiters: roundLiters(tankCapacityLiters),
    operationalTargetLiters: setup.profile.workingWaterVolumeLiters,
    currentVolumeLiters,
    volumeToOperationalTargetLiters: roundLiters(setup.profile.workingWaterVolumeLiters - currentVolumeLiters),
  };
}

/** A continuous window of sampled, profile-matched measurements only. */
export function calculateHistoricalWaterLoss(
  profile: LevelProfileInput,
  observations: WaterLevelObservation[]
): ReturnType<typeof calculateObservedWaterDecrease> {
  if (observations.length < 3) {
    return { status: 'unavailable', reason: 'At least three historical water-level measurements are required.' };
  }
  const volumes = observations.map((observation) => calculateCurrentWaterVolume(profile, observation));
  const invalid = volumes.find((volume) => volume.status === 'unavailable');
  if (invalid?.status === 'unavailable') return invalid;
  const valid = volumes as Extract<(typeof volumes)[number], { status: 'available' }>[];
  // The ingest samples at five-minute intervals. Gaps reaching two scheduled
  // intervals may conceal a refill or water change and cannot be bridged.
  for (let index = 1; index < valid.length; index += 1) {
    const gap = valid[index].measuredAt - valid[index - 1].measuredAt;
    if (gap <= 0 || gap >= 10 * 60_000) {
      return { status: 'unavailable', reason: 'Historical samples have an irregular or missing interval.' };
    }
    if (valid[index].currentVolumeLiters > valid[index - 1].currentVolumeLiters) {
      return { status: 'unavailable', reason: 'A level increase may indicate a refill or water change.' };
    }
  }
  if (valid.at(-1)!.measuredAt - valid[0].measuredAt < 86_400_000) {
    return { status: 'unavailable', reason: 'A full day of continuous historical measurements is required for a daily estimate.' };
  }
  return calculateObservedWaterDecrease(profile, observations[0], observations.at(-1)!);
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
