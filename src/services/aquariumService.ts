import { collection, doc, getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  Aquarium,
  AquariumDirectoryEntry,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';
import { getCurrentUserProfile } from './userService';

type AquariumProfileUpdateField =
  | 'name'
  | 'species'
  | 'bioload'
  | 'minTemp'
  | 'maxTemp'
  | 'minLevel'
  | 'minQuality'
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
  | 'filtrationSetup'
  | 'filterCapacity'
  | 'fishCount';

type AquariumUpdateField = AquariumProfileUpdateField | AquariumTankProfileUpdateField;

export type AquariumUpdateData = Partial<Pick<Aquarium, AquariumUpdateField>>;

const AQUARIUM_UPDATE_FIELDS = new Set<AquariumUpdateField>([
  'name',
  'species',
  'bioload',
  'minTemp',
  'maxTemp',
  'minLevel',
  'minQuality',
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
  'filtrationSetup',
  'filterCapacity',
  'fishCount',
]);

const AQUARIUM_DIRECTORY_COLLECTION = 'aquarium_directory';
const AQUARIUM_DIRECTORY_SCHEMA_VERSION = 1;

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
  return {
    id: docId,
    name: readString(data.name, 'Unnamed Aquarium'),
    species: Array.isArray(data.species)
      ? data.species.filter((species): species is string => typeof species === 'string')
      : [],
    bioload:
      data.bioload === 'medium' || data.bioload === 'high'
        ? data.bioload
        : 'low',
    temp: Number(data.temp ?? 0),
    level: Number(data.level ?? 0),
    quality: readNumber(data.quality, 100),
    feeder: readString(data.feeder, 'Inactive'),
    light: readString(data.light, 'Off'),
    filter: readString(data.filter, 'Inactive'),
    minTemp: Number(data.minTemp ?? 0),
    maxTemp: Number(data.maxTemp ?? 0),
    minLevel: readNumber(data.minLevel, 70),
    minQuality: readNumber(data.minQuality, 80),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    tankType: typeof data.tankType === 'string' ? data.tankType : undefined,
    tankSizeLiters: Number.isFinite(Number(data.tankSizeLiters))
      ? Number(data.tankSizeLiters)
      : undefined,
    tankSizeCategory:
      data.tankSizeCategory === 'small' ||
      data.tankSizeCategory === 'medium' ||
      data.tankSizeCategory === 'large'
        ? data.tankSizeCategory
        : undefined,
    tankLengthCm: Number.isFinite(Number(data.tankLengthCm))
      ? Number(data.tankLengthCm)
      : undefined,
    tankWidthCm: Number.isFinite(Number(data.tankWidthCm))
      ? Number(data.tankWidthCm)
      : undefined,
    tankHeightCm: Number.isFinite(Number(data.tankHeightCm))
      ? Number(data.tankHeightCm)
      : undefined,
    workingWaterVolumeLiters: Number.isFinite(Number(data.workingWaterVolumeLiters))
      ? Number(data.workingWaterVolumeLiters)
      : undefined,
    filtrationSetup:
      typeof data.filtrationSetup === 'string' ? data.filtrationSetup : undefined,
    filterCapacity:
      typeof data.filterCapacity === 'string' ? data.filterCapacity : undefined,
    fishCount: Number.isFinite(Number(data.fishCount)) ? Number(data.fishCount) : undefined,
    automationSettings: mapAutomationSettings(data),
    manualStatus: mapManualStatus(data),
    createdAt: readTimestampLike(data.created_at || data.createdAt) || undefined,
    updatedAt: readTimestampLike(data.updated_at || data.updatedAt) || undefined,
    directorySchemaVersion: readNumber(data.directorySchemaVersion, 0),
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
  const fishCount = Number(data.fishCount);
  const tankSizeLiters = Number(data.tankSizeLiters);
  const workingWaterVolumeLiters = Number(data.workingWaterVolumeLiters);

  return {
    name: readString(data.name, 'Unnamed Aquarium'),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    species,
    ...(Number.isFinite(fishCount) ? { fishCount } : {}),
    ...(typeof data.tankType === 'string' ? { tankType: data.tankType } : {}),
    ...(Number.isFinite(tankSizeLiters) ? { tankSizeLiters } : {}),
    ...(Number.isFinite(workingWaterVolumeLiters)
      ? { workingWaterVolumeLiters }
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
  const fishCount = Number(data.fishCount);
  const tankSizeLiters = Number(data.tankSizeLiters);
  const workingWaterVolumeLiters = Number(data.workingWaterVolumeLiters);

  return {
    id: docId,
    name: readString(data.name, 'Unnamed Aquarium'),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    species,
    fishCount: Number.isFinite(fishCount) ? fishCount : undefined,
    tankType: readString(data.tankType, ''),
    tankSizeLiters: Number.isFinite(tankSizeLiters) ? tankSizeLiters : undefined,
    workingWaterVolumeLiters: Number.isFinite(workingWaterVolumeLiters)
      ? workingWaterVolumeLiters
      : undefined,
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
  const isOwner = currentProfile.id === ownerId;

  if (!isOwner) {
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

export async function getAquariumsByOwner(ownerId: string): Promise<Aquarium[]> {
  const currentProfile = await requireAuthenticatedProfile();

  if (ownerId !== currentProfile.id) {
    throw new Error('You are not allowed to view aquariums for another user.');
  }

  const aquariumsQuery = query(
    collection(db, 'aquariums'),
    where('ownerId', '==', ownerId)
  );

  const snapshot = await getDocs(aquariumsQuery);

  const legacyAquariums = snapshot.docs.filter(
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

export async function createAquarium(data: Omit<Aquarium, 'id'>): Promise<void> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role === 'Admin') {
    throw new Error('Administrators cannot create or manage user aquariums.');
  }

  if (data.ownerId !== currentProfile.id) {
    throw new Error('You can only create aquariums for your own account.');
  }

  const now = new Date().toISOString();
  const aquariumRef = doc(collection(db, 'aquariums'));
  const payload = {
    ...data,
    ownerId: currentProfile.id,
    ownerName: currentProfile.name,
    createdAt: now,
    updatedAt: now,
    directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  };
  const batch = writeBatch(db);

  batch.set(aquariumRef, payload);
  batch.set(
    doc(db, AQUARIUM_DIRECTORY_COLLECTION, aquariumRef.id),
    buildAquariumDirectoryDocument(payload, now)
  );
  await batch.commit();
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
}

export async function updateAquariumManualStatus(
  aquariumId: string,
  data: Partial<ManualSystemStatus>
): Promise<void> {
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

export async function deleteAquarium(aquariumId: string): Promise<void> {
  const { aquariumRef } = await requireAquariumAccess(aquariumId, 'delete');
  const batch = writeBatch(db);

  batch.delete(aquariumRef);
  batch.delete(doc(db, AQUARIUM_DIRECTORY_COLLECTION, aquariumId));
  await batch.commit();
}
