import type { Auth } from 'firebase/auth';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import type { UserData } from '../types/user';
import { createUserService } from './userService';

type AuthServiceClients = {
  auth: Auth;
  db: Firestore;
};

export function createAuthService({ auth, db }: AuthServiceClients) {
  const userService = createUserService({ auth, db });

  async function registerUser(name: string, email: string, password: string): Promise<void> {
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
  }

  async function loginUser(email: string, password: string): Promise<UserData | null> {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    return userService.getCurrentUserProfile(firebaseUser.uid);
  }

  async function logoutUser(): Promise<void> {
    await signOut(auth);
  }

  return {
    registerUser,
    loginUser,
    logoutUser,
  };
}
