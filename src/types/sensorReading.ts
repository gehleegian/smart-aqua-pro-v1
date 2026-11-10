import type { DevicePowerStatus } from './device';

export type SensorReadingSource = 'device' | 'web' | 'sync';

export interface SensorReadingDocument {
  reading_id?: string;
  aquarium_id: string;
  device_id: string;
  aquariumId: string;
  ownerId: string;
  ownerName: string;
  source: SensorReadingSource;
  dateKey: string;
  recordedAt: Date | string;
  recordedAtEpoch: number;
  ingestedAtEpoch: number;
  temperatureC: number;
  temperatureReadingValid?: boolean;
  waterLevelPercent: number;
  waterLevelReadingValid?: boolean;
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  waterQualityPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  turbidityReadingValid?: boolean;
  turbidityState?: 'Clear' | 'Cloudy' | 'Unknown';
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  lightState?: 'On' | 'Off';
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: DevicePowerStatus;
  ph?: number;
  phReadingValid?: boolean;
  online: boolean;
}
