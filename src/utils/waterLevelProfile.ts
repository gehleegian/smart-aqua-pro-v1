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
  waterLevelPercent?: number; waterLevelReadingValid?: boolean; waterLevelTargetHeightCm?: number;
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
