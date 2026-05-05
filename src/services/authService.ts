import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserData } from '../types/user';
import { normalizeRole } from '../utils/roleHelpers';

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<void> {
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;

  await setDoc(doc(db, 'users', firebaseUser.uid), {
    name,
    email,
    role: 'User',
    createdAt: new Date().toISOString(),
  });

  await signOut(auth);
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserData | null> {
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  const firebaseUser = userCredential.user;

  const userRef = doc(db, 'users', firebaseUser.uid);
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