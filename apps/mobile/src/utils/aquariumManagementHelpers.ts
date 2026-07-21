import type { Aquarium } from '../types/aquarium';
import type {
  AquariumCreatePayload,
  AquariumFormData,
  AquariumFormMode,
  AquariumOwnerGroup,
  AquariumUpdatePayload,
} from '../types/aquariumManagement';
import type { UserRole } from '@smartaqua/shared';

export function createEmptyAquariumForm(): AquariumFormData {
  return {
    name: '',
    species: '',
    bioload: 'low',
    minTemp: '',
    maxTemp: '',
    minLevel: '',
    minQuality: '',
  };
}

export function populateAquariumForm(aquarium: Aquarium): AquariumFormData {
  return {
    name: aquarium.name,
    species: aquarium.species.join(', '),
    bioload: aquarium.bioload,
    minTemp: String(aquarium.minTemp),
    maxTemp: String(aquarium.maxTemp),
    minLevel: String(aquarium.minLevel),
    minQuality: String(aquarium.minQuality),
  };
}

export function buildOwnerGroups(aquariums: Aquarium[]): AquariumOwnerGroup[] {
  const groupsMap = new Map<string, AquariumOwnerGroup>();

  for (const aquarium of aquariums) {
    const key = aquarium.ownerId || 'unknown';

    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        ownerId: aquarium.ownerId || '',
        ownerName: aquarium.ownerName || 'Unknown Owner',
        aquariums: [],
      });
    }

    groupsMap.get(key)?.aquariums.push(aquarium);
  }

  return Array.from(groupsMap.values()).sort((a, b) =>
    a.ownerName.localeCompare(b.ownerName)
  );
}

export function validateAquariumForm(formData: AquariumFormData) {
  const { name, species, minTemp, maxTemp, minLevel, minQuality } = formData;

  if (!name || !species || !minTemp || !maxTemp || !minLevel || !minQuality) {
    return 'Please fill in all fields.';
  }

  if (Number(minTemp) > Number(maxTemp)) {
    return 'Minimum temperature cannot be greater than maximum temperature.';
  }

  if (Number(minLevel) < 0 || Number(minLevel) > 100) {
    return 'Water level minimum must be between 0 and 100.';
  }

  if (Number(minQuality) < 0 || Number(minQuality) > 100) {
    return 'Water purity minimum (TDS percentage) must be between 0 and 100.';
  }

  return '';
}

function parseSpecies(speciesValue: string) {
  return speciesValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildAquariumCreatePayload(options: {
  formData: AquariumFormData;
  ownerId: string;
  ownerName: string;
}): AquariumCreatePayload {
  const { formData, ownerId, ownerName } = options;

  return {
    name: formData.name,
    species: parseSpecies(formData.species),
    bioload: formData.bioload,
    minTemp: Number(formData.minTemp),
    maxTemp: Number(formData.maxTemp),
    minLevel: Number(formData.minLevel),
    minQuality: Number(formData.minQuality),
    temp: Number(formData.minTemp),
    level: 100,
    quality: 100,
    feeder: 'Active',
    light: 'On',
    filter: 'Active',
    ownerId,
    ownerName,
  };
}

export function buildAquariumUpdatePayload(
  formData: AquariumFormData
): AquariumUpdatePayload {
  return {
    name: formData.name,
    species: parseSpecies(formData.species),
    bioload: formData.bioload,
    minTemp: Number(formData.minTemp),
    maxTemp: Number(formData.maxTemp),
    minLevel: Number(formData.minLevel),
    minQuality: Number(formData.minQuality),
  };
}

export function getAquariumsContextNote(userRole: UserRole) {
  return userRole === 'Admin'
    ? "Admin view: select an owner to view that user's aquariums"
    : 'User view: you can only see your own aquarium records';
}

export function getAquariumsEmptyMessage(userRole: UserRole) {
  return userRole === 'Admin'
    ? 'No aquariums found for the selected user.'
    : 'No aquariums found yet.';
}

export function getAquariumFormTitle(mode: AquariumFormMode) {
  return mode === 'edit' ? 'Edit Aquarium' : 'Add Aquarium';
}

export function getAquariumFormSubmitLabel(mode: AquariumFormMode, saving: boolean) {
  if (saving) {
    return mode === 'edit' ? 'Updating...' : 'Adding...';
  }

  return mode === 'edit' ? 'Update Aquarium' : 'Add Aquarium';
}

export function getDeleteErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Failed to delete aquarium.';
}

export function getSaveErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Failed to save aquarium.';
}

export function getLoadErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Failed to load aquariums.';
}
