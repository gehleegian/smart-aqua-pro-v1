import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type {
  Aquarium,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';
import { getCurrentUserProfile } from './userService';

type UserAquariumUpdateField =
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

type AdminAquariumUpdateField =
  | UserAquariumUpdateField
  | 'ownerId'
  | 'ownerName'
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

export type AquariumUpdateData = Partial<Pick<Aquarium, AdminAquariumUpdateField>>;

const USER_AQUARIUM_UPDATE_FIELDS = new Set<UserAquariumUpdateField>([
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
]);

const ADMIN_AQUARIUM_UPDATE_FIELDS = new Set<AdminAquariumUpdateField>([
  ...USER_AQUARIUM_UPDATE_FIELDS,
  'ownerId',
  'ownerName',
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
    automationSettings: mapAutomationSettings(data),
    manualStatus: mapManualStatus(data),
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
  const isAdmin = currentProfile.role === 'Admin';
  const isOwner = currentProfile.id === ownerId;

  if (!isAdmin && !isOwner) {
    throw new Error(`You are not allowed to ${action} this aquarium.`);
  }

  return {
    aquariumRef,
    aquariumData,
    currentProfile,
    isAdmin,
    isOwner,
  };
}

export async function getAllAquariums(): Promise<Aquarium[]> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role !== 'Admin') {
    throw new Error('Admin access is required to view all aquariums.');
  }

  const snapshot = await getDocs(collection(db, 'aquariums'));

  return snapshot.docs.map((docSnap) => mapAquarium(docSnap.id, docSnap.data()));
}

export async function getAquariumsByOwner(ownerId: string): Promise<Aquarium[]> {
  const currentProfile = await requireAuthenticatedProfile();
  const isAdmin = currentProfile.role === 'Admin';

  if (!isAdmin && ownerId !== currentProfile.id) {
    throw new Error('You are not allowed to view aquariums for another user.');
  }

  const aquariumsQuery = query(
    collection(db, 'aquariums'),
    where('ownerId', '==', ownerId)
  );

  const snapshot = await getDocs(aquariumsQuery);

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
  const isAdmin = currentProfile.role === 'Admin';

  if (!isAdmin && data.ownerId !== currentProfile.id) {
    throw new Error('You can only create aquariums for your own account.');
  }

  const payload = isAdmin
    ? data
    : {
        ...data,
        ownerId: currentProfile.id,
        ownerName: currentProfile.name,
      };

  await addDoc(collection(db, 'aquariums'), payload);
}

export async function updateAquarium(
  aquariumId: string,
  data: AquariumUpdateData
): Promise<void> {
  const { aquariumRef, isAdmin } = await requireAquariumAccess(
    aquariumId,
    'update'
  );
  const allowedFields: ReadonlySet<string> = isAdmin
    ? ADMIN_AQUARIUM_UPDATE_FIELDS
    : USER_AQUARIUM_UPDATE_FIELDS;
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

  await updateDoc(aquariumRef, sanitizedData);
}

export async function updateAquariumManualStatus(
  aquariumId: string,
  data: Partial<ManualSystemStatus>
): Promise<void> {
  const { aquariumRef } = await requireAquariumAccess(aquariumId, 'update');
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

  await updateDoc(aquariumRef, updates);
}

export async function deleteAquarium(aquariumId: string): Promise<void> {
  const { aquariumRef } = await requireAquariumAccess(aquariumId, 'delete');
  await deleteDoc(aquariumRef);
}

export async function deleteAquariumsByOwner(ownerId: string): Promise<void> {
  const currentProfile = await requireAuthenticatedProfile();

  if (currentProfile.role !== 'Admin') {
    throw new Error('Admin access is required to delete aquariums by owner.');
  }

  const aquariumsQuery = query(
    collection(db, 'aquariums'),
    where('ownerId', '==', ownerId)
  );

  const snapshot = await getDocs(aquariumsQuery);

  for (const aquariumDoc of snapshot.docs) {
    await deleteDoc(doc(db, 'aquariums', aquariumDoc.id));
  }
}
