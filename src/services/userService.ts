import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  updateDoc,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserAccountStatus, UserData, UserRole } from '../types/user';
import { normalizeRole } from '../utils/roleHelpers';

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
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

function readAccountStatus(value: unknown): UserAccountStatus {
  return value === 'inactive' ? 'inactive' : 'active';
}

function mapUserData(docId: string, data: Record<string, unknown>): UserData {
  const fullName = readString(data.full_name, readString(data.name, ''));
  const accountStatus = readAccountStatus(data.account_status);
  const createdAt = readTimestampLike(data.created_at || data.createdAt);
  const updatedAt = readTimestampLike(data.updated_at || data.updatedAt);

  return {
    id: docId,
    name: fullName,
    fullName,
    email: readString(data.email, ''),
    contactNumber: readString(data.contact_number, ''),
    role: normalizeRole(data.role),
    createdAt,
    updatedAt,
    accountStatus,
    status: accountStatus === 'inactive' ? 'offline' : 'online',
  };
}

async function readUserProfileById(uid: string): Promise<UserData | null> {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) {
    return null;
  }

  return mapUserData(userSnap.id, userSnap.data() as Record<string, unknown>);
}

async function requireAdminUser() {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to perform this action.');
  }

  const currentProfile = await readUserProfileById(currentUser.uid);

  if (!currentProfile || currentProfile.role !== 'Admin') {
    throw new Error('Admin access is required for this action.');
  }

  return currentProfile;
}

export async function getCurrentUserProfile(uid: string): Promise<UserData | null> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to access user profiles.');
  }

  if (currentUser.uid === uid) {
    return readUserProfileById(uid);
  }

  const currentProfile = await readUserProfileById(currentUser.uid);

  if (!currentProfile || currentProfile.role !== 'Admin') {
    throw new Error('You are not allowed to access another user profile.');
  }

  return readUserProfileById(uid);
}

export async function getAllUsers(): Promise<UserData[]> {
  await requireAdminUser();

  const snapshot = await getDocs(collection(db, 'users'));

  return snapshot.docs.map((docSnap) => mapUserData(docSnap.id, docSnap.data()));
}

export async function updateUserRole(userId: string, role: UserRole): Promise<void> {
  const currentProfile = await requireAdminUser();

  if (currentProfile.id === userId) {
    throw new Error('You cannot change your own admin role here.');
  }

  await updateDoc(doc(db, 'users', userId), {
    role,
  });
}

export async function updateCurrentUserProfile(data: {
  fullName: string;
  contactNumber: string;
}): Promise<UserData> {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to update your profile.');
  }

  const userRef = doc(db, 'users', currentUser.uid);
  const currentProfile = await readUserProfileById(currentUser.uid);

  if (!currentProfile) {
    throw new Error('User profile not found.');
  }

  const now = new Date().toISOString();
  const payload = {
    full_name: data.fullName.trim(),
    name: data.fullName.trim(),
    contact_number: data.contactNumber.trim(),
    updated_at: now,
    updatedAt: now,
    account_status: currentProfile.accountStatus || 'active',
    created_at: currentProfile.createdAt || now,
    createdAt: currentProfile.createdAt || now,
    email: currentProfile.email,
    role: currentProfile.role,
  };

  await updateDoc(userRef, payload);

  return {
    ...currentProfile,
    name: data.fullName.trim(),
    fullName: data.fullName.trim(),
    contactNumber: data.contactNumber.trim(),
    updatedAt: now,
  };
}

export async function deleteUserDocument(userId: string): Promise<void> {
  const currentProfile = await requireAdminUser();

  if (currentProfile.id === userId) {
    throw new Error('You cannot delete your own admin account here.');
  }

  await deleteDoc(doc(db, 'users', userId));
}
