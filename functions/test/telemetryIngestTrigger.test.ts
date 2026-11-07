import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { seedRules } from './testSeed.js';

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
  // Seed before any trigger runs: the function caches the rule config for 5 minutes.
  await seedRules(firestore);
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

test('TRIGGER-INGEST-02 an out-of-range RTDB reading raises an alert and a recommendation through the deployed trigger', async () => {
  const aquariumId = 'aquarium-trigger-rules';
  await firestore.doc(`aquariums/${aquariumId}`).set({ ownerId: 'owner-t', ownerName: 'Owner T', species: ['Goldfish'], hasFiltrationSystem: true });
  await database.ref(`devices/${aquariumId}/telemetry`).set({
    temperatureC: 27, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true, online: true, updatedAt: Date.now(),
  });
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let alerts: FirebaseFirestore.DocumentData[] = [];
  while (Date.now() < deadline) {
    alerts = (await firestore.collection('alert_records').where('aquarium_id', '==', aquariumId).get()).docs.map((d) => d.data());
    if (alerts.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(alerts.length, 1, 'trigger did not raise an alert');
  assert.equal(alerts[0].ruleId, 'temp_high_critical');
  const rec = await firestore.doc(`recommendations/${alerts[0].recommendationId}`).get();
  assert.equal(rec.get('status'), 'pending');
  const aquarium = (await firestore.doc(`aquariums/${aquariumId}`).get()).data()!;
  assert.equal(aquarium.condition.overall, 'critical');
});
