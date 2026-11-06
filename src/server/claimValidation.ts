import {
  normalizeDeviceId, validateDeviceId,
} from '../services/deviceClaimContracts.ts';

export class ClaimError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function deniedClaim(): never {
  throw new ClaimError(409, 'claim-unavailable',
    'Unable to claim this device. Check the enclosure ID, or contact the device provider.');
}

export function parseClaimInput(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ClaimError(400, 'invalid-input', 'Invalid device claim request.');
  }
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !['deviceId', 'profile'].includes(key))) {
    throw new ClaimError(400, 'invalid-input', 'Unexpected claim fields.');
  }
  const deviceId = typeof input.deviceId === 'string' ? normalizeDeviceId(input.deviceId) : '';
  const credentialError = validateDeviceId(deviceId);
  if (credentialError) throw new ClaimError(400, 'invalid-input', credentialError);
  if (!input.profile || typeof input.profile !== 'object' || Array.isArray(input.profile)) {
    throw new ClaimError(400, 'invalid-profile', 'Complete the aquarium profile.');
  }
  const p = input.profile as Record<string, unknown>;
  const allowed = ['name', 'species', 'tankType', 'tankLengthCm', 'tankWidthCm', 'tankHeightCm',
    'workingWaterVolumeLiters', 'hasFiltrationSystem', 'fishCount', 'fishWeightsG',
    'minTemp', 'maxTemp', 'minPh', 'maxPh', 'minLevel', 'minQuality'];
  const numeric = ['tankLengthCm', 'tankWidthCm', 'tankHeightCm', 'workingWaterVolumeLiters',
    'fishCount', 'minTemp', 'maxTemp', 'minPh', 'maxPh', 'minLevel', 'minQuality'];
  const invalid = () => { throw new ClaimError(400, 'invalid-profile', 'Check the aquarium profile values.'); };
  if (Object.keys(p).length !== allowed.length || Object.keys(p).some(key => !allowed.includes(key))) invalid();
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.trim().length > 120) invalid();
  if (p.tankType !== 'Freshwater' || !Array.isArray(p.species) || p.species.length !== 1 || p.species[0] !== 'Goldfish') invalid();
  if (typeof p.hasFiltrationSystem !== 'boolean') invalid();
  if (numeric.some(key => typeof p[key] !== 'number' || !Number.isFinite(p[key]))) invalid();
  const n = p as Record<string, number>;
  if (['tankLengthCm', 'tankWidthCm', 'tankHeightCm', 'workingWaterVolumeLiters'].some(key => n[key] <= 0)) invalid();
  // Resource limits, not water-quality thresholds.
  if (!Number.isInteger(n.fishCount) || n.fishCount < 1 || n.fishCount > 1000) invalid();
  if (!Array.isArray(p.fishWeightsG) || p.fishWeightsG.length !== n.fishCount ||
    p.fishWeightsG.some(weight => typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0)) invalid();
  if (n.minTemp > n.maxTemp || n.minPh < 0 || n.maxPh > 14 || n.minPh > n.maxPh ||
      n.minLevel < 0 || n.minLevel > 100 || n.minQuality < 0 || n.minQuality > 100) invalid();
  const profile: Record<string, unknown> = { ...p, name: (p.name as string).trim() };
  return { deviceId, profile };
}
