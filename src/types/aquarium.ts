import type { DevicePowerStatus } from './device';

export type BioloadLevel = 'low' | 'medium' | 'high';
export type AquariumConditionStatus = 'normal' | 'warning' | 'critical' | 'offline';
export type TankSizeCategory = 'small' | 'medium' | 'large';

export interface TankConfiguration {
  id?: string;
  tankConfigId?: string;
  aquariumId: string;
  tankType: string;
  tankSizeLiters: number;
  tankSizeCategory: TankSizeCategory;
  tankLengthCm?: number;
  tankWidthCm?: number;
  tankHeightCm?: number;
  workingWaterVolumeLiters?: number;
  filtrationSetup?: string;
  filterCapacity?: string;
  recommendedCapacity?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface FishSpeciesProfile {
  id?: string;
  speciesId?: string;
  aquariumId: string;
  speciesName: string;
  quantity: number;
  averageSizeCm?: number;
  preferredTemperatureMin?: number;
  preferredTemperatureMax?: number;
  preferredPhMin?: number;
  preferredPhMax?: number;
  preferredTdsMax?: number;
  preferredTurbidityMax?: number;
  preferredAmmoniaMax?: number;
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface AutomationSettings {
  enabled: boolean;
  feedingTimes: string[];
  lightOnTime: string;
  lightOffTime: string;
  filtrationStartTime: string;
  filtrationRuntimeHours: number;
}

export interface ManualSystemStatus {
  feeder: string;
  light: string;
  filter: string;
}

export interface Aquarium {
  id: string;
  name: string;
  species: string[];
  bioload: BioloadLevel;
  temp: number;
  level: number;
  tdsPpm?: number;
  ph?: number;
  turbidity?: number;
  powerStatus?: DevicePowerStatus;
  quality: number;
  feeder: string;
  light: string;
  filter: string;
  minTemp: number;
  maxTemp: number;
  minLevel: number;
  minQuality: number;
  ownerId: string;
  ownerName: string;
  tankType?: string;
  tankSizeLiters?: number;
  tankSizeCategory?: TankSizeCategory;
  tankLengthCm?: number;
  tankWidthCm?: number;
  tankHeightCm?: number;
  workingWaterVolumeLiters?: number;
  filtrationSetup?: string;
  filterCapacity?: string;
  fishCount?: number;
  currentStatus?: AquariumConditionStatus;
  tankConfiguration?: TankConfiguration;
  fishProfiles?: FishSpeciesProfile[];
  automationSettings?: AutomationSettings;
  manualStatus?: ManualSystemStatus;
}
