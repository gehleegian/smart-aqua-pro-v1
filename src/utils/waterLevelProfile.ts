// Shared water-level compatibility contract. Active firmware uses fixed
// 27.0 cm empty / 20.2 cm full, not aquarium dimensions or operational litres.
export const AQUARIUM1_DEVICE_ID = 'SAQ-7K3M-9R2X';
export const EMPTY_DISTANCE_CM = 27;
export const MIN_DISTANCE_CM = 20; // Existing assumed sensor limit, not newly calibrated.
export type WaterLevelProfile = {
  tankLengthCm: number; tankWidthCm: number; tankHeightCm: number;
  workingWaterVolumeLiters: number;
};
export type LevelProfileInput = Partial<WaterLevelProfile> & { deviceId?: string };
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

// Retain the optional profile API for compatibility, but do not activate it,
// synchronize geometry, or require dimensions for a current water-level reading.
export function usesProfileWaterLevel(profile: LevelProfileInput | undefined) {
  void profile;
  return false;
}

export function evaluateWaterLevelProfile(profile: LevelProfileInput) {
  const { tankLengthCm: l, tankWidthCm: w, tankHeightCm: h, workingWaterVolumeLiters: v } = profile;
  if (![l, w, h, v].every(positive))
    return { profile: null, targetHeightCm: null, message: 'Water-level setup incomplete: save internal dimensions and operational volume.' };
  const target = v! * 1000 / (l! * w!);
  if (!positive(target) || target > h!)
    return { profile: null, targetHeightCm: null, message: 'Water-level setup incomplete: operational volume exceeds tank capacity.' };
  if (target >= EMPTY_DISTANCE_CM)
    return { profile: null, targetHeightCm: null, message: 'Water-level setup invalid: target water reaches or exceeds the sensor mounting height.' };
  return { profile: { tankLengthCm: l!, tankWidthCm: w!, tankHeightCm: h!, workingWaterVolumeLiters: v! },
    targetHeightCm: target, message: '' };
}

export function getWaterLevelControl(profile: LevelProfileInput) {
  return usesProfileWaterLevel(profile) ? evaluateWaterLevelProfile(profile).profile : null;
}

export function resolveWaterLevel(profile: LevelProfileInput | undefined, telemetry: {
  waterLevelPercent?: unknown; waterLevelReadingValid?: unknown; waterLevelTargetHeightCm?: unknown;
}) {
  void profile;
  // Old profile-mode firmware must not silently be labelled as fixed calibration.
  // Fixed-mode snapshots replace the RTDB node and omit this optional metadata.
  if (telemetry.waterLevelTargetHeightCm != null)
    return { valid: false, message: 'Waiting for device to use the fixed water-level calibration.' };
  const value = telemetry.waterLevelPercent;
  const valid = telemetry.waterLevelReadingValid !== false && typeof value === 'number' &&
    Number.isFinite(value) && value >= 0 && value <= 100;
  return { valid, message: valid ? 'Live telemetry' : 'No valid water-level echo or configuration; water may be inside the sensor blind zone.' };
}

// Keep other sensors intact; exclude invalid echoes and old profile-mode values.
export function withWaterLevelProfile(profile: LevelProfileInput | undefined, reading: Record<string, unknown>) {
  return !resolveWaterLevel(profile, reading).valid
    ? { ...reading, waterLevelReadingValid: false }
    : reading;
}

// A server summary from the former volume-based mode must not override the
// fixed-calibration reading. Existing freshness checks still apply at the caller.
export function waterLevelSummaryMatches(profile: LevelProfileInput | undefined,
  reading: Record<string, unknown>, summary: { waterLevelTargetHeightCm?: unknown }) {
  return resolveWaterLevel(profile, reading).valid && summary.waterLevelTargetHeightCm == null;
}
