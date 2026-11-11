import { getActiveMembership } from './orgContext';
import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { AquariumUpdatePayload } from '../types/aquariumManagement';
import { normalizeDeviceId, validateDeviceId } from './deviceClaimContracts';
import { syncWaterLevelProfile } from './deviceService';
import type {
  Aquarium,
  AquariumDirectoryEntry,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';
import { getCurrentUserProfile } from './userService';
import {
  prepareAquariumDeletionTrusted,
  transferAquariumOwnershipTrusted,
} from './trustedMutationService';
import {
  createIdempotencyKey,
  type TrustedMutationResult,
} from './trustedMutationContracts';
import {
  calculateAquariumBioload,
  readFishWeights,
} from '../utils/aquariumProfileCalculations';

type AquariumProfileUpdateField =
  | 'name'
  | 'species'
  | 'minTemp'
  | 'maxTemp'
  | 'minPh'
  | 'maxPh'
  | 'minLevel'
  | 'minQuality'
  | 'minTdsPpm'
  | 'maxTdsPpm'
  | 'feeder'
  | 'light'
  | 'filter'
  | 'automationSettings';

type AquariumTankProfileUpdateField =
  | 'tankType'
  | 'tankSizeLiters'
  | 'tankSizeCategory'
  | 'tankLengthCm'
  | 'tankWidthCm'
  | 'tankHeightCm'
  | 'workingWaterVolumeLiters'
  | 'hasFiltrationSystem'
  | 'filtrationSetup'
  | 'filterCapacity'
  | 'fishCount'
  | 'fishWeightsG';

type AquariumUpdateField = AquariumProfileUpdateField | AquariumTankProfileUpdateField;

export type AquariumUpdateData = Partial<Pick<Aquarium, AquariumUpdateField>> & {
  /** Sprint 3 setup wizard: Finish sets the Firestore `status` to 'active'. */
  status?: 'active';
};

const AQUARIUM_UPDATE_FIELDS = new Set<AquariumUpdateField | 'status'>([
  'status',
  'name',
  'species',
  'minTemp',
  'maxTemp',
  'minPh',
  'maxPh',
  'minLevel',
  'minQuality',
  'minTdsPpm',
  'maxTdsPpm',
  'feeder',
  'light',
  'filter',
  'automationSettings',
  'tankType',
  'tankSizeLiters',
  'tankSizeCategory',
  'tankLengthCm',
  'tankWidthCm',
  'tankHeightCm',
  'workingWaterVolumeLiters',
  'hasFiltrationSystem',
  'filtrationSetup',
  'filterCapacity',
  'fishCount',
  'fishWeightsG',
]);

const AQUARIUM_DIRECTORY_COLLECTION = 'aquarium_directory';
const AQUARIUM_DIRECTORY_SCHEMA_VERSION = 3;

const MANUAL_STATUS_UPDATE_FIELDS: ReadonlyArray<keyof ManualSystemStatus> = [
  'feeder',
  'light',
  'filter',
];

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readFiltrationPresence(data: Record<string, unknown>) {
  if (typeof data.hasFiltrationSystem === 'boolean') {
    return data.hasFiltrationSystem;
  }

  return typeof data.filtrationSetup === 'string' && data.filtrationSetup.trim()
    ? true
    : undefined;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readTimestampLike(value: unknown) {
  if (!value) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === 'object' && value !== null) {
    const candidate = value as { toDate?: () => Date; seconds?: number };

    if (typeof candidate.toDate === 'function') {
      return candidate.toDate().toISOString();
    }

    if (typeof candidate.seconds === 'number') {
      return new Date(candidate.seconds * 1000).toISOString();
    }
  }

  return '';
}

function readStringArray(value: unknown, fallback: string[]) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const values = value.filter((item): item is string => typeof item === 'string' && Boolean(item));

  return values.length > 0 ? values : fallback;
}

function mapAutomationSettings(
  data: Record<string, unknown>
): AutomationSettings | undefined {
  const settings = data.automationSettings;

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }

  const settingsRecord = settings as Record<string, unknown>;
  const legacyFeedingTime = readString(settingsRecord.feedingTime, '08:00');

  return {
    enabled: readBoolean(settingsRecord.enabled, true),
    feedingTimes: readStringArray(settingsRecord.feedingTimes, [legacyFeedingTime]),
    lightOnTime: readString(settingsRecord.lightOnTime, '06:00'),
    lightOffTime: readString(settingsRecord.lightOffTime, '22:00'),
    filtrationStartTime: readString(settingsRecord.filtrationStartTime, '07:00'),
    filtrationRuntimeHours: readNumber(settingsRecord.filtrationRuntimeHours, 8),
  };
}

function mapManualStatus(data: Record<string, unknown>): ManualSystemStatus | undefined {
  const status = data.manualStatus;

  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    return undefined;
  }

  const statusRecord = status as Record<string, unknown>;

  return {
    feeder: readString(statusRecord.feeder, 'Inactive'),
    light: readString(statusRecord.light, 'Off'),
    filter: readString(statusRecord.filter, 'Inactive'),
  };
}

function mapAquarium(docId: string, data: Record<string, unknown>): Aquarium {
  const fishCount = readOptionalNumber(data.fishCount);
  const workingWaterVolumeLiters = readOptionalNumber(data.workingWaterVolumeLiters);
  const fishWeightsG = readFishWeights(data.fishWeightsG, fishCount);
  const calculation = fishWeightsG
    ? calculateAquariumBioload(fishWeightsG, workingWaterVolumeLiters ?? Number.NaN)
    : null;

  return {
    id: docId,
    deviceId: typeof data.deviceId === 'string' ? data.deviceId : undefined,
    deviceUid: typeof data.deviceUid === 'string' ? data.deviceUid : undefined,
    name: readString(data.name, 'Unnamed Aquarium'),
    species: Array.isArray(data.species)
      ? data.species.filter((species): species is string => typeof species === 'string')
      : [],
    bioload:
      data.bioload === 'low' || data.bioload === 'medium' || data.bioload === 'high'
        ? data.bioload
        : undefined,
    // Legacy stored readings; claimed (Sprint 3+) tanks have none, live values come from RTDB.
    hasStoredReadings: typeof data.temp === 'number' && typeof data.level === 'number',
    temp: Number(data.temp ?? 0),
    level: Number(data.level ?? 0),
    quality: readNumber(data.quality, 100),
    feeder: readString(data.feeder, 'Inactive'),
    light: readString(data.light, 'Off'),
    filter: readString(data.filter, 'Inactive'),
    minTemp: Number(data.minTemp ?? 0),
    maxTemp: Number(data.maxTemp ?? 0),
    minPh: readOptionalNumber(data.minPh),
    maxPh: readOptionalNumber(data.maxPh),
    minLevel: readNumber(data.minLevel, 70),
    minQuality: readNumber(data.minQuality, 80),
    minTdsPpm: readOptionalNumber(data.minTdsPpm),
    maxTdsPpm: readOptionalNumber(data.maxTdsPpm),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    setupStatus: data.status === 'setup' ? 'setup' : 'active',
    orgId: typeof data.orgId === 'string' ? data.orgId : undefined,
    caretakerIds: Array.isArray(data.caretakerIds)
      ? data.caretakerIds.filter((id): id is string => typeof id === 'string')
      : [],
    tankType: typeof data.tankType === 'string' ? data.tankType : undefined,
    tankSizeLiters: readOptionalNumber(data.tankSizeLiters),
    tankSizeCategory:
      data.tankSizeCategory === 'small' ||
      data.tankSizeCategory === 'medium' ||
      data.tankSizeCategory === 'large'
        ? data.tankSizeCategory
        : undefined,
    tankLengthCm: readOptionalNumber(data.tankLengthCm),
    tankWidthCm: readOptionalNumber(data.tankWidthCm),
    tankHeightCm: readOptionalNumber(data.tankHeightCm),
    workingWaterVolumeLiters,
    hasFiltrationSystem: readFiltrationPresence(data),
    filtrationSetup:
      typeof data.filtrationSetup === 'string' ? data.filtrationSetup : undefined,
    filterCapacity:
      typeof data.filterCapacity === 'string' ? data.filterCapacity : undefined,
    fishCount,
    fishWeightsG,
    totalFishBiomassG: calculation?.totalFishBiomassG,
    estimatedBioloadGL: calculation?.estimatedBioloadGL,
    automationSettings: mapAutomationSettings(data),
    manualStatus: mapManualStatus(data),
    createdAt: readTimestampLike(data.created_at || data.createdAt) || undefined,
    updatedAt: readTimestampLike(data.updated_at || data.updatedAt) || undefined,
    directorySchemaVersion: readNumber(data.directorySchemaVersion, 0),
    ...(typeof data.speciesId === 'string' ? { speciesId: data.speciesId } : {}),
    ...(data.thresholdOverrides && typeof data.thresholdOverrides === 'object' && !Array.isArray(data.thresholdOverrides)
      ? { thresholdOverrides: data.thresholdOverrides as Aquarium['thresholdOverrides'] }
      : {}),
  };
}

function buildAquariumDirectoryDocument(
  data: Record<string, unknown>,
  updatedAt: string
) {
  const species = Array.isArray(data.species)
    ? data.species.filter((item): item is string => typeof item === 'string')
    : [];
  const createdAt = readTimestampLike(data.created_at || data.createdAt);
  const fishCount = readOptionalNumber(data.fishCount);
  const tankSizeLiters = readOptionalNumber(data.tankSizeLiters);
  const tankLengthCm = readOptionalNumber(data.tankLengthCm);
  const tankWidthCm = readOptionalNumber(data.tankWidthCm);
  const tankHeightCm = readOptionalNumber(data.tankHeightCm);
  const workingWaterVolumeLiters = readOptionalNumber(data.workingWaterVolumeLiters);
  const hasFiltrationSystem = readFiltrationPresence(data);

  return {
    name: readString(data.name, 'Unnamed Aquarium'),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    species,
    ...(data.bioload === 'low' || data.bioload === 'medium' || data.bioload === 'high'
      ? { bioload: data.bioload }
      : {}),
    ...(fishCount !== undefined ? { fishCount } : {}),
    ...(typeof data.tankType === 'string' ? { tankType: data.tankType } : {}),
    ...(tankSizeLiters !== undefined ? { tankSizeLiters } : {}),
    ...(tankLengthCm !== undefined ? { tankLengthCm } : {}),
    ...(tankWidthCm !== undefined ? { tankWidthCm } : {}),
    ...(tankHeightCm !== undefined ? { tankHeightCm } : {}),
    ...(workingWaterVolumeLiters !== undefined
      ? { workingWaterVolumeLiters }
      : {}),
    ...(hasFiltrationSystem !== undefined ? { hasFiltrationSystem } : {}),
    ...(typeof data.filtrationSetup === 'string'
      ? { filtrationSetup: data.filtrationSetup }
      : {}),
    ...(createdAt ? { createdAt } : {}),
    updatedAt,
    schemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  };
}

function mapAquariumDirectoryEntry(
  docId: string,
  data: Record<string, unknown>
): AquariumDirectoryEntry {
  const species = Array.isArray(data.species)
    ? data.species.filter((item): item is string => typeof item === 'string')
    : [];
  const fishCount = readOptionalNumber(data.fishCount);
  const tankSizeLiters = readOptionalNumber(data.tankSizeLiters);
  const tankLengthCm = readOptionalNumber(data.tankLengthCm);
  const tankWidthCm = readOptionalNumber(data.tankWidthCm);
  const tankHeightCm = readOptionalNumber(data.tankHeightCm);
  const workingWaterVolumeLiters = readOptionalNumber(data.workingWaterVolumeLiters);
  const hasFiltrationSystem = readFiltrationPresence(data);

  return {
    id: docId,
    name: readString(data.name, 'Unnamed Aquarium'),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    species,
    bioload:
      data.bioload === 'low' || data.bioload === 'medium' || data.bioload === 'high'
        ? data.bioload
        : undefined,
    fishCount,
    tankType: readString(data.tankType, ''),
    tankSizeLiters,
    tankLengthCm,
    tankWidthCm,
    tankHeightCm,
    workingWaterVolumeLiters,
    hasFiltrationSystem,
    filtrationSetup: readString(data.filtrationSetup, '') || undefined,
    createdAt: readTimestampLike(data.created_at || data.createdAt),
  };
}

async function requireAuthenticatedProfile() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to perform this action.');
  }

  const currentProfile = await getCurrentUserProfile(currentUser.uid);

  if (!currentProfile) {
    throw new Error('User profile not found.');
  }

  return currentProfile;
}

async function requireAquariumAccess(
  aquariumId: string,
  action: 'view' | 'update' | 'delete'
) {
  const currentProfile = await requireAuthenticatedProfile();
  const aquariumRef = doc(db, 'aquariums', aquariumId);
  const aquariumSnap = await getDoc(aquariumRef);

  if (!aquariumSnap.exists()) {
    throw new Error('Aquarium not found.');
  }

  const aquariumData = aquariumSnap.data() as Record<string, unknown>;
  const ownerId = readString(aquariumData.ownerId, '');
  const membership = getActiveMembership();
  const orgId = readString(aquariumData.orgId, '');
  const inActiveOrg = Boolean(orgId) && membership?.orgId === orgId && membership.org.status === 'active';
  // Owners manage; assigned caretakers may only view. Rules enforce the same.
  const isOwner = orgId ? inActiveOrg && membership?.role === 'owner' : currentProfile.id === ownerId;
  const isAssignedCaretaker =
    inActiveOrg &&
    membership?.role === 'caretaker' &&
    Array.isArray(aquariumData.caretakerIds) &&
    aquariumData.caretakerIds.includes(currentProfile.id);

  if (!isOwner && !(action === 'view' && isAssignedCaretaker)) {
    throw new Error(`You are not allowed to ${action} this aquarium.`);
  }

  return {
    aquariumRef,
    aquariumData,
    currentProfile,
    isOwner,
  };
}

export async function getAquariumDirectoryEntries(): Promise<AquariumDirectoryEntry[]> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role !== 'Admin') {
    throw new Error('Admin access is required to view the aquarium directory.');
  }

  const snapshot = await getDocs(collection(db, AQUARIUM_DIRECTORY_COLLECTION));

  return snapshot.docs.map((docSnap) =>
    mapAquariumDirectoryEntry(docSnap.id, docSnap.data())
  );
}

/**
 * Aquariums visible in the active organization (Sprint 3): every tank for an
 * owner, only assigned tanks for a caretaker, nothing without an org. The name
 * is kept so existing callers did not change; `ownerId` must be the caller.
 */
export async function getAquariumsByOwner(ownerId: string): Promise<Aquarium[]> {
  const currentProfile = await requireAuthenticatedProfile();

  if (ownerId !== currentProfile.id) {
    throw new Error('You are not allowed to view aquariums for another user.');
  }

  const membership = getActiveMembership();
  if (!membership || membership.org.status !== 'active') {
    return [];
  }

  const aquariumsQuery =
    membership.role === 'owner'
      ? query(collection(db, 'aquariums'), where('orgId', '==', membership.orgId))
      : query(
          collection(db, 'aquariums'),
          where('orgId', '==', membership.orgId),
          where('caretakerIds', 'array-contains', currentProfile.id)
        );

  const snapshot = await getDocs(aquariumsQuery);

  // Directory schema backfill writes the profile: owners only.
  const legacyAquariums = membership.role !== 'owner' ? [] : snapshot.docs.filter(
    (docSnap) =>
      readNumber(docSnap.data().directorySchemaVersion, 0) !==
      AQUARIUM_DIRECTORY_SCHEMA_VERSION
  );

  for (let start = 0; start < legacyAquariums.length; start += 200) {
    const migrationBatch = writeBatch(db);
    const updatedAt = new Date().toISOString();

    for (const aquariumDoc of legacyAquariums.slice(start, start + 200)) {
      const aquariumData = aquariumDoc.data() as Record<string, unknown>;
      migrationBatch.update(aquariumDoc.ref, {
        directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
        updatedAt,
      });
      migrationBatch.set(
        doc(db, AQUARIUM_DIRECTORY_COLLECTION, aquariumDoc.id),
        buildAquariumDirectoryDocument(aquariumData, updatedAt)
      );
    }

    try {
      await migrationBatch.commit();
    } catch (error) {
      console.warn('Aquarium directory migration is pending.', error);
      break;
    }
  }

  return snapshot.docs.map((docSnap) => mapAquarium(docSnap.id, docSnap.data()));
}

export async function getAquariumById(aquariumId: string) {
  try {
    const { aquariumData } = await requireAquariumAccess(aquariumId, 'view');
    return aquariumData;
  } catch (error) {
    if (error instanceof Error && error.message === 'Aquarium not found.') {
      return null;
    }

    throw error;
  }
}

/**
 * Main (PR #8): ID-only claim through Gian's /api/devices/claim route.
 * SUPERSEDED (decision 2026-11-07): the app claims through orgService.claimDevice
 * (claim code + organizations). Kept for reference; no screen calls it, and the
 * route stays disabled unless its server credentials are configured.
 */
export async function createAquarium(
  profile: AquariumUpdatePayload,
  device: { deviceId: string },
): Promise<void> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role === 'Admin') {
    throw new Error('Administrators cannot create or manage user aquariums.');
  }

  const validation = validateDeviceId(device.deviceId);
  if (validation) throw new Error(validation);
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again.');
  let response: Response;
  try {
    response = await fetch('/api/devices/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await user.getIdToken()}` },
      cache: 'no-store',
      body: JSON.stringify({ deviceId: normalizeDeviceId(device.deviceId), profile }),
    });
  } catch {
    throw new Error('Connection interrupted. Retry with the same account and device ID to resume setup.');
  }
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof result?.message === 'string' ? result.message :
    'Device setup is unavailable. Retry with the same account and device ID.');
  if (result?.status !== 'claimed' || typeof result.aquariumId !== 'string' ||
    result.deviceId !== normalizeDeviceId(device.deviceId)) {
    throw new Error('Unexpected setup response. Retry with the same account and device ID.');
  }
}

export async function updateAquarium(
  aquariumId: string,
  data: AquariumUpdateData
): Promise<void> {
  const { aquariumRef, aquariumData } = await requireAquariumAccess(aquariumId, 'update');
  const allowedFields: ReadonlySet<string> = AQUARIUM_UPDATE_FIELDS;
  const submittedFields = Object.keys(data);
  const prohibitedFields = submittedFields.filter((field) => !allowedFields.has(field));

  if (prohibitedFields.length > 0) {
    throw new Error(`Aquarium fields cannot be updated: ${prohibitedFields.join(', ')}.`);
  }

  const sanitizedData = Object.fromEntries(
    Object.entries(data).filter(
      ([field, value]) => allowedFields.has(field) && value !== undefined
    )
  ) as AquariumUpdateData;

  if (Object.keys(sanitizedData).length === 0) {
    throw new Error('No permitted aquarium fields were provided for update.');
  }

  const updatedAt = new Date().toISOString();
  const updatedAquariumData = {
    ...aquariumData,
    ...sanitizedData,
    updatedAt,
    directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  };
  const batch = writeBatch(db);

  batch.update(aquariumRef, {
    ...sanitizedData,
    updatedAt,
    directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  });
  batch.set(
    doc(db, AQUARIUM_DIRECTORY_COLLECTION, aquariumId),
    buildAquariumDirectoryDocument(updatedAquariumData, updatedAt)
  );
  await batch.commit();
  if (aquariumData.deviceId === 'SAQ-7K3M-9R2X') {
    try { await syncWaterLevelProfile(aquariumId); }
    catch { throw new Error('Aquarium profile saved, but water-level device synchronization failed. Reopen and save the profile to retry.'); }
  }
}

export async function updateAquariumManualStatus(
  aquariumId: string,
  data: Partial<ManualSystemStatus>
): Promise<void> {
  // A caretaker's device command is the record; the profile's manualStatus
  // is owner-written (Sprint 3 rules), so there is nothing to save here.
  if (getActiveMembership()?.role === 'caretaker') {
    return;
  }
  const { aquariumRef, aquariumData } = await requireAquariumAccess(aquariumId, 'update');
  const submittedFields = Object.keys(data);
  const prohibitedFields = submittedFields.filter(
    (field) => !MANUAL_STATUS_UPDATE_FIELDS.includes(field as keyof ManualSystemStatus)
  );

  if (prohibitedFields.length > 0) {
    throw new Error(`Manual status fields cannot be updated: ${prohibitedFields.join(', ')}.`);
  }

  const updates = Object.fromEntries(
    MANUAL_STATUS_UPDATE_FIELDS.filter((field) => data[field] !== undefined).map(
      (field) => [`manualStatus.${field}`, data[field]]
    )
  );

  if (Object.keys(updates).length === 0) {
    throw new Error('No permitted manual status fields were provided for update.');
  }

  const updatedAt = new Date().toISOString();
  const batch = writeBatch(db);

  batch.update(aquariumRef, {
    ...updates,
    updatedAt,
    directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  });
  batch.set(
    doc(db, AQUARIUM_DIRECTORY_COLLECTION, aquariumId),
    buildAquariumDirectoryDocument(aquariumData, updatedAt)
  );
  await batch.commit();
}

export async function prepareAquariumDeletion(
  aquariumId: string,
  idempotencyKey = createIdempotencyKey('aquarium-deletion', aquariumId)
): Promise<TrustedMutationResult> {
  await requireAquariumAccess(aquariumId, 'delete');
  return prepareAquariumDeletionTrusted(aquariumId, idempotencyKey);
}

export async function transferAquariumOwnership(
  aquariumId: string,
  newOwnerUid: string,
  idempotencyKey = createIdempotencyKey('aquarium-transfer', aquariumId)
): Promise<TrustedMutationResult> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role !== 'Admin') {
    throw new Error('Admin access is required to transfer aquarium ownership.');
  }

  return transferAquariumOwnershipTrusted(aquariumId, newOwnerUid, idempotencyKey);
}
