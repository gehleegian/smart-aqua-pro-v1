import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';

export type FirebaseConfigInput = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
  databaseURL?: string;
};

export function buildFirebaseConfig(config: FirebaseConfigInput) {
  return {
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
    measurementId: config.measurementId || undefined,
    databaseURL: config.databaseURL || undefined,
  };
}

export function createFirebaseApp(config: FirebaseConfigInput) {
  if (getApps().length > 0) {
    return getApp();
  }

  return initializeApp(buildFirebaseConfig(config));
}

export function createFirebaseClients(config: FirebaseConfigInput) {
  const firebaseConfig = buildFirebaseConfig(config);
  const app = initializeApp(firebaseConfig);

  return {
    app,
    auth: getAuth(app),
    db: getFirestore(app),
    rtdb: firebaseConfig.databaseURL ? getDatabase(app) : null,
  };
}
