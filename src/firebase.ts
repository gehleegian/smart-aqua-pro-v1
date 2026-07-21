import { createFirebaseClients } from '../packages/shared/src/firebase';

function requireFirebaseEnv(key: keyof ImportMetaEnv) {
  const value = import.meta.env[key];

  if (!value) {
    throw new Error(
      `Missing required Firebase environment variable: ${key}. Add it to your .env file.`
    );
  }

  return value;
}

const clients = createFirebaseClients({
  apiKey: requireFirebaseEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireFirebaseEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireFirebaseEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireFirebaseEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireFirebaseEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireFirebaseEnv('VITE_FIREBASE_APP_ID'),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || undefined,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || undefined,
});

export const auth = clients.auth;
export const db = clients.db;
export const rtdb = clients.rtdb;
