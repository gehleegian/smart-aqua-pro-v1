import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-smartaqua-telemetry-ingest';
const AQUARIUM = 'aquarium-trigger';
const POLL_TIMEOUT_MS = 20_000;

let app: App;
let firestore: Firestore;
let database: Database;

before(async () => {
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!process.env.FIRESTORE_EMULATOR_HOST || !databaseHost) throw new Error('Firestore and RTDB emulators are required.');
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}-default-rtdb` }, 'telemetry-trigger-tests');
  firestore = getFirestore(app);
  database = getDatabase(app);
});

after(async () => {
  await deleteApp(app);
});

test('TRIGGER-INGEST-01 an RTDB telemetry write produces a Firestore history row', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).set({
    ownerId: 'owner-t', ownerName: 'Owner T', minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80,
  });
  const updatedAt = Date.now();
  await database.ref(`devices/${AQUARIUM}/telemetry`).set({
    temperatureC: 22, waterLevelPercent: 90, waterPresent: true, ph: 7, phReadingValid: true, online: true, updatedAt,
  });
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let rows: FirebaseFirestore.DocumentData[] = [];
  while (Date.now() < deadline) {
    rows = (await firestore.collection('sensor_readings').where('aquariumId', '==', AQUARIUM).get()).docs.map((d) => d.data());
    if (rows.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(rows.length, 1, 'trigger did not write a history row');
  assert.equal(rows[0].recordedAtEpoch, updatedAt);
  assert.equal(rows[0].validity.ph, 'valid');
});
