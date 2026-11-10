// Sprint 4 core logic on the emulators: maintenance logging (FR20), the
// command log (FR17/FR19) and push notifications with a fake sender (FR15).
// Run: npm run test:sprint4-functions
import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { syncUserAuthorization } from '../src/authorizationSync.js';
import { acceptInvite, claimDevice, createInvite, hashClaimCode, setMemberRole, type OrgActor, type OrgDependencies } from '../src/orgAccess.js';
import { logMaintenance } from '../src/maintenance.js';
import { commandLogId, markUnansweredCommands, recordAck, recordCommand } from '../src/commandLog.js';
import { notifyAlert, notifyCleaningRecommendation, tokenIdFor, type NotificationSender, type PushMessage } from '../src/notifications.js';
import { clearRuleConfigCache, loadRuleConfig, RULE_CONFIG_CACHE_MS } from '../src/ruleEngine.js';
import { approveRuleConfig, saveRuleConfig } from '../src/ruleAdmin.js';
import { refreshCleaningSchedule } from '../src/scheduledChecks.js';
import { ingestTelemetry } from '../src/telemetryIngest.js';
import { MutationError } from '../src/trustedMutations.js';
import { readApprovedTestSeed } from './testSeed.js';

const PROJECT_ID = 'demo-smartaqua-sprint4';
const PEPPER = 'emulator-test-pepper';
let app: App;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let deps: OrgDependencies;
let clockMs = Date.UTC(2026, 10, 7, 2, 0, 0);

const actor = (uid: string, platformAdmin = false): OrgActor => ({ uid, email: `${uid}@example.test`, emailVerified: true, platformAdmin });
const OWNER_A = actor('owner-a');
const CO_OWNER = actor('co-owner');
const CARE_X = actor('care-x');
const CARE_Y = actor('care-y');
const OWNER_B = actor('owner-b');
const ADMIN = actor('admin-p', true);

let orgId = '';
let tank1 = '';
let tank2 = '';
let tankB = '';

class FakeSender implements NotificationSender {
  sent: PushMessage[] = [];
  invalid = new Set<string>();
  async send(messages: PushMessage[]) {
    this.sent.push(...messages);
    return messages.map((message) => (this.invalid.has(message.token)
      ? { ok: false as const, invalidToken: true, error: 'messaging/registration-token-not-registered: gone' }
      : { ok: true as const }));
  }
}

async function rejects(promise: Promise<unknown>, code: string, message?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MutationError, String(error));
    assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}

async function seedUser(user: OrgActor, role: 'User' | 'Admin' = 'User') {
  await auth.createUser({ uid: user.uid, email: user.email ?? undefined, emailVerified: true, password: 'SmartAqua-Test-123!' });
  await firestore.doc(`users/${user.uid}`).set({ name: user.uid, full_name: user.uid, email: user.email, role });
  await syncUserAuthorization({ firestore, database }, user.uid, { cascadeAquariums: false });
}

async function addToken(uid: string, token: string, platform: 'web' | 'android' = 'web') {
  await firestore.doc(`users/${uid}/fcmTokens/${tokenIdFor(token)}`).set({ token, platform, userAgent: 'test', createdAt: clockMs, lastSeenAt: clockMs });
}

async function provision(deviceId: string, code: string) {
  await firestore.doc(`device_registry/${deviceId}`).set({
    claimCodeHash: hashClaimCode(PEPPER, deviceId, code), status: 'unclaimed', deviceUid: `esp32-${deviceId}`,
    orgId: null, aquariumId: null, claimedBy: null, claimedAt: null, createdAt: clockMs,
  });
}

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` }, 'sprint4-test');
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
  deps = { firestore, database, auth, claimCodePepper: PEPPER, now: () => clockMs };
});

after(async () => {
  await deleteApp(app);
});

beforeEach(async () => {
  clockMs = Date.UTC(2026, 10, 7, 2, 0, 0);
  clearRuleConfigCache();
  for (const document of await firestore.listCollections()) await firestore.recursiveDelete(document);
  await database.ref().set(null);
  const users = await auth.listUsers(1000);
  if (users.users.length) await auth.deleteUsers(users.users.map((user) => user.uid));
  for (const user of [OWNER_A, CO_OWNER, CARE_X, CARE_Y, OWNER_B]) await seedUser(user);
  await seedUser(ADMIN, 'Admin');
  const seed = readApprovedTestSeed();
  const batch = firestore.batch();
  for (const [id, data] of Object.entries(seed.species)) batch.set(firestore.doc(`species/${id}`), data as Record<string, unknown>);
  for (const [id, data] of Object.entries(seed.rules)) batch.set(firestore.doc(`rules/${id}`), data as Record<string, unknown>);
  await batch.commit();
  for (const [id, code] of [['SAQ-AAAA-1111', 'ABCD2345'], ['SAQ-BBBB-2222', 'EFGH6789'], ['SAQ-CCCC-3333', 'JKMN2345']]) await provision(id, code);

  const first = await claimDevice(deps, OWNER_A, { deviceId: 'SAQ-AAAA-1111', claimCode: 'ABCD2345', aquariumName: 'Tank 1', orgName: 'Davao Pet Shop' });
  orgId = first.orgId;
  tank1 = first.aquariumId;
  tank2 = (await claimDevice(deps, OWNER_A, { deviceId: 'SAQ-BBBB-2222', claimCode: 'EFGH6789', aquariumName: 'Tank 2' })).aquariumId;
  tankB = (await claimDevice(deps, OWNER_B, { deviceId: 'SAQ-CCCC-3333', claimCode: 'JKMN2345', aquariumName: 'B Tank' })).aquariumId;
  for (const [caretaker, tanks] of [[CARE_X, [tank1]], [CARE_Y, [tank2]], [CO_OWNER, [tank2]]] as const) {
    const invite = await createInvite(deps, OWNER_A, { orgId, email: caretaker.email, aquariumIds: [...tanks] });
    await acceptInvite(deps, caretaker, { token: invite.token });
  }
  await setMemberRole(deps, OWNER_A, { orgId, uid: CO_OWNER.uid, role: 'owner' });
  // Profile the wizard would write, so bioload and the cleaning schedule are known.
  for (const id of [tank1, tank2, tankB]) {
    await firestore.doc(`aquariums/${id}`).update({
      species: ['Goldfish'], workingWaterVolumeLiters: 55, fishCount: 2, fishWeightsG: [40, 55], hasFiltrationSystem: true, status: 'active',
      createdAt: new Date(clockMs - 20 * 86_400_000).toISOString(),
    });
  }
});

const reading = (overrides: Record<string, unknown> = {}) => ({
  temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 85, waterPresent: true, ph: 7.0, phReadingValid: true,
  tdsPpm: 250, tdsReadingValid: true, turbidity: 2, turbidityReadingValid: true, filterState: 'Active',
  equipmentStatus: 'Normal', powerStatus: 'Online', online: true, updatedAt: clockMs, ...overrides,
});

// ---------------------------------------------------------------------------
// Notifications (FR15)
// ---------------------------------------------------------------------------

test('NOTIFY-01 an abnormal reading opens an alert and the fake sender targets exactly the org owners and the assigned caretaker', async () => {
  for (const [uid, token] of [[OWNER_A.uid, 'tok-owner-a'], [CO_OWNER.uid, 'tok-co-owner'], [CARE_X.uid, 'tok-care-x'], [CARE_Y.uid, 'tok-care-y'], [OWNER_B.uid, 'tok-owner-b'], [ADMIN.uid, 'tok-admin']]) {
    await addToken(uid, token);
  }
  const result = await ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading({ temperatureC: 28 }));
  assert.ok(result.ingested && result.alertOperations.includes('open:temperatureC'), JSON.stringify(result));
  const alert = (await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs[0];

  const sender = new FakeSender();
  const sent = await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
  assert.ok(sent.sent);
  assert.deepEqual(sender.sent.map((message) => message.uid).sort(), [CARE_X.uid, CO_OWNER.uid, OWNER_A.uid].sort(),
    'owners + the caretaker of tank 1; not CARE_Y (tank 2), not org B, not the platform admin');
  const message = sender.sent[0];
  assert.equal(message.title, 'CRITICAL: Tank 1');
  assert.match(message.body, /^Temperature: Water temperature far above range\. Act now:/);
  assert.equal(message.link, `/?tank=${tank1}`);
  assert.deepEqual(message.data, { kind: 'alert', aquariumId: tank1, alertId: alert.id, severity: 'critical', parameter: 'temperatureC' });

  const stored = (await alert.ref.get()).data()!;
  assert.equal(stored.notifiedAt, clockMs);
  assert.equal(stored.notifiedCount, 1);
  assert.deepEqual(stored.lastNotification, { at: clockMs, recipients: 3, delivered: 3, failed: 0, skippedByPrefs: 0 });
});

test('NOTIFY-02 repeats do not notify again; an escalation does', async () => {
  for (const uid of [OWNER_A.uid, CO_OWNER.uid, CARE_X.uid]) await addToken(uid, `tok-${uid}`);
  const sender = new FakeSender();
  const ingest = (temperatureC: number) => ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading({ temperatureC, updatedAt: clockMs }));
  await ingest(25); // WARNING opens
  const alert = (await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs[0];
  await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
  assert.equal(sender.sent.length, 3);

  clockMs += 60_000;
  await ingest(25.2); // repeat: touch only
  assert.equal((await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id)).sent, false);
  assert.equal(sender.sent.length, 3, 'a repeat sends nothing');

  clockMs += 60_000;
  await ingest(28); // escalates to CRITICAL
  assert.equal((await alert.ref.get()).get('severity'), 'critical');
  await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
  assert.equal(sender.sent.length, 6, 'the escalation notifies everyone again');
  assert.ok(sender.sent.slice(3).every((message) => message.title === 'CRITICAL: Tank 1'));
  assert.equal((await alert.ref.get()).get('notifiedCount'), 2);
});

test('NOTIFY-03 preferences: minimum severity, muted tank, device alerts off; invalid tokens are deleted and failures recorded', async () => {
  await addToken(OWNER_A.uid, 'tok-owner-a');
  await addToken(CO_OWNER.uid, 'tok-co-owner');
  await addToken(CARE_X.uid, 'tok-care-x');
  await addToken(CARE_X.uid, 'tok-care-x-dead');
  await firestore.doc(`users/${OWNER_A.uid}/notificationPrefs/default`).set({ minSeverity: 'critical', mutedAquariumIds: [], deviceAlerts: true, cleaningReminders: true, updatedAt: clockMs });
  await firestore.doc(`users/${CO_OWNER.uid}/notificationPrefs/default`).set({ minSeverity: 'warning', mutedAquariumIds: [tank1], deviceAlerts: true, cleaningReminders: true, updatedAt: clockMs });

  await ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading({ temperatureC: 25 })); // WARNING
  const alert = (await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs[0];
  const sender = new FakeSender();
  sender.invalid.add('tok-care-x-dead');
  const result = await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
  assert.ok(result.sent);
  assert.deepEqual(sender.sent.map((message) => message.token).sort(), ['tok-care-x', 'tok-care-x-dead']);
  assert.deepEqual([...result.skippedByPrefs].sort(), [CO_OWNER.uid, OWNER_A.uid].sort(), 'owner: critical only; co-owner: tank muted');
  assert.equal((await firestore.doc(`users/${CARE_X.uid}/fcmTokens/${tokenIdFor('tok-care-x-dead')}`).get()).exists, false, 'invalid token deleted');
  assert.equal((await firestore.doc(`users/${CARE_X.uid}/fcmTokens/${tokenIdFor('tok-care-x')}`).get()).exists, true);
  const stored = (await alert.ref.get()).data()!;
  assert.equal(stored.notifyFailures, 1);
  assert.match(stored.lastNotifyError, /registration-token-not-registered/);

  // Device alerts off: an offline alert skips CARE_X.
  await firestore.doc(`users/${CARE_X.uid}/notificationPrefs/default`).set({ minSeverity: 'warning', mutedAquariumIds: [], deviceAlerts: false, cleaningReminders: true, updatedAt: clockMs });
  await firestore.doc('alert_records/offline-1').set({ aquarium_id: tank1, parameter: 'device', severity: 'critical', type: 'Device offline', status: 'active', notifyRequestedAt: clockMs });
  const offline = new FakeSender();
  await notifyAlert({ firestore, sender: offline, now: () => clockMs }, 'offline-1');
  assert.deepEqual(offline.sent.map((message) => message.uid), [OWNER_A.uid], 'owner A (critical) only; co-owner muted tank 1; caretaker turned device alerts off');
});

test('NOTIFY-04 suspended org, stale requests and resolved alerts send nothing; cleaning reminders follow their toggle', async () => {
  await addToken(OWNER_A.uid, 'tok-owner-a');
  await addToken(CARE_X.uid, 'tok-care-x');
  const sender = new FakeSender();
  await firestore.doc('alert_records/stale').set({ aquarium_id: tank1, parameter: 'ph', severity: 'warning', type: 'pH', status: 'active', notifyRequestedAt: clockMs - 60 * 60_000 });
  assert.equal((await notifyAlert({ firestore, sender, now: () => clockMs }, 'stale')).sent, false);
  await firestore.doc('alert_records/done').set({ aquarium_id: tank1, parameter: 'ph', severity: 'warning', type: 'pH', status: 'resolved', notifyRequestedAt: clockMs });
  assert.equal((await notifyAlert({ firestore, sender, now: () => clockMs }, 'done')).sent, false);

  await firestore.doc(`users/${CARE_X.uid}/notificationPrefs/default`).set({ minSeverity: 'warning', mutedAquariumIds: [], deviceAlerts: true, cleaningReminders: false, updatedAt: clockMs });
  await firestore.doc('recommendations/clean-1').set({ aquariumId: tank1, ruleId: 'cleaning_due', status: 'pending', action: 'Clean the tank now. Then log it.', createdAt: clockMs });
  await notifyCleaningRecommendation({ firestore, sender, now: () => clockMs }, 'clean-1');
  assert.deepEqual(sender.sent.map((message) => message.uid), [OWNER_A.uid]);
  assert.equal(sender.sent[0].title, 'Cleaning due: Tank 1');
  assert.equal(sender.sent[0].body, 'Clean the tank now.');

  await firestore.doc(`organizations/${orgId}`).update({ status: 'suspended' });
  await firestore.doc('alert_records/suspended').set({ aquarium_id: tank1, parameter: 'ph', severity: 'critical', type: 'pH', status: 'active', notifyRequestedAt: clockMs });
  const result = await notifyAlert({ firestore, sender, now: () => clockMs }, 'suspended');
  assert.ok(result.sent);
  assert.deepEqual(result.recipients, [], 'a suspended org has no recipients');
});

// ---------------------------------------------------------------------------
// Power outage publication -> ingest -> persisted alert -> web + Android push.
// Offline firmware inputs and a fake sender only; no live writes or FCM sends.
for (const device of [1, 2]) {
  test(`NOTIFY-05 Aquarium ${device}: sensed 12V loss notifies web and Android once, then resolves on restored samples`, async () => {
    const { firmwarePower } = await import(new URL('../../../tests/helpers/firmware-power.mjs', import.meta.url).href);
    const present = device === 1 ? { signalV: 2.514 } : { digitalLevel: 0 };
    const absent = device === 1 ? { signalV: 0.142 } : { digitalLevel: 1 };
    await addToken(OWNER_A.uid, 'power-owner-web', 'web');
    await addToken(OWNER_A.uid, 'power-owner-android', 'android');
    await addToken(OWNER_B.uid, 'unrelated-owner-web', 'web');
    await firestore.doc(`users/${OWNER_A.uid}/notificationPrefs/default`).set({ minSeverity: 'critical', deviceAlerts: true, mutedAquariumIds: [] });
    const ingestPower = (input: { signalV?: number; digitalLevel?: number }) => ingestTelemetry({ firestore, now: () => clockMs }, tank1,
      reading({ ...firmwarePower(device, input).telemetry, updatedAt: clockMs }));
    await ingestPower(present);
    clockMs += 1000;
    const result = await ingestPower(absent);
    assert.ok(result.ingested && result.alertOperations.includes('open:power'), JSON.stringify(result));
    const alerts = (await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs;
    const alert = alerts.find((item) => item.get('parameter') === 'power');
    assert.ok(alert, 'firmware mainsPresent=false must create a power alert');
    assert.equal(alert.get('severity'), 'critical');
    assert.equal(alert.get('notifyRequestedAt'), clockMs);
    const sender = new FakeSender();
    await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
    assert.deepEqual(sender.sent.map((message) => message.token).sort(), ['power-owner-android', 'power-owner-web']);
    assert.ok(sender.sent.every((message) => message.uid === OWNER_A.uid && message.data.parameter === 'power' && message.data.aquariumId === tank1));
    assert.ok(sender.sent.every((message) => message.title === 'CRITICAL: Tank 1' && message.body.includes('Mains power interruption')));
    clockMs += 1000;
    await ingestPower(absent);
    assert.equal((await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id)).sent, false);
    assert.equal(sender.sent.length, 2, 'the same ongoing outage must not send duplicate notifications');
    for (let index = 0; index < 3; index += 1) {
      clockMs += 1000;
      await ingestPower(present);
    }
    assert.equal((await alert.ref.get()).get('status'), 'resolved');
    assert.equal((await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id)).sent, false);
  });
}

test('NOTIFY-06 disabling device/power alerts suppresses outage push without suppressing the stored alert', async () => {
  await addToken(OWNER_A.uid, 'power-owner-web', 'web');
  await addToken(OWNER_A.uid, 'power-owner-android', 'android');
  await firestore.doc(`users/${OWNER_A.uid}/notificationPrefs/default`).set({ deviceAlerts: false });
  const { firmwarePower } = await import(new URL('../../../tests/helpers/firmware-power.mjs', import.meta.url).href);
  await ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading(firmwarePower(2, { digitalLevel: 1 }).telemetry));
  const alerts = (await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs;
  const alert = alerts.find((item) => item.get('parameter') === 'power');
  assert.ok(alert);
  const sender = new FakeSender();
  await notifyAlert({ firestore, sender, now: () => clockMs }, alert.id);
  assert.equal(sender.sent.length, 0);
  assert.equal((await alert.ref.get()).get('status'), 'active');
  assert.ok((await alert.ref.get()).get('lastNotification').skippedByPrefs >= 1);
});

// ---------------------------------------------------------------------------
// Maintenance (FR20)
// ---------------------------------------------------------------------------

test('MAINT-01 Applied → maintenance logged → recommendation applied → cleaning cycle reset', async () => {
  // A cleaning_due recommendation exists for tank 1 (20 days since creation).
  const refreshed = await refreshCleaningSchedule({ firestore, now: () => clockMs }, tank1);
  assert.equal(refreshed.recommend, 'cleaning_due');
  const rec = (await firestore.collection('recommendations').where('aquariumId', '==', tank1).where('ruleId', '==', 'cleaning_due').get()).docs[0];
  const before = (await firestore.doc(`aquariums/${tank1}`).get()).get('cleaning');
  assert.equal(before.lastCleanedSource, 'createdAt');

  clockMs += 60_000;
  const performedAt = clockMs - 10 * 60_000;
  const logged = await logMaintenance({ firestore, now: () => clockMs }, CARE_X, {
    aquariumId: tank1, type: 'water_change', waterChangePercent: 30, notes: 'Changed 30%, rinsed media', performedAt, recommendationId: rec.id,
  });
  assert.equal(logged.resetsCleaningCycle, true);
  const action = (await firestore.doc(`maintenance_actions/${logged.id}`).get()).data()!;
  assert.equal(action.actionType, 'cleaning');
  assert.equal(action.type, 'water_change');
  assert.equal(action.performedBy, CARE_X.uid);
  assert.equal(action.performedByRole, 'caretaker');
  assert.equal(action.orgId, orgId);
  const applied = (await rec.ref.get()).data()!;
  assert.equal(applied.status, 'applied');
  assert.equal(applied.resolvedBy, CARE_X.uid);
  assert.equal(applied.maintenanceActionId, logged.id);

  // What onMaintenanceActionLogged does for actionType 'cleaning'.
  await refreshCleaningSchedule({ firestore, now: () => clockMs }, tank1, { resolvePendingCleaning: true });
  const after = (await firestore.doc(`aquariums/${tank1}`).get()).get('cleaning');
  assert.equal(after.lastCleanedAt, performedAt);
  assert.equal(after.lastCleanedSource, 'maintenance_actions');
  assert.ok(after.nextCleaningDue > clockMs, 'the next cleaning is in the future again');
  const audit = (await firestore.collection('audit_logs').where('action', '==', 'maintenance.log').get()).docs[0].data();
  assert.equal(audit.actor, CARE_X.uid);
  assert.equal(audit.orgId, orgId);
});

test('MAINT-02 a small water change or a filter clean does not reset the cycle', async () => {
  const small = await logMaintenance({ firestore, now: () => clockMs }, OWNER_A, { aquariumId: tank1, type: 'water_change', waterChangePercent: 20, performedAt: clockMs });
  const filter = await logMaintenance({ firestore, now: () => clockMs }, CO_OWNER, { aquariumId: tank2, type: 'filter_clean', performedAt: clockMs, notes: '' });
  for (const id of [small.id, filter.id]) {
    const action = (await firestore.doc(`maintenance_actions/${id}`).get()).data()!;
    assert.notEqual(action.actionType, 'cleaning');
    assert.equal(action.resetsCleaningCycle, false);
  }
  const clean = await logMaintenance({ firestore, now: () => clockMs }, OWNER_A, { aquariumId: tank1, type: 'tank_cleaning', performedAt: clockMs });
  assert.equal(clean.resetsCleaningCycle, true);
});

test('MAINT-03 validation and access: future time, bad type, missing %, handled recommendation; unassigned caretaker, other org and admin denied', async () => {
  const call = (who: OrgActor, input: Record<string, unknown>) => logMaintenance({ firestore, now: () => clockMs }, who, { aquariumId: tank1, type: 'other', performedAt: clockMs, ...input } as never);
  await rejects(call(OWNER_A, { performedAt: clockMs + 60 * 60_000 }), 'invalid-argument', /future/);
  await rejects(call(OWNER_A, { type: 'repaint' }), 'invalid-argument');
  await rejects(call(OWNER_A, { type: 'water_change' }), 'invalid-argument', /how much water/);
  await rejects(call(OWNER_A, { type: 'other', waterChangePercent: 30 }), 'invalid-argument');
  await rejects(call(OWNER_A, { notes: 'x'.repeat(501) }), 'invalid-argument');
  await rejects(call(CARE_Y, {}), 'permission-denied', /access/);
  await rejects(call(OWNER_B, {}), 'permission-denied');
  await rejects(call(ADMIN, {}), 'permission-denied', /read-only/);
  await rejects(call({ ...CARE_X, emailVerified: false }, {}), 'permission-denied', /Verify/);

  await firestore.doc('recommendations/r-dismissed').set({ aquariumId: tank1, ruleId: 'x', status: 'dismissed', createdAt: clockMs });
  await rejects(call(CARE_X, { recommendationId: 'r-dismissed' }), 'failed-precondition', /already handled/);
  await firestore.doc('recommendations/r-other').set({ aquariumId: tank2, ruleId: 'x', status: 'pending', createdAt: clockMs });
  await rejects(call(OWNER_A, { recommendationId: 'r-other' }), 'not-found', /this aquarium/);
  assert.equal((await firestore.collection('maintenance_actions').get()).size, 0, 'nothing was written');
});

// ---------------------------------------------------------------------------
// Command log (FR17/FR19)
// ---------------------------------------------------------------------------

test('CMD-01 a command is pending, then done with an ack, failed with an error, or no_response without one', async () => {
  const fs = { firestore, now: () => clockMs };
  const command = (commandId: string) => ({ aquariumId: tank1, commandId, type: 'feed_now', requestedAt: clockMs, requestedBy: CARE_X.uid, durationMs: 1500 });
  await recordCommand(fs, tank1, command('feed-1'));
  const log = firestore.doc(`command_logs/${commandLogId(tank1, 'feed-1')}`);
  let entry = (await log.get()).data()!;
  assert.equal(entry.status, 'pending');
  assert.deepEqual(entry.requestedBy, { uid: CARE_X.uid, displayName: CARE_X.uid });
  assert.equal(entry.orgId, orgId);
  assert.equal(entry.type, 'feed_now');
  assert.equal((await recordCommand(fs, tank1, command('feed-1'))).recorded, false, 'a retried write keeps the first entry');

  await recordAck(fs, tank1, { commandId: 'feed-1', status: 'done', executedAt: clockMs + 2_000 });
  entry = (await log.get()).data()!;
  assert.equal(entry.status, 'done');
  assert.equal(entry.executedAt, clockMs + 2_000);

  await recordCommand(fs, tank1, { ...command('light-1'), type: 'set_light_state', state: 'On', durationMs: undefined });
  await recordAck(fs, tank1, { commandId: 'light-1', status: 'failed', executedAt: clockMs, error: 'relay timeout' });
  assert.deepEqual(
    Object.fromEntries(Object.entries((await firestore.doc(`command_logs/${commandLogId(tank1, 'light-1')}`).get()).data()!).filter(([key]) => ['status', 'error', 'state'].includes(key))),
    { status: 'failed', error: 'relay timeout', state: 'On' }
  );

  await recordCommand(fs, tank1, command('feed-2'));
  clockMs += 20_000;
  assert.equal((await markUnansweredCommands(fs)).marked, 0, 'still within 30 s');
  clockMs += 15_000;
  assert.equal((await markUnansweredCommands(fs)).marked, 1);
  const late = firestore.doc(`command_logs/${commandLogId(tank1, 'feed-2')}`);
  assert.equal((await late.get()).get('status'), 'no_response');
  await recordAck(fs, tank1, { commandId: 'feed-2', status: 'done', executedAt: clockMs });
  assert.equal((await late.get()).get('status'), 'done');
  assert.equal((await late.get()).get('lateAck'), true);
});

test('CMD-02 a scheduled action acked with source "schedule" gets its own entry; an unknown ack is ignored; tanks never share entries', async () => {
  const fs = { firestore, now: () => clockMs };
  const result = await recordAck(fs, tank1, { commandId: 'schedule-feed-1794000000', status: 'done', executedAt: clockMs, source: 'schedule', type: 'feed_now' });
  assert.equal(result.updated, true);
  const entry = (await firestore.doc(`command_logs/${commandLogId(tank1, 'schedule-feed-1794000000')}`).get()).data()!;
  assert.equal(entry.source, 'schedule');
  assert.deepEqual(entry.requestedBy, { uid: null, displayName: 'Schedule' });
  assert.equal((await recordAck(fs, tank1, { commandId: 'nope', status: 'done', executedAt: clockMs })).updated, false);

  await recordCommand(fs, tank1, { aquariumId: tank1, commandId: 'same', type: 'feed_now', requestedAt: clockMs, requestedBy: OWNER_A.uid, durationMs: 1000 });
  await recordCommand(fs, tank2, { aquariumId: tank2, commandId: 'same', type: 'feed_now', requestedAt: clockMs, requestedBy: OWNER_A.uid, durationMs: 1000 });
  await recordAck(fs, tank2, { commandId: 'same', status: 'done', executedAt: clockMs });
  assert.equal((await firestore.doc(`command_logs/${commandLogId(tank1, 'same')}`).get()).get('status'), 'pending');
  assert.equal((await firestore.doc(`command_logs/${commandLogId(tank2, 'same')}`).get()).get('status'), 'done');
  assert.equal((await recordCommand(fs, 'no-such-tank', { commandId: 'x', type: 'feed_now' })).recorded, false);
});

test('CMD-03 an app ack can finalize the log before the independent command trigger runs', async () => {
  const fs = { firestore, now: () => clockMs };
  const command = {
    aquariumId: tank1,
    commandId: 'ack-first',
    type: 'set_filter_state',
    state: 'Active',
    requestedAt: clockMs - 500,
    requestedBy: CARE_X.uid,
  };
  const ack = {
    commandId: command.commandId,
    status: 'done',
    executedAt: clockMs,
    source: 'app',
    type: command.type,
    state: command.state,
  };

  assert.equal((await recordAck(fs, tank1, ack, command)).updated, true);
  const log = firestore.doc(`command_logs/${commandLogId(tank1, command.commandId)}`);
  assert.deepEqual(
    Object.fromEntries(Object.entries((await log.get()).data()!).filter(([key]) =>
      ['type', 'state', 'status', 'source', 'requestedAt', 'executedAt'].includes(key))),
    {
      type: 'set_filter_state',
      state: 'Active',
      status: 'done',
      source: 'app',
      requestedAt: clockMs - 500,
      executedAt: clockMs,
    }
  );

  assert.equal((await recordCommand(fs, tank1, command)).recorded, false,
    'the later command trigger must not replace the terminal acknowledgement');
  assert.equal((await log.get()).get('status'), 'done');
});

// ---------------------------------------------------------------------------
// Rules & species editor (FR13 admin side)
// ---------------------------------------------------------------------------

test('RULES-01 the admin edits and approves a rule; the engine uses it after the 5-minute cache', async () => {
  const fs = { firestore, now: () => clockMs };
  const current = (await firestore.doc('rules/ph_high_warning').get()).data()!;
  // Rules engine before: pH 7.6 (max 7.5) is a WARNING via ph_high_warning.
  await ingestTelemetry({ firestore, now: () => clockMs }, tank1, reading({ ph: 7.6 }));
  assert.equal((await firestore.collection('alert_records').where('aquarium_id', '==', tank1).get()).docs[0].get('ruleId'), 'ph_high_warning');

  await rejects(saveRuleConfig(fs, OWNER_A, { kind: 'rule', id: 'ph_high_warning', data: current }), 'permission-denied');
  await rejects(saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning', data: { ...current, severity: 'normal' } }), 'invalid-argument', /severity/);
  await rejects(saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'Bad ID', data: current }), 'invalid-argument', /Rule ID/);
  await rejects(saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning', data: { ...current, condition: { op: 'gt' } } }), 'invalid-argument', /exactly one/);

  const newTitle = 'pH above the goldfish range (edited)';
  const saved = await saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning', data: { ...current, title: newTitle, source: 'TBD' } });
  assert.deepEqual(saved, { id: 'ph_high_warning', kind: 'rule', changed: true, status: 'draft' });
  await rejects(approveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning' }), 'failed-precondition', /citation/);
  await saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning', data: { ...current, title: newTitle, source: 'Adviser memo 2026-11-07, Table 3' } });
  await rejects(approveRuleConfig(fs, OWNER_A, { kind: 'rule', id: 'ph_high_warning' }), 'permission-denied');
  await approveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning' });
  const stored = (await firestore.doc('rules/ph_high_warning').get()).data()!;
  assert.equal(stored.status, 'approved');
  assert.equal(stored.approvedBy, ADMIN.uid);
  assert.equal(stored.approvedAt, clockMs);

  // Within the cache window the old copy is still used; after it, the edit applies.
  assert.notEqual((await loadRuleConfig(firestore, clockMs)).rules.find((rule) => rule.ruleId === 'ph_high_warning')?.title, newTitle);
  clockMs += RULE_CONFIG_CACHE_MS + 1;
  const reloaded = (await loadRuleConfig(firestore, clockMs)).rules.find((rule) => rule.ruleId === 'ph_high_warning')!;
  assert.equal(reloaded.title, newTitle);
  assert.equal(reloaded.status, 'approved');
  await ingestTelemetry({ firestore, now: () => clockMs }, tank2, reading({ ph: 7.6, updatedAt: clockMs }));
  const rec = (await firestore.collection('recommendations').where('aquariumId', '==', tank2).where('ruleId', '==', 'ph_high_warning').get()).docs[0].data();
  assert.equal(rec.title, newTitle);
  assert.equal(rec.ruleStatus, 'approved');

  // Editing an approved rule sends it back to draft; every step is audited.
  await saveRuleConfig(fs, ADMIN, { kind: 'rule', id: 'ph_high_warning', data: { ...current, title: 'pH high', source: 'Adviser memo 2026-11-07, Table 3' } });
  assert.equal((await firestore.doc('rules/ph_high_warning').get()).get('status'), 'draft');
  const actions = (await firestore.collection('audit_logs').where('target', '==', 'rules/ph_high_warning').get()).docs.map((doc) => doc.get('action')).sort();
  assert.deepEqual(actions, ['rule.approve', 'rule.update', 'rule.update', 'rule.update']);
});

test('RULES-02 species defaults: validated, created, approved with a citation', async () => {
  const fs = { firestore, now: () => clockMs };
  await rejects(saveRuleConfig(fs, ADMIN, { kind: 'species', id: 'koi', data: { name: 'Koi', ranges: { temperatureC: { min: 25, max: 20 } } } }), 'invalid-argument', /min must be below max/);
  const created = await saveRuleConfig(fs, ADMIN, { kind: 'species', id: 'koi', data: { name: 'Koi', source: 'Book p. 12', ranges: { temperatureC: { min: 15, max: 25 } }, minWaterLevelPercent: 70 } });
  assert.equal(created.changed, true);
  assert.equal((await saveRuleConfig(fs, ADMIN, { kind: 'species', id: 'koi', data: { name: 'Koi', source: 'Book p. 12', ranges: { temperatureC: { min: 15, max: 25 } }, minWaterLevelPercent: 70 } })).changed, false, 'no-op save');
  await approveRuleConfig(fs, ADMIN, { kind: 'species', id: 'koi' });
  assert.equal((await firestore.doc('species/koi').get()).get('status'), 'approved');
  assert.equal((await firestore.collection('audit_logs').where('action', '==', 'species.create').get()).size, 1);
});
