import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFirestore } from 'firebase/firestore';
import { getFunctions } from 'firebase/functions';
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

export const appCheck: AppCheck | null =
  typeof window !== 'undefined' && appCheckSiteKey
    ? initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      })
    : null;

export const auth = getAuth(app);
export const db = getFirestore(app);
export const rtdb = getDatabase(app);
export const functions = getFunctions(
  app,
  process.env.NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION || 'us-central1'
);
