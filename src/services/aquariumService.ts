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
import { db } from '../firebase';
import type { Aquarium, AutomationSettings, FilterMode } from '../types/aquarium';

const filterModes: FilterMode[] = ['Low', 'Medium', 'High'];

function isFilterMode(value: unknown): value is FilterMode {
  return typeof value === 'string' && filterModes.includes(value as FilterMode);
}

function readString(value: unknown, fallback: string) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function mapAutomationSettings(
  data: Record<string, unknown>
): AutomationSettings | undefined {
  const settings = data.automationSettings;

  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    return undefined;
  }

  const settingsRecord = settings as Record<string, unknown>;
  const filtrationMode = isFilterMode(settingsRecord.filtrationMode)
    ? settingsRecord.filtrationMode
    : 'Medium';

  return {
    feedingTime: readString(settingsRecord.feedingTime, '08:00'),
    lightOnTime: readString(settingsRecord.lightOnTime, '06:00'),
    lightOffTime: readString(settingsRecord.lightOffTime, '22:00'),
    filtrationMode,
    filtrationStartTime: readString(settingsRecord.filtrationStartTime, '07:00'),
    filtrationRuntimeHours: readNumber(settingsRecord.filtrationRuntimeHours, 8),
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
    quality: Number(data.quality ?? 0),
    feeder: readString(data.feeder, 'Inactive'),
    light: readString(data.light, 'Off'),
    filter: readString(data.filter, 'Inactive'),
    minTemp: Number(data.minTemp ?? 0),
    maxTemp: Number(data.maxTemp ?? 0),
    ownerId: readString(data.ownerId, ''),
    ownerName: readString(data.ownerName, 'Unknown Owner'),
    automationSettings: mapAutomationSettings(data),
  };
}

export async function getAllAquariums(): Promise<Aquarium[]> {
  const snapshot = await getDocs(collection(db, 'aquariums'));

  return snapshot.docs.map((docSnap) => mapAquarium(docSnap.id, docSnap.data()));
}

export async function getAquariumsByOwner(ownerId: string): Promise<Aquarium[]> {
  const aquariumsQuery = query(
    collection(db, 'aquariums'),
    where('ownerId', '==', ownerId)
  );

  const snapshot = await getDocs(aquariumsQuery);

  return snapshot.docs.map((docSnap) => mapAquarium(docSnap.id, docSnap.data()));
}

export async function getAquariumById(aquariumId: string) {
  const aquariumRef = doc(db, 'aquariums', aquariumId);
  const aquariumSnap = await getDoc(aquariumRef);

  if (!aquariumSnap.exists()) {
    return null;
  }

  return aquariumSnap.data();
}

export async function createAquarium(data: Omit<Aquarium, 'id'>): Promise<void> {
  await addDoc(collection(db, 'aquariums'), data);
}

export async function updateAquarium(
  aquariumId: string,
  data: Partial<Omit<Aquarium, 'id'>>
): Promise<void> {
  await updateDoc(doc(db, 'aquariums', aquariumId), data);
}

export async function deleteAquarium(aquariumId: string): Promise<void> {
  await deleteDoc(doc(db, 'aquariums', aquariumId));
}

export async function deleteAquariumsByOwner(ownerId: string): Promise<void> {
  const aquariumsQuery = query(
    collection(db, 'aquariums'),
    where('ownerId', '==', ownerId)
  );

  const snapshot = await getDocs(aquariumsQuery);

  for (const aquariumDoc of snapshot.docs) {
    await deleteDoc(doc(db, 'aquariums', aquariumDoc.id));
  }
}
