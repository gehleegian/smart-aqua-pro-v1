import type { Aquarium } from './aquarium';
import type { UserData } from './user';

export type AquariumOwnerGroup = {
  ownerId: string;
  ownerName: string;
  aquariums: Aquarium[];
};

export type AquariumFormData = {
  deviceId: string;
  name: string;
  species: string;
  tankType: string;
  tankSizeLiters?: string;
  tankSizeCategory?: 'small' | 'medium' | 'large';
  tankLengthCm: string;
  tankWidthCm: string;
  tankHeightCm: string;
  workingWaterVolumeLiters: string;
  hasFiltrationSystem: '' | 'yes' | 'no';
  filterCapacity?: string;
  fishCount: string;
  fishWeightsG: string[];
  minTemp: string;
  maxTemp: string;
  minPh: string;
  maxPh: string;
  minLevel: string;
  minQuality: string;
  minTdsPpm: string;
  maxTdsPpm: string;
};

export type AquariumManagementData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};

export type AquariumUpdatePayload = Pick<
  Aquarium,
  | 'name'
  | 'species'
  | 'tankType'
  | 'tankLengthCm'
  | 'tankWidthCm'
  | 'tankHeightCm'
  | 'workingWaterVolumeLiters'
  | 'fishCount'
  | 'fishWeightsG'
  | 'minTemp'
  | 'maxTemp'
  | 'minLevel'
  | 'minTdsPpm'
  | 'maxTdsPpm'
> & {
  minQuality?: number;
  hasFiltrationSystem: boolean;
  minPh: number;
  maxPh: number;
};

export type AquariumCreatePayload = Omit<Aquarium, 'id' | 'hasFiltrationSystem' | 'minQuality'> & {
  minQuality?: number;
  hasFiltrationSystem: boolean;
};

export type AquariumFormMode = 'create' | 'edit';
