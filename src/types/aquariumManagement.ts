import type { Aquarium } from './aquarium';
import type { UserData } from './user';

export type AquariumOwnerGroup = {
  ownerId: string;
  ownerName: string;
  aquariums: Aquarium[];
};

export type AquariumFormData = {
  name: string;
  species: string;
  bioload: 'low' | 'medium' | 'high';
  minTemp: string;
  maxTemp: string;
  minLevel: string;
  minQuality: string;
};

export type AquariumManagementData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};

export type AquariumUpdatePayload = Pick<
  Aquarium,
  'name' | 'species' | 'bioload' | 'minTemp' | 'maxTemp' | 'minLevel' | 'minQuality'
>;

export type AquariumCreatePayload = Omit<Aquarium, 'id'>;

export type AquariumFormMode = 'create' | 'edit';
