// Shared, secret-free API contract. Never import server/Admin SDK modules here.
import type { AquariumUpdatePayload } from '../types/aquariumManagement';

export type DeviceClaimInput = {
  deviceId: string;
  profile: AquariumUpdatePayload;
};

export type DeviceClaimResult = {
  status: 'claimed';
  aquariumId: string;
  deviceId: string;
};

export function normalizeDeviceId(value: string) {
  return value.trim().toUpperCase();
}

export function validateDeviceId(deviceId: string) {
  if (!/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(normalizeDeviceId(deviceId))) {
    return 'Enter the device ID printed on your enclosure, such as SAQ-7K3M-9R2X.';
  }
  return '';
}
