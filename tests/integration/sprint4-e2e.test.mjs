// Sprint 4 "Done when" 3–7 end to end on the Emulator Suite: the real
// triggers and callables in the Functions emulator, clients under the rules,
// a provisioned device signing in with its own credentials. Setup is
// scripts/seed-demo.ts (same data as npm run demo).
// Run: npm run test:sprint4-e2e   (never touches a real project)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app';
import { connectAuthEmulator, getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase as getClientDatabase, ref, serverTimestamp, set } from 'firebase/database';
import { connectFirestoreEmulator, doc, getDoc, getFirestore as getClientFirestore, setDoc } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = process.env.GCLOUD_PROJECT;
assert.ok(PROJECT_ID?.startsWith('demo-'), 'emulator demo project only');
const root = process.cwd();
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const admin = {
  app: requireFromFunctions('firebase-admin/app'),
  firestore: requireFromFunctions('firebase-admin/firestore'),
  database: requireFromFunctions('firebase-admin/database'),
};
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}-default-rtdb`;
const demo = JSON.parse(readFileSync(path.join(root, 'provisioning-output', PROJECT_ID, 'demo-accounts.json'), 'utf8'));
const clients = [];
let adminApp;
let adminDb;
let adminRtdb;
let commandLog;

function client(name) {
  const app = initializeClientApp({ apiKey: 'demo-key', projectId: PROJECT_ID, databaseURL: DATABASE_URL, authDomain: 'localhost' }, name);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getClientFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const rtdb = getClientDatabase(app);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  const fns = getFunctions(app);
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const handle = { app, auth, db, rtdb, call: (fn, data) => httpsCallable(fns, fn)(data).then((result) => result.data) };
  clients.push(handle);
  return handle;
}

async function signIn(key) {
  const handle = client(key);
  const credential = await signInWithEmailAndPassword(handle.auth, demo.accounts[key].email, demo.password);
  return { ...handle, uid: credential.user.uid };
}

async function deviceFor(tank) {
  const deviceId = demo.devices[tank];
  const header = readFileSync(path.join(root, 'firmware/secrets', `${deviceId}.h`), 'utf8');
  const value = (key) => new RegExp(`#define ${key} "([^"]+)"`).exec(header)[1];
  const handle = client(`device-${deviceId}`);
  await signInWithEmailAndPassword(handle.auth, value('SMARTAQUA_DEVICE_EMAIL'), value('SMARTAQUA_DEVICE_PASSWORD'));
  return handle;
}

async function waitFor(check, label, timeoutMs = 30_000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

async function tokenFor(handle, token) {
  const { createHash } = await import('node:crypto');
  const id = createHash('sha256').update(token).digest('hex').slice(0, 40);
  await setDoc(doc(handle.db, 'users', handle.uid, 'fcmTokens', id), { token, platform: 'web', userAgent: 'Node e2e', createdAt: Date.now(), lastSeenAt: Date.now() });
}

const READING = {
  temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 86, waterPresent: true, ph: 7.0, phReadingValid: true,
  tdsPpm: 250, tdsReadingValid: true, turbidity: 2, turbidityReadingValid: true, filterState: 'Active', equipmentStatus: 'Normal',
  powerStatus: 'Online', online: true,
};

before(async () => {
  adminApp = admin.app.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL }, 'sprint4-e2e-admin');
  adminDb = admin.firestore.getFirestore(adminApp);
  adminRtdb = admin.database.getDatabase(adminApp);
  commandLog = await import(path.join(root, 'functions/lib/src/commandLog.js'));
});

after(async () => {
  for (const handle of clients) await deleteClientApp(handle.app).catch(() => undefined);
  await admin.app.deleteApp(adminApp);
});

const state = {};

test('3. an abnormal reading from the device opens an alert, and the sender targets exactly the owner and the assigned caretaker', async () => {
  state.ownerA = await signIn('ownerA');
  state.careX = await signIn('caretakerX');
  state.ownerB = await signIn('ownerB');
  for (const [handle, token] of [[state.ownerA, 'tok-owner-a'], [state.careX, 'tok-care-x'], [state.ownerB, 'tok-owner-b']]) await tokenFor(handle, token);

  // Tank 1 (Caretaker X's tank) goes CRITICAL: temperature 28 °C.
  const device = await deviceFor('tank1');
  await set(ref(device.rtdb, `devices/${demo.tanks.tank1}/telemetry`), { ...READING, temperatureC: 28, updatedAt: serverTimestamp() });
  const alert = await waitFor(async () => {
    const snap = await adminDb.collection('alert_records').where('aquarium_id', '==', demo.tanks.tank1).where('parameter', '==', 'temperatureC').get();
    return snap.docs.find((entry) => entry.get('status') === 'active' && typeof entry.get('notifiedAt') === 'number');
  }, 'alert opened and notified');
  assert.equal(alert.get('severity'), 'critical');
  assert.equal(alert.get('notifiedCount'), 1);

  const outbox = await waitFor(async () => {
    const snap = await adminDb.collection('dev_notification_outbox').where('data.alertId', '==', alert.id).get();
    return snap.size >= 2 ? snap : null;
  }, 'outbox messages');
  assert.deepEqual(outbox.docs.map((entry) => entry.get('uid')).sort(), [state.ownerA.uid, state.careX.uid].sort(), 'not owner B, not the admin');
  const message = outbox.docs[0].data();
  assert.equal(message.title, 'CRITICAL: Front Counter Tank');
  assert.match(message.body, /^Temperature: Water temperature far above range\./);
  assert.equal(message.link, `/?tank=${demo.tanks.tank1}`);

  // A repeat reading does not notify again.
  await set(ref(device.rtdb, `devices/${demo.tanks.tank1}/telemetry`), { ...READING, temperatureC: 28.1, updatedAt: serverTimestamp() });
  // A repeat only touches the alert every few minutes (ALERT_TOUCH_INTERVAL_MS),
  // so give the ingest and notify triggers time to run, then check nothing was sent.
  await new Promise((resolve) => setTimeout(resolve, 5000));
  assert.equal((await alert.ref.get()).get('notifiedCount'), 1);
  assert.equal((await adminDb.collection('dev_notification_outbox').where('data.alertId', '==', alert.id).get()).size, 2);
});

test('4. Applied → maintenance logged → recommendation applied → cleaning cycle reset', async () => {
  const rec = (await adminDb.collection('recommendations').where('aquariumId', '==', demo.tanks.tank1).where('status', '==', 'pending').get())
    .docs.find((entry) => entry.get('ruleId') === 'temp_high_critical');
  assert.ok(rec, 'the critical temperature recommendation is pending');
  const before = (await adminDb.doc(`aquariums/${demo.tanks.tank1}`).get()).get('cleaning');
  const performedAt = Date.now() - 60_000;
  const result = await state.careX.call('logMaintenance', {
    aquariumId: demo.tanks.tank1, type: 'water_change', waterChangePercent: 40, notes: 'Cooled the room, changed 40%', performedAt, recommendationId: rec.id,
  });
  assert.equal(result.resetsCleaningCycle, true);
  assert.equal(result.recommendationApplied, true);
  assert.equal((await rec.ref.get()).get('status'), 'applied');
  const cleaning = await waitFor(async () => {
    const value = (await adminDb.doc(`aquariums/${demo.tanks.tank1}`).get()).get('cleaning');
    return value?.lastCleanedAt === performedAt ? value : null;
  }, 'cleaning cycle reset by onMaintenanceActionLogged');
  assert.equal(cleaning.lastCleanedSource, 'maintenance_actions');
  assert.notEqual(before?.lastCleanedAt, performedAt);
  // Caretaker X cannot log for tank 2; owner B cannot log for org A.
  await assert.rejects(state.careX.call('logMaintenance', { aquariumId: demo.tanks.tank2, type: 'other', performedAt: Date.now() }), /access/);
  await assert.rejects(state.ownerB.call('logMaintenance', { aquariumId: demo.tanks.tank1, type: 'other', performedAt: Date.now() }), /access/);
});

test('5. a command shows pending, then done with a simulated ack, and no_response without one', async () => {
  const tank = demo.tanks.tank1;
  const send = (commandId) => set(ref(state.careX.rtdb, `devices/${tank}/commands/latest`), {
    aquariumId: tank, commandId, type: 'feed_now', requestedAt: Date.now(), requestedBy: state.careX.uid, durationMs: 1500,
  });
  const entry = (commandId) => adminDb.doc(`command_logs/${tank}_${commandId}`);
  await send('e2e-feed-1');
  await waitFor(async () => (await entry('e2e-feed-1').get()).get('status') === 'pending', 'pending entry');
  assert.deepEqual((await entry('e2e-feed-1').get()).get('requestedBy'), { uid: state.careX.uid, displayName: demo.accounts.caretakerX.name });
  // The caretaker reads the log through the rules.
  assert.equal((await getDoc(doc(state.careX.db, 'command_logs', `${tank}_e2e-feed-1`))).get('status'), 'pending');

  const device = await deviceFor('tank1');
  await set(ref(device.rtdb, `devices/${tank}/commandAck/latest`), { commandId: 'e2e-feed-1', status: 'done', executedAt: serverTimestamp() });
  await waitFor(async () => (await entry('e2e-feed-1').get()).get('status') === 'done', 'done after the ack');

  await send('e2e-feed-2');
  await waitFor(async () => (await entry('e2e-feed-2').get()).get('status') === 'pending', 'second pending');
  // checkCommandAcks runs every minute in production; the emulator does not
  // run schedules, so call the same function 31 s "later".
  const result = await commandLog.markUnansweredCommands({ firestore: adminDb, now: () => Date.now() + 31_000 });
  assert.ok(result.marked >= 1);
  assert.equal((await entry('e2e-feed-2').get()).get('status'), 'no_response');

  // A scheduled action acked by the device gets its own entry.
  await set(ref(device.rtdb, `devices/${tank}/commandAck/latest`), { commandId: 'schedule-feed_now-e2e', status: 'done', executedAt: serverTimestamp(), source: 'schedule', type: 'feed_now' });
  await waitFor(async () => (await entry('schedule-feed_now-e2e').get()).get('source') === 'schedule', 'schedule entry');
});

test('6. the admin edits and approves a rule through the callables; it is audited', async () => {
  const adminUser = await signIn('admin');
  const current = (await adminDb.doc('rules/ph_high_warning').get()).data();
  const { status, approvedBy, approvedAt, ...content } = current;
  void status; void approvedBy; void approvedAt;
  await assert.rejects(state.ownerA.call('saveRuleConfig', { kind: 'rule', id: 'ph_high_warning', data: content }), /platform administrator/);
  await adminUser.call('saveRuleConfig', { kind: 'rule', id: 'ph_high_warning', data: { ...content, title: 'pH above range (e2e)', source: 'Adviser memo, Table 3' } });
  await adminUser.call('approveRuleConfig', { kind: 'rule', id: 'ph_high_warning' });
  const stored = (await adminDb.doc('rules/ph_high_warning').get()).data();
  assert.equal(stored.status, 'approved');
  assert.equal(stored.title, 'pH above range (e2e)');
  const actions = (await adminDb.collection('audit_logs').where('target', '==', 'rules/ph_high_warning').get()).docs.map((entry) => entry.get('action')).sort();
  assert.deepEqual(actions, ['rule.approve', 'rule.update']);
  // The engine's use of the approved rule (after its 5-minute cache) is
  // covered by RULES-01 in npm run test:sprint4-functions.
});

test('7. co-owner promotion reaches RTDB at once, and the last-owner guard holds', async () => {
  const orgId = demo.orgs.davaoPetShop;
  await assert.rejects(get(ref(state.careX.rtdb, `devices/${demo.tanks.tank2}/telemetry`)), /permission/i, 'a caretaker cannot read tank 2');
  await assert.rejects(state.ownerA.call('setMemberRole', { orgId, uid: state.ownerA.uid, role: 'caretaker' }), /at least one owner/);
  await state.ownerA.call('setMemberRole', { orgId, uid: state.careX.uid, role: 'owner' });
  assert.ok((await get(ref(state.careX.rtdb, `devices/${demo.tanks.tank2}/telemetry`))).exists(), 'the co-owner reads tank 2 immediately');
  assert.equal((await adminRtdb.ref(`authorization/aquariums/${demo.tanks.tank2}/coOwnerUids/${state.careX.uid}`).get()).val(), true);

  await state.careX.call('setMemberRole', { orgId, uid: state.careX.uid, role: 'caretaker' });
  await assert.rejects(get(ref(state.careX.rtdb, `devices/${demo.tanks.tank2}/telemetry`)), /permission/i, 'demotion ends access at once');
  await assert.rejects(state.ownerA.call('removeMember', { orgId, uid: state.ownerA.uid }), /at least one owner/);
});
