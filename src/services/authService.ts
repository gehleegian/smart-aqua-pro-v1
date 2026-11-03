import {
  createUserWithEmailAndPassword,
  deleteUser,
  getIdToken,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserData } from '../types/user';
import { registerAuthAttempt, resetAuthRateLimit } from '../utils/authRateLimit';
import { getCurrentEmailAccessState } from './emailVerificationPolicyService';
import { getCurrentUserProfile } from './userService';

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<void> {
  registerAuthAttempt('signup');

  const normalizedName = name.trim();
  const normalizedEmail = normalizeEmail(email);
  const credential = await createUserWithEmailAndPassword(
    auth,
    normalizedEmail,
    password
  );
  const firebaseUser = credential.user;
  const now = new Date().toISOString();

  try {
    await updateProfile(firebaseUser, { displayName: normalizedName });
    await setDoc(doc(db, 'users', firebaseUser.uid), {
      full_name: normalizedName,
      name: normalizedName,
      email: normalizedEmail,
      contact_number: '',
      role: 'User',
      account_status: 'active',
      created_at: now,
      updated_at: now,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    await deleteUser(firebaseUser).catch(() => undefined);
    throw error;
  }

  await sendEmailVerification(firebaseUser);
  resetAuthRateLimit('signup');
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserData | null> {
  registerAuthAttempt('login');

  const userCredential = await signInWithEmailAndPassword(
    auth,
    normalizeEmail(email),
    password
  );
  const firebaseUser = userCredential.user;

  if ((await getCurrentEmailAccessState(firebaseUser)) !== 'access-allowed') {
    resetAuthRateLimit('login');
    return null;
  }

  const profile = await getCurrentUserProfile(firebaseUser.uid);

  resetAuthRateLimit('login');

  return profile;
}

export async function resendVerificationEmail(): Promise<void> {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    throw new Error('Please sign in again before requesting another verification email.');
  }

  if (
    !firebaseUser.emailVerified &&
    (await getCurrentEmailAccessState(firebaseUser)) === 'verification-required'
  ) {
    await sendEmailVerification(firebaseUser);
  }
}

export async function confirmEmailVerification(): Promise<UserData | null> {
  const firebaseUser = auth.currentUser;

  if (!firebaseUser) {
    throw new Error('Your session expired. Please sign in again.');
  }

  await reload(firebaseUser);

  if ((await getCurrentEmailAccessState(firebaseUser)) !== 'access-allowed') {
    return null;
  }

  await getIdToken(firebaseUser, true);

  return getCurrentUserProfile(firebaseUser.uid);
}
