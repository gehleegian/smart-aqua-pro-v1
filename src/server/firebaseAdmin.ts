import 'server-only';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';

export function getClaimServices() {
  if (process.env.SMARTAQUA_DEVICE_CLAIMING_ENABLED !== 'true') {
    throw new Error('Device claiming is not enabled on this server.');
  }
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const databaseURL = process.env.FIREBASE_ADMIN_DATABASE_URL;
  if (!projectId || !databaseURL) throw new Error('Missing server Firebase configuration.');
  const emulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
  if (emulator && (!projectId.startsWith('demo-') || !process.env.FIREBASE_DATABASE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST)) throw new Error('Use all three emulators with a demo project.');
  if (!emulator && (process.env.FIREBASE_AUTH_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST)) {
    throw new Error('Mixed live/emulator configuration is not allowed.');
  }
  const name = 'smartaqua-device-claims';
  const app = getApps().find(item => item.name === name) ?? initializeApp({
    projectId,
    databaseURL,
    ...(emulator ? {} : {
      credential: process.env.FIREBASE_ADMIN_CLIENT_EMAIL && process.env.FIREBASE_ADMIN_PRIVATE_KEY
        ? cert({ projectId, clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n') })
        : applicationDefault(),
    }),
  }, name);
  return { auth: getAuth(app), firestore: getFirestore(app), database: getDatabase(app) };
}
