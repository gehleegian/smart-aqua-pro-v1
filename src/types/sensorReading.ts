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
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  waterQualityPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  ph?: number;
  online: boolean;
}
