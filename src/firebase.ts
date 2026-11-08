import { getApp, getApps, initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectDatabaseEmulator, getDatabase } from 'firebase/database';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  type AppCheck,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const appCheckSiteKey = process.env.NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY;

const useEmulators = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true';

export const appCheck: AppCheck | null =
  typeof window !== 'undefined' && appCheckSiteKey && !useEmulators
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null;

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
// Report PDFs and CSVs (Sprint 5); read access is decided by storage.rules.
export const storage = getStorage(app);
export const functions = getFunctions(
  app,
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'asia-southeast1'
);

// Local development only: NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true points the
// app at the Emulator Suite (ports from firebase.json). Never set it in a
// deployed build.
const emulatorFlag = '__smartAquaEmulatorsConnected';
if (useEmulators && typeof window !== 'undefined' && !(globalThis as Record<string, unknown>)[emulatorFlag]) {
  (globalThis as Record<string, unknown>)[emulatorFlag] = true;
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}
