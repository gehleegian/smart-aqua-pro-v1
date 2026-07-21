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
import { auth, db } from './firebase';
import { getCurrentUserProfile } from './userService';
import type {
  Aquarium,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function readOptionalNumber(value: unknown) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : undefined;
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
    temp: readNumber(data.temp, 0),
    level: readNumber(data.level, 0),
    ph: readOptionalNumber(data.ph),
    turbidity: readOptionalNumber(data.turbidity),
    tdsPpm: Number.isFinite(Number(data.tdsPpm)) ? Number(data.tdsPpm) : undefined,
    quality: readNumber(data.quality, 100),
    feeder: readString(data.feeder, 'Inactive'),
    light: readString(data.light, 'Off'),
    filter: readString(data.filter, 'Inactive'),
    minTemp: readNumber(data.minTemp, 0),
    maxTemp: readNumber(data.maxTemp, 0),
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
    isAdmin,
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

export async function getAquariumById(aquariumId: string): Promise<Record<string, unknown> | null> {
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
  data: Partial<Omit<Aquarium, 'id'>>
): Promise<void> {
  const { aquariumRef, aquariumData, isAdmin } = await requireAquariumAccess(
    aquariumId,
    'update'
  );
  const sanitizedData = { ...data } as Partial<Omit<Aquarium, 'id'>>;

  if (!isAdmin) {
    sanitizedData.ownerId = readString(aquariumData.ownerId, '');
    sanitizedData.ownerName = readString(aquariumData.ownerName, '');
  }

  await updateDoc(aquariumRef, sanitizedData);
}

export async function updateAquariumManualStatus(
  aquariumId: string,
  data: Partial<ManualSystemStatus>
): Promise<void> {
  const { aquariumRef } = await requireAquariumAccess(aquariumId, 'update');
  const updates = Object.fromEntries(
    Object.entries(data).map(([field, value]) => [`manualStatus.${field}`, value])
  );

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
