import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { HISTORY_SAMPLE_INTERVAL_MS, ingestTelemetry } from '../src/telemetryIngest.js';
import { clearRuleConfigCache } from '../src/ruleEngine.js';
import { refreshCleaningSchedule, runDailyCleaningCheck } from '../src/scheduledChecks.js';
import { ALERT_COOLDOWN_MS, ALERT_TOUCH_INTERVAL_MS, DAY_MS } from '../src/shared/monitoringAssessmentCore.js';
import { clearCollections, readSeed, seedRules } from './testSeed.js';

const PROJECT_ID = 'demo-smartaqua-telemetry-ingest';
const AQUARIUM = 'aquarium-ingest';
// 2026-11-06 23:21:26.622 Asia/Manila
const T0 = 1793978486622;
const SEND_MS = 15_000;

let app: App;
let firestore: Firestore;
let clock = T0;
const deps = () => ({ firestore, now: () => clock });

function telemetry(patch: Record<string, unknown> = {}) {
  return {
    temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true,
    tdsPpm: 220, tdsReadingValid: true, ph: 7.0, phReadingValid: true,
    turbidity: 2, turbidityReadingValid: true,
    filterState: 'Active', equipmentStatus: 'Normal', powerStatus: 'Online', online: true,
    updatedAt: clock, ...patch,
  };
}

/** Send one reading at the current clock, then advance the clock by one send interval. */
async function send(patch: Record<string, unknown> = {}) {
  const result = await ingestTelemetry(deps(), AQUARIUM, telemetry(patch));
  clock += SEND_MS;
  return result;
}

async function flatRows(aquariumId = AQUARIUM) {
  const snap = await firestore.collection('sensor_readings').where('aquariumId', '==', aquariumId).get();
  return snap.docs.map((doc) => doc.data()).sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);
}

async function alerts(aquariumId = AQUARIUM) {
  const snap = await firestore.collection('alert_records').where('aquarium_id', '==', aquariumId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FirebaseFirestore.DocumentData)).sort((a, b) => a.lastSeenAt - b.lastSeenAt);
}

async function recommendations(aquariumId = AQUARIUM) {
  const snap = await firestore.collection('recommendations').where('aquariumId', '==', aquariumId).get();
  return snap.docs.map((doc) => ({ id: doc.id, ...doc.data() } as FirebaseFirestore.DocumentData)).sort((a, b) => a.createdAt - b.createdAt);
}

const aquariumDoc = (patch: Record<string, unknown> = {}) => ({
  name: 'Ingest Tank', ownerId: 'owner-a', ownerName: 'Owner A', deviceUid: 'esp32-test', species: ['Goldfish'],
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80, hasFiltrationSystem: true,
  // 2 x 20 g in 20 L = 2 g/L: "moderate" under the draft bands (10-day interval).
  fishCount: 2, fishWeightsG: [20, 20], workingWaterVolumeLiters: 20,
  createdAt: new Date(T0 - 3 * DAY_MS).toISOString(),
  ...patch,
});

before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Run with the Firestore emulator.');
  app = initializeApp({ projectId: PROJECT_ID }, 'telemetry-ingest-tests');
  firestore = getFirestore(app);
});

beforeEach(async () => {
  clock = T0;
  clearRuleConfigCache();
  await clearCollections(firestore, ['sensor_readings', 'aquariums', 'alert_records', 'recommendations', 'maintenance_actions', 'species', 'rules']);
  await seedRules(firestore);
  await firestore.doc(`aquariums/${AQUARIUM}`).set(aquariumDoc());
});

after(async () => {
  await deleteApp(app);
});

// ---------------- Sprint 1 history behaviour (unchanged) ----------------

test('TDS above calibration-check span uses owner bounds; categorical turbidity and voltage are retained without invented NTU', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).update({ minTdsPpm: 100, maxTdsPpm: 400 });
  await send({ tdsPpm: 500, turbidity: undefined, turbidityReadingValid: undefined, turbidityState: 'Cloudy', turbidityVoltage: 0.246 });
  const [row] = await flatRows();
  assert.equal(row.validity.tds, 'valid');
  assert.equal(row.tdsPpm, 500);
  assert.equal(row.parameterStatus.tdsPpm, 'warning');
  assert.equal(row.turbidityState, 'Cloudy');
  assert.equal(row.turbidityVoltage, 0.246);
  assert.equal(row.turbidity, undefined);
  assert.equal(row.parameterStatus.turbidity, 'warning');
  assert.ok((await alerts()).some(alert => alert.parameter === 'tdsPpm'));
  assert.ok((await alerts()).some(alert => alert.parameter === 'turbidity'));
});

test('TDS owner ppm limits reach server classification and historical threshold snapshots', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).update({ minTdsPpm: 150, maxTdsPpm: 250 });
  await send({ tdsPpm: 200 });
  await send({ tdsPpm: 280 });
  const rows = await flatRows();
  assert.deepEqual(rows.at(-1)!.thresholdSnapshot.values.tdsPpm, { min: 150, max: 250 });
  assert.ok(rows.at(-1)!.thresholdSnapshot.overridden.includes('tdsPpm'));
  assert.equal(rows.at(-1)!.parameterStatus.tdsPpm, 'warning');
  assert.ok((await alerts()).some(alert => alert.parameter === 'tdsPpm'));
});

test('categorical warning uses configured filter advice; Unknown never creates water advice', async () => {
  for (const ruleId of ['turbidity_warning', 'turbidity_warning_filter_on', 'turbidity_warning_filter_off']) {
    await firestore.doc(`rules/${ruleId}`).update({ condition: { op: 'eq', value: 'Cloudy' } });
  }
  clearRuleConfigCache();
  await send({ turbidity: undefined, turbidityState: 'Clear' });
  assert.deepEqual(await recommendations(), []);
  await send({ turbidity: undefined, turbidityState: 'Cloudy', filterState: 'Active' });
  assert.equal((await recommendations()).at(-1)!.ruleId, 'turbidity_warning_filter_on');
  await send({ turbidity: undefined, turbidityState: 'Cloudy', filterState: 'Inactive' });
  assert.ok((await recommendations()).some(rec => rec.ruleId === 'turbidity_warning_filter_off'));
  const count = (await recommendations()).length;
  await send({ turbidity: undefined, turbidityState: 'Unknown' });
  assert.equal((await flatRows()).at(-1)!.parameterStatus.turbidity, 'unavailable');
  assert.equal((await recommendations()).length, count);
});

test('invalid optional voltage is omitted from history without corrupting independent sensor readings', async () => {
  await send({ turbidity: undefined, turbidityReadingValid: undefined, turbidityState: 'Clear', turbidityVoltage: '0.967' });
  const [row] = await flatRows();
  assert.equal(row.turbidityVoltage, undefined);
  assert.equal(row.temperatureC, 22);
  assert.equal(row.turbidityState, 'Clear');
  assert.equal(row.validity.turbidity, 'valid');
  assert.equal(row.turbidity, undefined);
});

for (const deviceId of ['SAQ-7K3M-9R2X', 'SAQ-TEST-0002']) {
  test(`LEVEL fixed-calibration water ignores aquarium geometry on ${deviceId}; invalid echoes stay excluded`, async () => {
    const geometry = { tankLengthCm: 60.96, tankWidthCm: 25.4, tankHeightCm: 24.13, workingWaterVolumeLiters: 19.9 };
    const percent = (27 - 24) / (27 - 20.2) * 100;
    await firestore.doc(`aquariums/${AQUARIUM}`).set(aquariumDoc({ ...geometry, deviceId }));
    const result = await send({ waterLevelPercent: percent, waterLevelReadingValid: true });
    assert.ok(result.ingested && result.written);
    const [row] = await flatRows();
    assert.equal(row.waterLevelPercent, percent);
    assert.equal(row.waterLevelTargetHeightCm, undefined);
    assert.equal(row.validity.waterLevel, 'valid');
    assert.ok((await alerts()).some(alert => alert.parameter === 'waterLevelPercent' && alert.severity === 'critical'));
    const fault = await send({ waterLevelPercent: undefined, waterPresent: undefined, waterLevelReadingValid: false });
    assert.ok(fault.ingested);
    const rows = await flatRows();
    const latest = rows.at(-1)!;
    assert.equal(latest.validity.waterLevel, 'invalid');
    assert.equal(latest.waterLevelPercent, undefined);
    assert.equal(latest.temperatureC, 22);
  });
}

test('INGEST-01 a valid reading is written to flat and nested history with a validity summary', async () => {
  const result = await ingestTelemetry(deps(), AQUARIUM, telemetry({
    lightState: 'On',
    turbidityState: 'Clear',
  }));
  assert.ok(result.ingested && result.written && result.sampleReason === 'first_of_day');
  const [row] = await flatRows();
  assert.equal(row.aquariumId, AQUARIUM);
  assert.equal(row.ownerId, 'owner-a');
  assert.equal(row.deviceUid, 'esp32-test');
  assert.equal(row.source, 'device');
  assert.equal(row.dateKey, '2026-11-06');
  assert.equal(row.recordedAt, '2026-11-06T23:21:26');
  assert.equal(row.recordedAtEpoch, T0);
  assert.equal(row.ingestedAtEpoch, T0);
  assert.equal(row.classification, 'normal');
  assert.equal(row.lightState, 'On');
  assert.equal(row.turbidityState, 'Clear');
  assert.deepEqual(row.validity, { allValid: true, temperature: 'valid', ph: 'valid', tds: 'valid', turbidity: 'valid', waterLevel: 'valid' });
  const nested = await firestore.doc(`aquariums/${AQUARIUM}/sensor_readings/2026-11-06/readings/23-21-26`).get();
  assert.deepEqual(nested.data(), row);
  const day = (await firestore.doc(`aquariums/${AQUARIUM}/sensor_readings/2026-11-06`).get()).data();
  assert.equal(day?.lastRecordedAtEpoch, T0);
  assert.equal(day?.lastClassification, 'normal');
  assert.deepEqual(await alerts(), []);
});

test('INGEST-02 an invalid pH is a sensor fault: one sensor_fault alert, never a pH water rule', async () => {
  for (const patch of [{ ph: 0 }, { ph: 7, phReadingValid: false }]) {
    await clearCollections(firestore, ['sensor_readings', 'alert_records', 'recommendations', 'aquariums']);
    await firestore.doc(`aquariums/${AQUARIUM}`).set(aquariumDoc());
    const result = await ingestTelemetry(deps(), AQUARIUM, telemetry(patch));
    assert.ok(result.ingested && result.written);
    assert.equal(result.classification, 'normal', 'the remaining valid sensors are normal; the fault does not drag the condition');
    const [row] = await flatRows();
    assert.equal(row.validity.ph, 'invalid');
    assert.equal(typeof row.validity.invalidReasons.ph, 'string');
    const [alert] = await alerts();
    assert.equal(alert.ruleId, 'sensor_fault');
    assert.equal(alert.parameter, 'ph');
    const [rec] = await recommendations();
    assert.equal(rec.action, 'Check the pH probe connection or calibration.');
    assert.equal((await recommendations()).length, 1);
  }
});

test('INGEST-03 the live firmware payload (no pH flag, TDS invalid) is accepted and classified', async () => {
  const live = {
    equipmentStatus: 'Unknown', filterState: 'Inactive', online: true, ph: 8.116076, powerStatus: 'Unknown',
    tdsReadingValid: false, temperatureC: 26.5, temperatureReadingValid: true, updatedAt: T0,
    waterLevelPercent: 15.72354, waterPresent: true,
  };
  const result = await ingestTelemetry(deps(), AQUARIUM, live);
  assert.ok(result.ingested && result.written);
  const [row] = await flatRows();
  assert.equal(row.validity.ph, 'valid');
  assert.equal(row.validity.tds, 'invalid');
  assert.equal(row.validity.turbidity, 'missing');
  assert.equal(result.classification, 'critical');
  const byParameter = Object.fromEntries((await alerts()).map((alert) => [alert.parameter, [alert.severity, alert.ruleId]]));
  assert.deepEqual(byParameter.temperatureC, ['critical', 'temp_high_critical']);
  assert.deepEqual(byParameter.ph, ['warning', 'ph_high_warning']);
  assert.deepEqual(byParameter.waterLevelPercent, ['critical', 'water_level_low_critical']);
  assert.deepEqual(byParameter.tdsPpm, ['warning', 'sensor_fault']);
  assert.deepEqual(byParameter.filter, ['warning', 'filter_inactive']);
  assert.equal(byParameter.power, undefined, 'Unknown power is not monitored: no alert');
  assert.equal(byParameter.equipment, undefined);
});

test('INGEST-04 rate limit: one row per 5 minutes while the classification is unchanged', async () => {
  assert.equal((await ingestTelemetry(deps(), AQUARIUM, telemetry())).written, true);
  for (const offset of [15_000, 60_000, HISTORY_SAMPLE_INTERVAL_MS - 1]) {
    clock = T0 + offset;
    const result = await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 22.5 }));
    assert.ok(result.ingested);
    assert.equal(result.written, false);
    assert.equal(result.firestoreWrites, 0, 'nothing changed: no Firestore writes at all');
  }
  clock = T0 + HISTORY_SAMPLE_INTERVAL_MS;
  const result = await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.ok(result.ingested && result.sampleReason === 'interval');
  assert.equal((await flatRows()).length, 2);
});

test('INGEST-05 a classification change bypasses the rate limit immediately', async () => {
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  clock = T0 + 15_000;
  const toWarning = await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 24.5 }));
  assert.ok(toWarning.ingested && toWarning.sampleReason === 'classification_change');
  assert.equal(toWarning.classification, 'warning');
  clock = T0 + 30_000;
  const same = await ingestTelemetry(deps(), AQUARIUM, telemetry({ temperatureC: 24.6 }));
  assert.ok(same.ingested && !same.written);
  clock = T0 + 45_000;
  const back = await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.ok(back.ingested && back.sampleReason === 'classification_change');
  assert.equal((await flatRows()).length, 3);
});

test('INGEST-06 malformed, out-of-range, out-of-order, and unknown-aquarium readings are not written', async () => {
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, null), { ingested: false, written: false, reason: 'malformed' });
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: '1' })), { ingested: false, written: false, reason: 'malformed' });
  // The 1997 epoch seen in old test data.
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: 853755456 })), { ingested: false, written: false, reason: 'timestamp_out_of_range' });
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 + 1 })), { ingested: false, written: false, reason: 'timestamp_out_of_range' });
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 + 3_600_000 })), { ingested: false, written: false, reason: 'timestamp_out_of_range' });
  assert.deepEqual(await ingestTelemetry(deps(), 'no-such-aquarium', telemetry()), { ingested: false, written: false, reason: 'unknown_aquarium' });
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  assert.deepEqual(await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 - 1000, temperatureC: 30 })), { ingested: false, written: false, reason: 'out_of_order' });
  assert.equal((await flatRows()).length, 1);
  assert.deepEqual(await alerts(), [], 'an out-of-order reading never raises alerts');
});

test('INGEST-06b stale and explicitly offline snapshots never change current conditions', async () => {
  const stale = await ingestTelemetry(
    { firestore, now: () => T0 + 60_001 },
    AQUARIUM,
    telemetry({ updatedAt: T0, temperatureC: 27 })
  );
  assert.deepEqual(stale, { ingested: false, written: false, reason: 'stale_or_offline' });

  const offline = await ingestTelemetry(
    deps(),
    AQUARIUM,
    telemetry({ online: false, temperatureC: 27 })
  );
  assert.deepEqual(offline, { ingested: false, written: false, reason: 'stale_or_offline' });
  assert.deepEqual(await flatRows(), []);
  assert.deepEqual(await alerts(), []);
  assert.deepEqual(await recommendations(), []);
});

test('INGEST-06c duplicate and out-of-order latest-node writes are rejected against the prior RTDB value', async () => {
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  clock = T0 + 120_000;
  const current = await ingestTelemetry(deps(), AQUARIUM, telemetry(), telemetry({ updatedAt: T0 }));
  assert.ok(current.ingested && !current.written);

  const duplicate = await ingestTelemetry(deps(), AQUARIUM, telemetry(), telemetry());
  assert.deepEqual(duplicate, { ingested: false, written: false, reason: 'out_of_order' });

  const older = await ingestTelemetry(deps(), AQUARIUM, telemetry({ updatedAt: T0 + 60_000, temperatureC: 27 }), telemetry());
  assert.deepEqual(older, { ingested: false, written: false, reason: 'out_of_order' });
  assert.deepEqual(await alerts(), []);
});

test('INGEST-07 rows, alerts and recommendations stay isolated per aquarium', async () => {
  await firestore.doc('aquariums/aquarium-other').set(aquariumDoc({ ownerId: 'owner-b' }));
  await ingestTelemetry(deps(), AQUARIUM, telemetry());
  const other = await ingestTelemetry(deps(), 'aquarium-other', telemetry({ temperatureC: 25 }));
  assert.ok(other.ingested && other.sampleReason === 'first_of_day');
  assert.equal((await flatRows('aquarium-other'))[0].ownerId, 'owner-b');
  assert.deepEqual(await alerts(), []);
  const [otherAlert] = await alerts('aquarium-other');
  assert.equal(otherAlert.ownerId, 'owner-b');
  assert.equal((await recommendations('aquarium-other'))[0].ownerId, 'owner-b');
});

// ---------------- Sprint 2: rules engine ----------------

test('approved advice works with unrelated drafts and refreshes legacy draft recommendations on fresh telemetry', async () => {
  await firestore.doc('rules/tds_high_warning').update({ status: 'draft' });
  clearRuleConfigCache();
  await send({ temperatureC: 25 });
  const [old] = await recommendations();
  assert.equal(old.ruleStatus, 'approved');
  // Simulate an existing historical draft record/legacy engine entry only in the emulator.
  await firestore.doc(`recommendations/${old.id}`).update({ ruleStatus: 'draft' });
  const ref = firestore.doc(`aquariums/${AQUARIUM}/engine/state`);
  const state = (await ref.get()).data()!;
  delete state.entries.temperatureC.ruleApprovalStatus;
  await ref.update({ entries: state.entries });
  await send({ temperatureC: 25 });
  const recs = await recommendations();
  assert.equal(recs.length, 2);
  assert.equal(recs[0].status, 'resolved');
  assert.equal(recs[0].ruleStatus, 'draft');
  assert.equal(recs[1].status, 'pending');
  assert.equal(recs[1].ruleStatus, 'approved');
  await send({ temperatureC: 25 });
  assert.equal((await recommendations()).length, 2, 'no duplicate on repeated matching data');
});

test('RULES-00 saved limits warn with draft rules, without activating a recommendation', async () => {
  await clearCollections(firestore, ['sensor_readings', 'alert_records', 'recommendations', 'species', 'rules']);
  await seedRules(firestore, readSeed());
  clearRuleConfigCache();

  const result = await send({ temperatureC: 25 });
  assert.ok(result.ingested && result.written);
  assert.equal(result.classification, 'warning');
  assert.ok((await alerts()).every(a => a.ruleId == null));
  assert.deepEqual(await recommendations(), []);
  const aquarium = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!;
  assert.equal(aquarium.condition.draft, true);
  assert.equal(aquarium.condition.overall, 'warning');
});

test('user temperature/pH limits drive server classifications, snapshots and cache refresh', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).update({ maxTemp: 28, maxPh: 10.5 });
  await send({ temperatureC: 25.8, ph: 10.2 });
  const first = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!.condition;
  assert.equal(first.perParameter.find((p: FirebaseFirestore.DocumentData) => p.parameter === 'temperatureC').status, 'normal');
  assert.equal(first.perParameter.find((p: FirebaseFirestore.DocumentData) => p.parameter === 'ph').status, 'normal');
  assert.match(first.configurationKey, /^per-rule-approval-v5:/);
  assert.deepEqual((await flatRows()).at(-1)!.thresholdSnapshot.values.ph, { min: 6.5, max: 10.5 });
  await firestore.doc(`aquariums/${AQUARIUM}`).update({ maxTemp: 29 });
  const next = await send({ temperatureC: 25.8, ph: 10.2 });
  assert.ok(next.written, 'settings change refreshes the snapshot even when classification stays normal');
  const second = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!.condition;
  assert.notEqual(first.configurationKey, second.configurationKey);
  assert.deepEqual((await flatRows()).at(-1)!.thresholdSnapshot.values.temperatureC, { min: 20, max: 29 });
  assert.deepEqual(await recommendations(), []);
});

test('RULES-01 a bad reading produces the classification, a recommendation, an alert and the condition summary', async () => {
  const result = await send({ temperatureC: 25 });
  assert.ok(result.ingested);
  assert.equal(result.classification, 'warning');
  const [alert] = await alerts();
  assert.equal(alert.severity, 'warning');
  assert.equal(alert.ruleId, 'temp_high_warning');
  assert.equal(alert.parameter, 'temperatureC');
  assert.equal(alert.dedupKey, `${AQUARIUM}:temperatureC`);
  assert.equal(alert.occurrences, 1);
  assert.equal(alert.status, 'active');
  assert.equal(alert.isRead, false);
  assert.equal(alert.aquarium_id, AQUARIUM);
  assert.equal(alert.device_id, 'esp32-test');
  assert.equal(alert.type, 'Water temperature above range');
  assert.match(alert.message, /Temperature 25 °C is above the 24 °C maximum/);
  assert.ok(alert.triggered_at.toMillis() === T0);
  const [rec] = await recommendations();
  assert.equal(alert.recommendationId, rec.id);
  assert.equal(rec.ruleId, 'temp_high_warning');
  assert.equal(rec.status, 'pending');
  assert.equal(rec.ruleStatus, 'approved');
  assert.equal(rec.ruleSource, 'TEST_FIXTURE_ONLY');
  assert.ok(rec.action && rec.basis && rec.preCheck && rec.issueDetected);
  assert.equal(rec.readingSnapshot.temperatureC, 25);
  assert.deepEqual(rec.threshold, { min: 20, max: 24 });
  assert.equal(rec.createdAt, T0);
  const [history] = await flatRows();
  assert.deepEqual(history.matchedRuleIds, ['temp_high_warning']);
  assert.equal(history.thresholdSnapshot.status, 'approved');
  assert.deepEqual(history.thresholdSnapshot.values.temperatureC, { min: 20, max: 24 });
  const aquarium = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!;
  assert.equal(aquarium.condition.overall, 'warning');
  assert.equal(aquarium.condition.draft, false);
  assert.equal(aquarium.condition.evaluatedAt, T0);
  assert.equal(aquarium.condition.perParameter.find((item: FirebaseFirestore.DocumentData) => item.parameter === 'temperatureC').status, 'warning');
});

test('RULES-02 a repeated bad reading does not create duplicates; occurrences bump at most every 5 min', async () => {
  for (let i = 0; i < 10; i += 1) await send({ temperatureC: 25 + i * 0.01 });
  assert.equal((await alerts()).length, 1);
  assert.equal((await recommendations()).length, 1);
  assert.equal((await alerts())[0].occurrences, 1);
  clock = T0 + ALERT_TOUCH_INTERVAL_MS;
  await send({ temperatureC: 25 });
  const [alert] = await alerts();
  assert.equal(alert.occurrences, 2);
  assert.equal(alert.lastSeenAt, T0 + ALERT_TOUCH_INTERVAL_MS);
  assert.equal((await recommendations()).length, 1);
});

test('RULES-03 escalation updates the alert in place, re-notifies, and supersedes the recommendation', async () => {
  await send({ temperatureC: 25 });
  const [before] = await alerts();
  await send({ temperatureC: 27 });
  const all = await alerts();
  assert.equal(all.length, 1);
  const [after] = all;
  assert.equal(after.id, before.id);
  assert.equal(after.severity, 'critical');
  assert.equal(after.ruleId, 'temp_high_critical');
  assert.equal(after.notificationCount, 2);
  assert.equal(after.occurrences, 2);
  const recs = await recommendations();
  assert.deepEqual(recs.map((rec) => [rec.ruleId, rec.status]), [['temp_high_warning', 'resolved'], ['temp_high_critical', 'pending']]);
  assert.equal(recs[0].supersededBy, recs[1].id);
  assert.equal(after.recommendationId, recs[1].id);
});

test('RULES-04 recovery auto-resolves after 3 normal evaluations; a 15 min cooldown stops reopening', async () => {
  await send({ temperatureC: 25 });
  await send();
  await send();
  assert.equal((await alerts())[0].status, 'active', 'two normals are not enough');
  await send();
  const resolvedAt = clock - SEND_MS;
  const [alert] = await alerts();
  assert.equal(alert.status, 'resolved');
  assert.equal(alert.resolved_at.toMillis(), resolvedAt);
  assert.equal(alert.resolvedBy, 'system');
  const [rec] = await recommendations();
  assert.deepEqual([rec.status, rec.resolvedBy, rec.resolvedAt], ['resolved', 'system', resolvedAt]);

  await send({ temperatureC: 25 });
  assert.equal((await alerts()).length, 1, 'within the cooldown: not reopened');
  clock = resolvedAt + ALERT_COOLDOWN_MS;
  await send({ temperatureC: 25 });
  const after = await alerts();
  assert.equal(after.length, 2);
  assert.equal(after[1].status, 'active');
});

test('RULES-05 a recommendation the user already applied is left alone on auto-resolve', async () => {
  await send({ temperatureC: 25 });
  const [rec] = await recommendations();
  await firestore.doc(`recommendations/${rec.id}`).update({ status: 'applied', resolvedAt: clock, resolvedBy: 'owner-a' });
  for (let i = 0; i < 3; i += 1) await send();
  const [after] = await recommendations();
  assert.deepEqual([after.status, after.resolvedBy], ['applied', 'owner-a']);
  assert.equal((await alerts())[0].status, 'resolved');
});

test('RULES-06 mainsPresent=false while online is a Power Interruption through the normal rules path', async () => {
  const result = await send({ mainsPresent: false, powerStatus: 'Online' });
  assert.ok(result.ingested);
  assert.equal(result.classification, 'critical');
  const [alert] = await alerts();
  assert.deepEqual([alert.parameter, alert.ruleId, alert.severity], ['power', 'power_interruption', 'critical']);
  const [row] = await flatRows();
  assert.equal(row.mainsPresent, false);
});

test('RULES-06b a device-reported "Power Interruption" without mainsPresent is informational: no alert', async () => {
  const result = await send({ powerStatus: 'Power Interruption' });
  assert.ok(result.ingested);
  assert.equal(result.classification, 'normal');
  assert.equal((await alerts()).some((alert) => alert.parameter === 'power'), false);
  const aquarium = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!;
  const power = aquarium.condition.perParameter.find((item: FirebaseFirestore.DocumentData) => item.parameter === 'power');
  assert.deepEqual([power.status, power.value], ['not_monitored', 'Power Interruption']);
  const [row] = await flatRows();
  assert.equal(row.powerStatus, 'Power Interruption');
});

test('RULES-07 Unknown power and equipment are "not monitored" and do not block NORMAL', async () => {
  const result = await send({ powerStatus: 'Unknown', equipmentStatus: 'Unknown' });
  assert.ok(result.ingested);
  assert.equal(result.classification, 'normal');
  const aquarium = (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!;
  const status = Object.fromEntries(aquarium.condition.perParameter.map((item: FirebaseFirestore.DocumentData) => [item.parameter, item.status]));
  assert.equal(status.power, 'not_monitored');
  assert.equal(status.equipment, 'not_monitored');
  assert.equal(aquarium.condition.overall, 'normal');
});

test('RULES-08 rules are data: disabling a rule in Firestore changes the outcome without a code change', async () => {
  await firestore.doc('rules/turbidity_warning_filter_on').update({ enabled: false });
  await firestore.doc('rules/turbidity_warning').update({ enabled: false });
  clearRuleConfigCache();
  await send({ turbidity: 7, filterState: 'Inactive' });
  const alert = (await alerts()).find((item) => item.parameter === 'turbidity')!;
  assert.equal(alert.ruleId, 'turbidity_warning_filter_off', 'filter off: the filter-off advice');
  clock += ALERT_COOLDOWN_MS;
  await clearCollections(firestore, ['alert_records', 'recommendations']);
  await firestore.doc(`aquariums/${AQUARIUM}/engine/state`).delete();
  await send({ turbidity: 7, filterState: 'Active' });
  const missing = (await alerts()).find((item) => item.parameter === 'turbidity')!;
  assert.equal(missing.ruleId, null, 'no enabled rule matches: alert without invented advice');
  assert.equal((await recommendations()).length, 0);
});

test('RULES-09 write budget at a 15 s interval (used for the cost estimate)', async () => {
  // One simulated hour each of steady NORMAL and steady abnormal (two open alerts).
  const hour = 3600_000 / SEND_MS;
  let normalWrites = 0;
  for (let i = 0; i < hour; i += 1) {
    const result = await send();
    if (result.ingested) normalWrites += result.firestoreWrites;
  }
  let abnormalWrites = 0;
  for (let i = 0; i < hour; i += 1) {
    const result = await send({ temperatureC: 25, ph: 8 });
    if (result.ingested) abnormalWrites += result.firestoreWrites;
  }
  console.log(`WRITE-BUDGET normal=${normalWrites}/h abnormal=${abnormalWrites}/h`);
  // Normal: history every 5 min (3 docs) + condition (1) + engine state (1) = 5 per 5 min, plus the first-of-day extras.
  assert.ok(normalWrites <= 12 * 5 + 6, `normal ${normalWrites}`);
  // Abnormal adds at most one alert touch per open alert per 5 min (the state write is shared).
  assert.ok(abnormalWrites <= 12 * (5 + 2) + 10, `abnormal ${abnormalWrites}`);
});

// ---------------- Sprint 2: cleaning schedule ----------------

async function cleaningOf() {
  return (await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!.cleaning;
}

test('CLEAN-01 interval: lastCleanedAt (createdAt fallback) + bioload interval; cleaning_due once after the date', async () => {
  await send();
  const createdAt = T0 - 3 * DAY_MS;
  const cleaning = await cleaningOf();
  assert.equal(cleaning.status, 'scheduled');
  assert.equal(cleaning.bioloadLevel, 'moderate');
  assert.equal(cleaning.intervalDays, 10);
  assert.equal(cleaning.lastCleanedAt, createdAt);
  assert.equal(cleaning.lastCleanedSource, 'createdAt');
  assert.equal(cleaning.nextCleaningDue, createdAt + 10 * DAY_MS);
  assert.equal(cleaning.reason, 'interval');
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()!.bioloadLevel, 'moderate');

  clock = createdAt + 10 * DAY_MS - 1;
  assert.equal((await runDailyCleaningCheck(deps())).recommendations, 0);
  clock = createdAt + 10 * DAY_MS;
  assert.equal((await runDailyCleaningCheck(deps())).recommendations, 1);
  clock += DAY_MS;
  assert.equal((await runDailyCleaningCheck(deps())).recommendations, 0, 'once per cleaning cycle');
  const recs = (await recommendations()).filter((rec) => rec.ruleId === 'cleaning_due');
  assert.equal(recs.length, 1);
  assert.equal(recs[0].status, 'pending');
});

test('CLEAN-02 a logged cleaning starts a new cycle and closes pending cleaning recommendations', async () => {
  clock = T0 + 8 * DAY_MS;
  await runDailyCleaningCheck(deps());
  assert.equal((await recommendations()).length, 1);
  const cleanedAt = clock;
  await firestore.doc('maintenance_actions/clean-1').set({
    aquariumId: AQUARIUM, actionType: 'cleaning', actionStatus: 'done', performedBy: 'owner-a', performedAt: cleanedAt, notes: '',
  });
  await refreshCleaningSchedule(deps(), AQUARIUM, { resolvePendingCleaning: true });
  const cleaning = await cleaningOf();
  assert.equal(cleaning.lastCleanedAt, cleanedAt);
  assert.equal(cleaning.lastCleanedSource, 'maintenance_actions');
  assert.equal(cleaning.nextCleaningDue, cleanedAt + 10 * DAY_MS);
  assert.deepEqual((await recommendations()).map((rec) => [rec.ruleId, rec.status, rec.resolvedBy]), [['cleaning_due', 'resolved', 'system']]);
});

test('CLEAN-03 TDS up >= 30% over the first reading after cleaning pulls the date in to now (cleaning_due_early once)', async () => {
  await send({ tdsPpm: 200 });
  await send({ tdsPpm: 259 });
  assert.equal((await cleaningOf()).reason, 'interval');
  const triggeredAt = clock;
  await send({ tdsPpm: 260 });
  const cleaning = await cleaningOf();
  assert.equal(cleaning.reason, 'tds_rise');
  assert.equal(cleaning.nextCleaningDue, triggeredAt);
  await send({ tdsPpm: 270 });
  const early = (await recommendations()).filter((rec) => rec.ruleId === 'cleaning_due_early');
  assert.equal(early.length, 1);
  assert.equal((await cleaningOf()).nextCleaningDue, triggeredAt, 'latched at the trigger time');
});

test('CLEAN-04 turbidity WARNING twice within 24 h pulls the date in to now', async () => {
  await send({ turbidity: 7 });
  for (let i = 0; i < 3; i += 1) await send();
  assert.equal((await cleaningOf()).reason, 'interval', 'one warning episode is not enough');
  clock += ALERT_COOLDOWN_MS;
  const triggeredAt = clock;
  await send({ turbidity: 7 });
  const cleaning = await cleaningOf();
  assert.equal(cleaning.reason, 'turbidity_repeat');
  assert.equal(cleaning.nextCleaningDue, triggeredAt);
  assert.equal((await recommendations()).filter((rec) => rec.ruleId === 'cleaning_due_early').length, 1);
});

test('CLEAN-05 an incomplete profile has no schedule rather than a guessed one', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).set(aquariumDoc({ fishWeightsG: [20] }));
  await send();
  const cleaning = await cleaningOf();
  assert.deepEqual([cleaning.status, cleaning.reason, cleaning.nextCleaningDue], ['unavailable', 'bioload_unknown', null]);
});

for (const [label, gap] of [
  ['Unknown', { turbidity: undefined, turbidityState: 'Unknown' }],
  ['missing', { turbidity: undefined }],
  ['invalid', { turbidity: -1 }],
  ['explicit fault', { turbidity: 7, turbidityReadingValid: false }],
] as const) {
  test(`CLEAN turbidity ${label} does not split an abnormal episode`, async () => {
    await send({ turbidity: 7 });
    await send(gap);
    await send({ turbidity: 7 });
    await send({ turbidity: 12 }); // Warning -> Critical is still one episode.
    const ref = firestore.doc(`aquariums/${AQUARIUM}/engine/state`);
    assert.equal((await ref.get()).get('cleaning.turbidityWarningTimes').length, 1);
    assert.equal((await cleaningOf()).reason, 'interval');
    assert.equal((await recommendations()).some(rec => rec.ruleId === 'cleaning_due_early'), false);
    await send(); // A real Normal reading re-arms the next entry.
    await send(gap); // It must not erase that valid Normal either.
    await send({ turbidity: 7 });
    assert.equal((await ref.get()).get('cleaning.turbidityWarningTimes').length, 2);
    assert.equal((await cleaningOf()).reason, 'turbidity_repeat');
    assert.equal((await recommendations()).filter(rec => rec.ruleId === 'cleaning_due_early').length, 1);
    await send({ turbidity: 7 });
    assert.equal((await recommendations()).filter(rec => rec.ruleId === 'cleaning_due_early').length, 1);
  });
}

test('CLEAN legacy state with an unknown gap conservatively waits for Normal', async () => {
  await send({ turbidity: 7 });
  const ref = firestore.doc(`aquariums/${AQUARIUM}/engine/state`);
  const state = (await ref.get()).data()!;
  delete state.lastValidTurbidityStatus;
  state.lastParameterStatus.turbidity = 'unavailable';
  await ref.set(state);
  await send({ turbidity: 7 });
  assert.equal((await ref.get()).get('cleaning.turbidityWarningTimes').length, 1);
  assert.equal((await cleaningOf()).reason, 'interval');
  await send();
  await send({ turbidity: 7 });
  assert.equal((await cleaningOf()).reason, 'turbidity_repeat');
});

test('CLEAN legacy valid Normal survives multiple unknown gaps after upgrade', async () => {
  await send({ turbidity: 7 });
  await send();
  const ref = firestore.doc(`aquariums/${AQUARIUM}/engine/state`);
  const state = (await ref.get()).data()!;
  delete state.lastValidTurbidityStatus;
  await ref.set(state);
  await send({ turbidity: undefined, turbidityState: 'Unknown' });
  await send({ turbidity: undefined, turbidityState: 'Unknown' });
  assert.equal((await ref.get()).get('lastValidTurbidityStatus'), 'normal');
  await send({ turbidity: 7 });
  assert.equal((await cleaningOf()).reason, 'turbidity_repeat');
});

test('CLEAN categorical Cloudy needs a valid Clear between separate episodes', async () => {
  for (const id of ['turbidity_warning', 'turbidity_warning_filter_on', 'turbidity_warning_filter_off']) {
    await firestore.doc(`rules/${id}`).update({ condition: { op: 'eq', value: 'Cloudy' } });
  }
  clearRuleConfigCache();
  await send({ turbidity: undefined, turbidityState: 'Cloudy' });
  await send({ turbidity: undefined, turbidityState: 'Unknown' });
  await send({ turbidity: undefined, turbidityState: 'Cloudy' });
  assert.equal((await cleaningOf()).reason, 'interval');
  await send({ turbidity: undefined, turbidityState: 'Clear' });
  await send({ turbidity: undefined, turbidityState: 'Cloudy' });
  assert.equal((await cleaningOf()).reason, 'turbidity_repeat');
  assert.equal((await recommendations()).filter(rec => rec.ruleId === 'cleaning_due_early').length, 1);
});

test('LEVEL-01 fixed level and server summary do not require geometry or target metadata', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).update({
    deviceId: 'SAQ-7K3M-9R2X', tankLengthCm: 50, tankWidthCm: 30, tankHeightCm: 25,
    workingWaterVolumeLiters: 9,
  });
  const result = await send({ waterLevelPercent: 80, waterLevelReadingValid: true });
  assert.equal(result.ingested, true);
  const row = (await flatRows())[0];
  assert.equal(row.validity.waterLevel, 'valid');
  assert.equal(row.waterLevelTargetHeightCm, undefined);
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM}`).get()).data()?.condition.waterLevelTargetHeightCm, undefined);
});

test('LEVEL-02 invalid or obsolete profile level keeps other sensors and never raises low-water advice', async () => {
  await firestore.doc(`aquariums/${AQUARIUM}`).update({
    deviceId: 'SAQ-7K3M-9R2X', tankLengthCm: 50, tankWidthCm: 30, tankHeightCm: 25,
    workingWaterVolumeLiters: 10.5,
  });
  const result = await send({ waterLevelPercent: 2, waterLevelReadingValid: true, waterLevelTargetHeightCm: 6 });
  assert.equal(result.ingested, true);
  const row = (await flatRows())[0];
  assert.equal(row.waterLevelReadingValid, false);
  assert.equal(row.validity.waterLevel, 'invalid');
  assert.equal(row.validity.temperature, 'valid');
  assert.equal(row.parameterStatus.waterLevelPercent, 'unavailable');
  const waterAdvice = (await recommendations()).filter(rec => rec.parameter === 'waterLevelPercent');
  assert.ok(waterAdvice.every(rec => rec.ruleId === 'sensor_fault'));
});

test('LEVEL-03 explicit missing level remains missing in history, not fabricated zero', async () => {
  const result = await send({ waterLevelPercent: undefined, waterPresent: undefined, waterLevelReadingValid: false });
  assert.equal(result.ingested, true);
  const row = (await flatRows())[0];
  assert.equal(row.waterLevelPercent, undefined);
  assert.equal(row.validity.waterLevel, 'invalid');
  assert.equal(row.validity.temperature, 'valid');
});
