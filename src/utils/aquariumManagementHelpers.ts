import type { Aquarium } from '../types/aquarium';
import type {
  AquariumCreatePayload,
  AquariumFormData,
  AquariumFormMode,
  AquariumOwnerGroup,
  AquariumUpdatePayload,
} from '../types/aquariumManagement';
import type { UserRole } from '../types/user';
import {
  calculateAquariumBioload,
  parseFishWeights,
  resizeFishWeights,
} from './aquariumProfileCalculations.ts';

export const CANONICAL_AQUARIUM_TYPE = 'Freshwater';
export const CANONICAL_FISH_SPECIES = 'Goldfish';
export const INDOOR_GOLDFISH_PRESET = {
  minTemp: '20',
  maxTemp: '24',
  minPh: '6.5',
  maxPh: '7.5',
  minLevel: '70',
  minQuality: '80',
} as const;

export function createEmptyAquariumForm(): AquariumFormData {
  return {
    deviceId: '',
    name: '',
    species: CANONICAL_FISH_SPECIES,
    tankType: CANONICAL_AQUARIUM_TYPE,
    tankLengthCm: '',
    tankWidthCm: '',
    tankHeightCm: '',
    workingWaterVolumeLiters: '',
    hasFiltrationSystem: '',
    fishCount: '',
    fishWeightsG: [],
    ...INDOOR_GOLDFISH_PRESET,
  };
}

export function populateAquariumForm(aquarium: Aquarium): AquariumFormData {
  const hasFiltrationSystem =
    typeof aquarium.hasFiltrationSystem === 'boolean'
      ? aquarium.hasFiltrationSystem
      : aquarium.filtrationSetup?.trim()
        ? true
        : undefined;

  return {
    deviceId: aquarium.deviceId || '',
    name: aquarium.name,
    species: CANONICAL_FISH_SPECIES,
    tankType: aquarium.tankType || CANONICAL_AQUARIUM_TYPE,
    tankLengthCm:
      typeof aquarium.tankLengthCm === 'number' ? String(aquarium.tankLengthCm) : '',
    tankWidthCm:
      typeof aquarium.tankWidthCm === 'number' ? String(aquarium.tankWidthCm) : '',
    tankHeightCm:
      typeof aquarium.tankHeightCm === 'number' ? String(aquarium.tankHeightCm) : '',
    workingWaterVolumeLiters:
      typeof aquarium.workingWaterVolumeLiters === 'number'
        ? String(aquarium.workingWaterVolumeLiters)
        : '',
    hasFiltrationSystem:
      hasFiltrationSystem === undefined
        ? ''
        : hasFiltrationSystem
          ? 'yes'
          : 'no',
    fishCount: typeof aquarium.fishCount === 'number' ? String(aquarium.fishCount) : '',
    fishWeightsG:
      aquarium.fishWeightsG?.map(String) ||
      resizeFishWeights([], aquarium.fishCount || 0),
    minTemp: String(aquarium.minTemp),
    maxTemp: String(aquarium.maxTemp),
    minPh: typeof aquarium.minPh === 'number' ? String(aquarium.minPh) : '',
    maxPh: typeof aquarium.maxPh === 'number' ? String(aquarium.maxPh) : '',
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
  const {
    name,
    tankLengthCm,
    tankWidthCm,
    tankHeightCm,
    workingWaterVolumeLiters,
    hasFiltrationSystem,
    fishCount,
    minTemp,
    maxTemp,
    minPh,
    maxPh,
    minLevel,
    minQuality,
  } = formData;

  if (
    !name.trim() ||
    !tankLengthCm.trim() ||
    !tankWidthCm.trim() ||
    !tankHeightCm.trim() ||
    !workingWaterVolumeLiters.trim() ||
    !hasFiltrationSystem ||
    !fishCount.trim() ||
    !minTemp.trim() ||
    !maxTemp.trim() ||
    !minPh.trim() ||
    !maxPh.trim() ||
    !minLevel.trim() ||
    !minQuality.trim()
  ) {
    return 'Complete all required profile fields, select whether a filtration system is installed, and enter every fish weight.';
  }

  const dimensions = [tankLengthCm, tankWidthCm, tankHeightCm].map(Number);
  if (dimensions.some((value) => !Number.isFinite(value) || value <= 0)) {
    return 'Tank dimensions must be numbers greater than zero.';
  }

  const waterVolume = Number(workingWaterVolumeLiters);
  if (!Number.isFinite(waterVolume) || waterVolume <= 0) {
    return 'Operational water volume must be a number greater than zero.';
  }

  const quantity = Number(fishCount);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return 'Fish quantity must be a whole number greater than zero.';
  }

  const weights = parseFishWeights(formData.fishWeightsG, quantity);
  if (!weights) {
    return 'Enter one valid weight greater than zero for every Goldfish.';
  }

  const thresholdValues = [minTemp, maxTemp, minPh, maxPh, minLevel, minQuality].map(Number);
  if (thresholdValues.some((value) => !Number.isFinite(value))) {
    return 'Monitoring values must be valid numbers.';
  }

  if (Number(minTemp) > Number(maxTemp)) {
    return 'Minimum temperature cannot be greater than maximum temperature.';
  }

  if (
    Number(minPh) < 0 ||
    Number(maxPh) > 14 ||
    Number(minPh) > Number(maxPh)
  ) {
    return 'pH thresholds must be between 0 and 14, and minimum pH cannot exceed maximum pH.';
  }

  if (Number(minLevel) < 0 || Number(minLevel) > 100) {
    return 'Water level minimum must be between 0 and 100.';
  }

  if (Number(minQuality) < 0 || Number(minQuality) > 100) {
    return 'Water purity minimum (TDS percentage) must be between 0 and 100.';
  }

  return '';
}

export function getFormBioloadCalculation(formData: AquariumFormData) {
  const fishCount = Number(formData.fishCount);
  const fishWeightsG = parseFishWeights(formData.fishWeightsG, fishCount);

  if (!fishWeightsG) {
    return null;
  }

  return calculateAquariumBioload(
    fishWeightsG,
    Number(formData.workingWaterVolumeLiters)
  );
}

export function buildAquariumCreatePayload(options: {
  formData: AquariumFormData;
  ownerId: string;
  ownerName: string;
}): AquariumCreatePayload {
  const { formData, ownerId, ownerName } = options;

  return {
    name: formData.name.trim(),
    species: [CANONICAL_FISH_SPECIES],
    tankType: CANONICAL_AQUARIUM_TYPE,
    tankLengthCm: Number(formData.tankLengthCm),
    tankWidthCm: Number(formData.tankWidthCm),
    tankHeightCm: Number(formData.tankHeightCm),
    workingWaterVolumeLiters: Number(formData.workingWaterVolumeLiters),
    hasFiltrationSystem: formData.hasFiltrationSystem === 'yes',
    fishCount: Number(formData.fishCount),
    fishWeightsG: formData.fishWeightsG.map(Number),
    minTemp: Number(formData.minTemp),
    maxTemp: Number(formData.maxTemp),
    minPh: Number(formData.minPh),
    maxPh: Number(formData.maxPh),
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
    name: formData.name.trim(),
    species: [CANONICAL_FISH_SPECIES],
    tankType: CANONICAL_AQUARIUM_TYPE,
    tankLengthCm: Number(formData.tankLengthCm),
    tankWidthCm: Number(formData.tankWidthCm),
    tankHeightCm: Number(formData.tankHeightCm),
    workingWaterVolumeLiters: Number(formData.workingWaterVolumeLiters),
    hasFiltrationSystem: formData.hasFiltrationSystem === 'yes',
    fishCount: Number(formData.fishCount),
    fishWeightsG: formData.fishWeightsG.map(Number),
    minTemp: Number(formData.minTemp),
    maxTemp: Number(formData.maxTemp),
    minPh: Number(formData.minPh),
    maxPh: Number(formData.maxPh),
    minLevel: Number(formData.minLevel),
    minQuality: Number(formData.minQuality),
  };
}

export function getAquariumsContextNote(userRole: UserRole) {
  return userRole === 'Admin'
    ? 'Admin aquarium profiles are available in the read-only Users directory.'
    : 'User view: you can only see your own aquarium records';
}

export function getAquariumsEmptyMessage(userRole: UserRole) {
  return userRole === 'Admin'
    ? 'No aquariums found for the selected user.'
    : 'No aquariums found yet.';
}

export function getAquariumFormTitle(mode: AquariumFormMode) {
  return mode === 'edit' ? 'Edit Aquarium' : 'Add New Aquarium';
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

  return 'Failed to revoke aquarium access and prepare deletion.';
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
