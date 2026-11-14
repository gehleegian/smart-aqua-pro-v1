/** Owner-confirmed installed hardware, 14 November 2026.
 * IDs match the existing Aquarium 1/2 firmware enclosure identities.
 * Never use this as a default for unregistered or future devices.
 * This records quantities, not sensor health or successful hardware testing.
 */
import { confirmedHardware, EQUIPMENT_OPTIONS } from '../utils/hardwareInventory.ts';
const inventory = confirmedHardware('SAQ-7K3M-9R2X')!;
const aquariumHardware = {
  sensors: inventory.sensors,
  equipment: EQUIPMENT_OPTIONS.filter(option => inventory.equipment.includes(option.type)).map(option => option.label),
};

export const CONFIRMED_DEVICE_HARDWARE = {
  'SAQ-7K3M-9R2X': aquariumHardware,
  'SAQ-HGCA-SJRS': aquariumHardware,
} as const;
