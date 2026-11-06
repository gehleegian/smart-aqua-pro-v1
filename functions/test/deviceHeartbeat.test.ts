import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { checkDeviceHeartbeats } from '../src/scheduledChecks.js';
import { clearRuleConfigCache } from '../src/ruleEngine.js';
import { ingestTelemetry } from '../src/telemetryIngest.js';
import { TELEMETRY_STALE_MS } from '../src/shared/monitoringAssessmentCore.js';
import { clearCollections, seedRules } from './testSeed.js';

const PROJECT_ID = 'demo-smartaqua-device-heartbeat';
const AQUARIUM = 'aquarium-hb';
const T0 = 1793978486622;

let app: App;
let firestore: Firestore;
let database: Database;
let clock = T0;
const deps = () => ({ firestore, database, now: () => clock });

async function alerts(aquariumId = AQUARIUM) {
  const snap = await firestore.collection('alert_records').where('aquarium_id', '==', aquariumId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as Record<string, any>));
}

async function writeTelemetry(aquariumId: string, updatedAt: number, online = true) {
  await database.ref(`devices/${aquariumId}/telemetry`).set({ temperatureC: 22, waterLevelPercent: 90, online, updatedAt });
}

before(() => {
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!process.env.FIRESTORE_EMULATOR_HOST || !databaseHost) throw new Error('Firestore and RTDB emulators are required.');
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}-default-rtdb` }, 'heartbeat-tests');
  firestore = getFirestore(app);
  database = getDatabase(app);
});

beforeEach(async () => {
  clock = T0;
  clearRuleConfigCache();
  await clearCollections(firestore, ['aquariums', 'alert_records', 'recommendations', 'species', 'rules']);
  await database.ref().set(null);
  await seedRules(firestore);
  await firestore.doc(`aquariums/${AQUARIUM}`).set({ ownerId: 'owner-hb', name: 'HB Tank', deviceUid: 'esp32-hb', species: ['Goldfish'] });
  await database.ref('authorization/aquariums').set({
    [AQUARIUM]: { state: 'active', ownerUid: 'owner-hb', deviceUids: { 'esp32-hb': true } },
    'aquarium-never': { state: 'active', ownerUid: 'owner-x', deviceUids: { 'esp32-x': true } },
    'aquarium-revoked': { state: 'revoked', ownerUid: 'owner-y', deviceUids: { 'esp32-y': true } },
  });
});

after(async () => {
  await deleteApp(app);
});

test('HEARTBEAT-01 a device silent for more than 60 s raises one device_offline alert', async () => {
  await writeTelemetry(AQUARIUM, T0);
  clock = T0 + TELEMETRY_STALE_MS;
  assert.equal((await checkDeviceHeartbeats(deps())).opened, 0, 'exactly 60 s is still live');
  clock = T0 + TELEMETRY_STALE_MS + 1;
  const result = await checkDeviceHeartbeats(deps());
  assert.deepEqual([result.offline, result.opened], [1, 1]);
  const [alert] = await alerts();
  assert.deepEqual([alert.parameter, alert.ruleId, alert.severity, alert.status], ['device', 'device_offline', 'warning', 'active']);
  assert.equal(alert.dedupKey, `${AQUARIUM}:device`);
  const [rec] = (await firestore.collection('recommendations').where('aquariumId', '==', AQUARIUM).get()).docs;
  assert.equal(rec.get('ruleId'), 'device_offline');
});

test('HEARTBEAT-02 repeated checks while offline do not duplicate; fresh data resolves it', async () => {
  await writeTelemetry(AQUARIUM, T0);
  for (let minute = 2; minute <= 6; minute += 1) {
    clock = T0 + minute * 60_000;
    await checkDeviceHeartbeats(deps());
  }
  assert.equal((await alerts()).length, 1);
  await writeTelemetry(AQUARIUM, clock);
  clock += 30_000;
  const result = await checkDeviceHeartbeats(deps());
  assert.equal(result.resolved, 1);
  const [alert] = await alerts();
  assert.equal(alert.status, 'resolved');
  assert.equal(alert.resolvedBy, 'system');
});

test('HEARTBEAT-03 a telemetry write resolves device_offline immediately in the ingest function', async () => {
  await writeTelemetry(AQUARIUM, T0);
  clock = T0 + 5 * 60_000;
  await checkDeviceHeartbeats(deps());
  assert.equal((await alerts())[0].status, 'active');
  const result = await ingestTelemetry({ firestore, now: () => clock }, AQUARIUM, {
    temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true, online: true, updatedAt: clock,
  });
  assert.ok(result.ingested && result.alertOperations.includes('resolve:device'));
  assert.equal((await alerts()).find((alert) => alert.parameter === 'device')!.status, 'resolved');
});

test('HEARTBEAT-04 online=false counts as offline; never-reported and revoked aquariums are skipped', async () => {
  await writeTelemetry(AQUARIUM, T0, false);
  await writeTelemetry('aquarium-revoked', T0 - 3_600_000);
  const result = await checkDeviceHeartbeats(deps());
  assert.deepEqual([result.checked, result.opened, result.skipped], [1, 1, 1]);
  assert.deepEqual(await alerts('aquarium-never'), []);
  assert.deepEqual(await alerts('aquarium-revoked'), []);
});
