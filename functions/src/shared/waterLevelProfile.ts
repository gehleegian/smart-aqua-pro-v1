// Canonical web/mobile profile-level contract. Distances and dimensions are cm.
export const AQUARIUM1_DEVICE_ID = 'SAQ-7K3M-9R2X';
export const EMPTY_DISTANCE_CM = 27;
export const MIN_DISTANCE_CM = 20; // Existing assumed sensor limit, not newly calibrated.
export type WaterLevelProfile = {
  tankLengthCm: number; tankWidthCm: number; tankHeightCm: number;
  workingWaterVolumeLiters: number;
};
export type LevelProfileInput = Partial<WaterLevelProfile> & { deviceId?: string };
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function evaluateWaterLevelProfile(profile: LevelProfileInput) {
  const { tankLengthCm: l, tankWidthCm: w, tankHeightCm: h, workingWaterVolumeLiters: v } = profile;
  if (![l, w, h, v].every(positive))
    return { profile: null, targetHeightCm: null, message: 'Water-level setup incomplete: save internal dimensions and operational volume.' };
  const target = v! * 1000 / (l! * w!);
  if (!positive(target) || target > h!)
    return { profile: null, targetHeightCm: null, message: 'Water-level setup incomplete: operational volume exceeds tank capacity.' };
  if (EMPTY_DISTANCE_CM - target < MIN_DISTANCE_CM)
    return { profile: null, targetHeightCm: null, message: 'Water-level target is inside the ultrasonic blind zone; mounting or sensor must change.' };
  return { profile: { tankLengthCm: l!, tankWidthCm: w!, tankHeightCm: h!, workingWaterVolumeLiters: v! },
    targetHeightCm: target, message: '' };
}

export function getWaterLevelControl(profile: LevelProfileInput) {
  return profile.deviceId === AQUARIUM1_DEVICE_ID ? evaluateWaterLevelProfile(profile).profile : null;
}

export function resolveWaterLevel(profile: LevelProfileInput | undefined, telemetry: {
  waterLevelPercent?: unknown; waterLevelReadingValid?: unknown; waterLevelTargetHeightCm?: unknown;
}) {
  if (profile?.deviceId === AQUARIUM1_DEVICE_ID) {
    const setup = evaluateWaterLevelProfile(profile);
    if (!setup.profile) return { valid: false, message: setup.message };
    const reportedTarget = telemetry.waterLevelTargetHeightCm;
    // Only numerical float/JSON round-trip tolerance, not a water-quality margin.
    if (typeof reportedTarget !== 'number' || !Number.isFinite(reportedTarget) ||
        Math.abs(reportedTarget - setup.targetHeightCm!) > 0.0001)
      return { valid: false, message: 'Waiting for device to synchronize the water-level profile.' };
  }
  const value = telemetry.waterLevelPercent;
  const valid = telemetry.waterLevelReadingValid !== false && typeof value === 'number' &&
    Number.isFinite(value) && value >= 0 && value <= 100;
  return { valid, message: valid ? 'Live telemetry' : 'No valid water-level echo or configuration.' };
}

// Keep all other sensors intact. Never let an obsolete/missing profile target
// reach threshold evaluation as a real water-level observation.
export function withWaterLevelProfile(profile: LevelProfileInput | undefined, reading: Record<string, unknown>) {
  return profile?.deviceId === AQUARIUM1_DEVICE_ID && !resolveWaterLevel(profile, reading).valid
    ? { ...reading, waterLevelReadingValid: false }
    : reading;
}

// A fresh server summary can still belong to the previous geometry. Fall back
// to the same client rules engine until the server confirms this target.
export function waterLevelSummaryMatches(profile: LevelProfileInput | undefined,
  reading: Record<string, unknown>, summary: { waterLevelTargetHeightCm?: unknown }) {
  if (profile?.deviceId !== AQUARIUM1_DEVICE_ID) return true;
  return resolveWaterLevel(profile, reading).valid &&
    typeof summary.waterLevelTargetHeightCm === 'number' &&
    typeof reading.waterLevelTargetHeightCm === 'number' &&
    Math.abs(summary.waterLevelTargetHeightCm - reading.waterLevelTargetHeightCm) <= 0.0001;
}
