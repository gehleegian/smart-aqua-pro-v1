import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HISTORY_SAMPLE_INTERVAL_MS, ingestTelemetry } from '../src/telemetryIngest.js';

const PROJECT_ID = 'demo-smartaqua-telemetry-ingest';
const AQUARIUM = 'aquarium-ingest';
// 2026-11-06 23:21:26.622 Asia/Manila
const T0 = 1793978486622;

let app: App;
let firestore: Firestore;
let clock = T0;
const deps = () => ({ firestore, now: () => clock });

function telemetry(patch: Record<string, unknown> = {}) {
  return {
    temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true,
    tdsPpm: 220, tdsPercent: 90, tdsReadingValid: true, ph: 7.0, phReadingValid: true,
    turbidity: 2, turbidityReadingValid: true,
    filterState: 'Active', equipmentStatus: 'Normal', powerStatus: 'Online', online: true,
    updatedAt: clock, ...patch,
  };
}

async function clearCollection(path: string) {
  const docs = await firestore.collection(path).listDocuments();
  for (const document of docs) await firestore.recursiveDelete(document);
}

async function flatRows() {
  const snap = await firestore.collection('sensor_readings').where('aquariumId', '==', AQUARIUM).get();
  return snap.docs.map((doc) => doc.data()).sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);
}

before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with the Firestore emulator.');
  app = initializeApp({ projectId: PROJECT_ID }, 'telemetry-ingest-tests');
  firestore = getFirestore(app);
});

beforeEach(async () => {
  clock = T0;
  await clearCollection('sensor_readings');
  await clearCollection('aquariums');
  await firestore.doc(`aquariums/${AQUARIUM}`).set({
    name: 'Ingest Tank', ownerId: 'owner-a', ownerName: 'Owner A', deviceUid: 'esp32-test',
    minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80, hasFiltrationSystem: true,
  });
});

after(async () => {
  await deleteApp(app);
});

test('INGEST-01 a valid reading is written to flat and nested history with a validity summary', async () => {
  const result = await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.equal(result.written, true);
  assert.ok(result.written && result.sampleReason === 'first_of_day');
  const [row] = await flatRows();
  assert.equal(row.aquariumId, AQUARIUM);
  assert.equal(row.ownerId, 'owner-a');
  assert.equal(row.deviceUid, 'esp32-test');
  assert.equal(row.source, 'device');
  assert.equal(row.dateKey, '2026-11-06');
  assert.equal(row.recordedAt, '2026-11-06T23:21:26');
  assert.equal(row.recordedAtEpoch, T0);
  assert.equal(row.ingestedAtEpoch, T0);
  assert.equal(row.ph, 7);
  assert.deepEqual(row.validity, { allValid: true, temperature: 'valid', ph: 'valid', tds: 'valid', turbidity: 'valid', waterLevel: 'valid' });
  const nested = await firestore.doc(`aquariums/${AQUARIUM}/sensor_readings/2026-11-06/readings/23-21-26`).get();
  assert.deepEqual(nested.data(), row);
  const day = (await firestore.doc(`aquariums/${AQUARIUM}/sensor_readings/2026-11-06`).get()).data();
  assert.equal(day?.lastRecordedAtEpoch, T0);
  assert.equal(day?.lastClassification, 'normal');
});

test('INGEST-02 an invalid pH is recorded as a sensor fault, not a water condition', async () => {
  for (const patch of [{ ph: 0 }, { ph: 7, phReadingValid: false }]) {
    await clearCollection('sensor_readings');
    await clearCollection('aquariums/' + AQUARIUM + '/sensor_readings');
    const result = await ingestTelemetry(deps(), AQUARIUM, telemetry(patch));
    assert.ok(result.written);
    // pH is excluded from threshold evaluation: the result is "unavailable"
    // (sensor fault), never a warning/critical water condition.
    assert.equal(result.written && result.classification, 'unavailable');
    const [row] = await flatRows();
    assert.equal(row.validity.ph, 'invalid');
    assert.equal(row.validity.allValid, false);
    assert.ok(typeof row.validity.invalidReasons.ph === 'string');
  }
});

test('INGEST-03 the live firmware payload (no pH flag, TDS invalid) is accepted and summarized', async () => {
  const live = {
    equipmentStatus: 'Unknown', filterState: 'Inactive', online: true, ph: 8.116076, powerStatus: 'Unknown',
    tdsReadingValid: false, temperatureC: 26.5, temperatureReadingValid: true, updatedAt: T0,
    waterLevelPercent: 15.72354, waterPresent: true,
  };
  const result = await ingestTelemetry(deps(), AQUARIUM, live);
  assert.ok(result.written);
  const [row] = await flatRows();
  assert.equal(row.validity.ph, 'valid');
  assert.equal(row.validity.tds, 'invalid');
  assert.equal(row.validity.turbidity, 'missing');
  assert.equal(result.written && result.classification, 'critical');
});

test('INGEST-04 rate limit: one row per 5 minutes while the classification is unchanged', async () => {
  assert.equal((await ingestTelemetry(deps(), AQUARIUM, telemetry())).written, true);
  for (const offset of [15_000, 60_000, HISTORY_SAMPLE_INTERVAL_MS - 1]) {
    clock = T0 + offset;
    const result = await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 22.5 }));
    assert.deepEqual(result, { written: false, reason: 'rate_limited' });
  }
  clock = T0 + HISTORY_SAMPLE_INTERVAL_MS;
  const result = await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.ok(result.written && result.sampleReason === 'interval');
  assert.equal((await flatRows()).length, 2);
});

test('INGEST-05 a classification change bypasses the rate limit immediately', async () => {
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  clock = T0 + 15_000;
  const toWarning = await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 24.5 }));
  assert.ok(toWarning.written && toWarning.sampleReason === 'classification_change');
  assert.equal(toWarning.written && toWarning.classification, 'warning');
  clock = T0 + 30_000;
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 24.6 })), { written: false, reason: 'rate_limited' });
  clock = T0 + 45_000;
  const back = await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.ok(back.written && back.sampleReason === 'classification_change');
  assert.equal((await flatRows()).length, 3);
});

test('INGEST-06 malformed, out-of-range, out-of-order, and unknown-aquarium readings are not written', async () => {
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, null), { written: false, reason: 'malformed' });
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: '1' })), { written: false, reason: 'malformed' });
  // The 1997 epoch seen in old test data.
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: 853755456 })), { written: false, reason: 'timestamp_out_of_range' });
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 + 3_600_000 })), { written: false, reason: 'timestamp_out_of_range' });
  assert.deepEqual(await ingestTelemetry(deps(), 'no-such-aquarium', telemetry()), { written: false, reason: 'unknown_aquarium' });
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 - 1000, temperatureC: 30 })), { written: false, reason: 'out_of_order' });
  assert.equal((await flatRows()).length, 1);
});

test('INGEST-07 rows stay isolated per aquarium', async () => {
  await firestore.doc('aquariums/aquarium-other').set({ ownerId: 'owner-b', minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80 });
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  const other = await ingestTelemetry(deps(), 'aquarium-other', telemetry());
  assert.ok(other.written && other.sampleReason === 'first_of_day');
  const otherRow = (await firestore.collection('sensor_readings').where('aquariumId', '==', 'aquarium-other').get()).docs[0].data();
  assert.equal(otherRow.ownerId, 'owner-b');
});
