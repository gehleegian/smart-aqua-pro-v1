import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { UserData, UserRole } from '../types/user';
import { normalizeRole } from '../utils/roleHelpers';

export async function getCurrentUserProfile(uid: string): Promise<UserData | null> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  const data = userSnap.data();

  return {
    id: userSnap.id,
    name: data.name || '',
    email: data.email || '',
    role: normalizeRole(data.role),
    createdAt: data.createdAt || '',
  };
}

export async function getAllUsers(): Promise<UserData[]> {
  const snapshot = await getDocs(collection(db, 'users'));

  return snapshot.docs.map((docSnap) => {
    const data = docSnap.data();

    return {
      id: docSnap.id,
      name: data.name || 'No Name',
      email: data.email || 'No Email',
      role: normalizeRole(data.role),
      createdAt: data.createdAt || '',
      status: 'offline',
    };
  });
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  await updateDoc(doc(db, 'users', userId), {
    role,
  });
}

export async function deleteUserDocument(userId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId));
}