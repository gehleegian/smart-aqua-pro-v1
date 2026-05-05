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
import type { Aquarium } from '../types/aquarium';

function mapAquarium(docId: string, data: any): Aquarium {
  return {
    id: docId,
    name: data.name || 'Unnamed Aquarium',
    species: Array.isArray(data.species) ? data.species : [],
    bioload: data.bioload || 'low',
    temp: Number(data.temp ?? 0),
    level: Number(data.level ?? 0),
    quality: Number(data.quality ?? 0),
    feeder: data.feeder || 'Inactive',
    light: data.light || 'Off',
    filter: data.filter || 'Inactive',
    minTemp: Number(data.minTemp ?? 0),
    maxTemp: Number(data.maxTemp ?? 0),
    ownerId: data.ownerId || '',
    ownerName: data.ownerName || 'Unknown Owner',
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