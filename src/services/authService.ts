import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserData } from '../types/user';
import { registerAuthAttempt, resetAuthRateLimit } from '../utils/authRateLimit';
import { getCurrentUserProfile } from './userService';

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<void> {
  registerAuthAttempt('signup');

  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;
  const now = new Date().toISOString();

  await setDoc(doc(db, 'users', firebaseUser.uid), {
    full_name: name,
    name,
    email,
    contact_number: '',
    role: 'User',
    account_status: 'active',
    created_at: now,
    updated_at: now,
    createdAt: now,
    updatedAt: now,
  });

  await signOut(auth);
  resetAuthRateLimit('signup');
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserData | null> {
  registerAuthAttempt('login');

  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;
  const profile = await getCurrentUserProfile(firebaseUser.uid);

  resetAuthRateLimit('login');

  return profile;
}
