import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { createFirebaseApp } from '@smartaqua/shared';
import { readMobileFirebaseConfig } from './firebaseConfig';

const firebaseConfig = readMobileFirebaseConfig();
const app = createFirebaseApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = firebaseConfig.databaseURL ? getDatabase(app) : null;
