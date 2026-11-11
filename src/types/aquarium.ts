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
  hasFiltrationSystem?: boolean;
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
  /** false when the doc has no legacy temp/level fields (show '--', not 0). */
  hasStoredReadings?: boolean;
  id: string;
  deviceId?: string;
  deviceUid?: string;
  name: string;
  species: string[];
  bioload?: BioloadLevel;
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
  minPh?: number;
  maxPh?: number;
  minLevel: number;
  minQuality: number;
  /** Owner-configured TDS limits in ppm; never converted from legacy purity %. */
  minTdsPpm?: number;
  maxTdsPpm?: number;
  ownerId: string;
  ownerName: string;
  tankType?: string;
  tankSizeLiters?: number;
  tankSizeCategory?: TankSizeCategory;
  tankLengthCm?: number;
  tankWidthCm?: number;
  tankHeightCm?: number;
  workingWaterVolumeLiters?: number;
  hasFiltrationSystem?: boolean;
  filtrationSetup?: string;
  filterCapacity?: string;
  fishCount?: number;
  fishWeightsG?: number[];
  totalFishBiomassG?: number;
  estimatedBioloadGL?: number;
  currentStatus?: AquariumConditionStatus;
  tankConfiguration?: TankConfiguration;
  fishProfiles?: FishSpeciesProfile[];
  automationSettings?: AutomationSettings;
  manualStatus?: ManualSystemStatus;
  /** Sprint 3: Firestore `status`; 'setup' after a claim until the wizard finishes. */
  setupStatus?: 'setup' | 'active';
  orgId?: string;
  caretakerIds?: string[];
  createdAt?: string;
  updatedAt?: string;
  directorySchemaVersion?: number;
  /** Optional explicit species config id (Firestore `species`); otherwise derived from `species`. */
  speciesId?: string;
  /** Admin-set per-aquarium threshold overrides (camelCase, per parameter). Wins over minTemp/maxTemp/... */
  thresholdOverrides?: Record<string, { min?: number; max?: number }>;
}

export interface AquariumDirectoryEntry {
  id: string;
  name: string;
  ownerId: string;
  ownerName: string;
  species: string[];
  bioload?: BioloadLevel;
  fishCount?: number;
  tankType?: string;
  tankSizeLiters?: number;
  tankLengthCm?: number;
  tankWidthCm?: number;
  tankHeightCm?: number;
  workingWaterVolumeLiters?: number;
  hasFiltrationSystem?: boolean;
  filtrationSetup?: string;
  createdAt?: string;
}
