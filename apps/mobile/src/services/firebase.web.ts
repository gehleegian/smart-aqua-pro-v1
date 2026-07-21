import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { createFirebaseApp } from '@smartaqua/shared';
import { readMobileFirebaseConfig } from './firebaseConfig';

const app = createFirebaseApp(readMobileFirebaseConfig());

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = readMobileFirebaseConfig().databaseURL ? getDatabase(app) : null;
