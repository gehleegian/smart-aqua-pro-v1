// Sprint 3 "Done when", end to end on the Emulator Suite: real callables in
// the Functions emulator, client SDK under the Firestore and RTDB rules,
// devices signing in with the credentials provision-device generated.
// Run: npm run test:sprint3-e2e   (never touches a real project)
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after, before } from 'node:test';
import { deleteApp as deleteClientApp, initializeApp as initializeClientApp } from 'firebase/app';
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { connectDatabaseEmulator, get, getDatabase as getClientDatabase, ref, set } from 'firebase/database';
import {
  collection, collectionGroup, connectFirestoreEmulator, doc, getDoc, getDocs,
  getFirestore as getClientFirestore, query, setDoc, where, writeBatch,
} from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-smartaqua-sprint3';
const root = process.cwd();
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const admin = {
  app: requireFromFunctions('firebase-admin/app'),
  auth: requireFromFunctions('firebase-admin/auth'),
  firestore: requireFromFunctions('firebase-admin/firestore'),
  database: requireFromFunctions('firebase-admin/database'),
};
// In the emulator, functions' Admin SDK writes the access mirror to ns=<project>
// (as in triggerIntegration.test.ts), so clients use the same namespace and the
// RTDB rules see the mirror. (RTDB *triggers* watch <project>-default-rtdb in
// the emulator, so the Sprint 2 ingest trigger is covered by its own test.)
const DATABASE_URL = `http://127.0.0.1:9000?ns=${PROJECT_ID}`;
const LIVE = 'TtNtMT5Ba100fS66GZHc';
const LIVE_DEVICE_UID = 'esp32-SAQ-7K3M-9R2X';
const LIVE_TELEMETRY = {
  temperatureC: 26.5, temperatureReadingValid: true, waterLevelPercent: 15.7, waterPresent: true, ph: 8.12,
  tdsReadingValid: false, filterState: 'Active', equipmentStatus: 'Unknown', powerStatus: 'Unknown', online: true,
};
const clients = [];
let adminApp;
let adminAuth;
let adminDb;
let adminRtdb;
let labelDir;
const provisioned = [];
const state = {};

function client(name) {
  const app = initializeClientApp({ apiKey: 'demo-key', projectId: PROJECT_ID, databaseURL: DATABASE_URL, authDomain: 'localhost' }, name);
  const auth = getClientAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getClientFirestore(app);
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  const rtdb = getClientDatabase(app);
  connectDatabaseEmulator(rtdb, '127.0.0.1', 9000);
  const fns = getFunctions(app, 'asia-southeast1');
  connectFunctionsEmulator(fns, '127.0.0.1', 5001);
  const handle = { app, auth, db, rtdb, call: (fn, data) => httpsCallable(fns, fn)(data).then((result) => result.data) };
  clients.push(handle);
  return handle;
}

async function waitFor(check, label, timeoutMs = 20000) {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function denied(promise, label) {
  await assert.rejects(promise, (error) => /permission|PERMISSION_DENIED|insufficient/i.test(String(error?.code ?? error?.message ?? error)), label);
}

/** Signs up through the client SDK the way the app does, then verifies the email. */
async function signUp(name) {
  const handle = client(name);
  const email = `${name}@example.test`;
  const credential = await createUserWithEmailAndPassword(handle.auth, email, 'SmartAqua-Test-123!');
  const now = new Date().toISOString();
  await setDoc(doc(handle.db, 'users', credential.user.uid), {
    full_name: name, name, email, contact_number: '', role: 'User', account_status: 'active',
    created_at: now, updated_at: now, createdAt: now, updatedAt: now,
  });
  await adminAuth.updateUser(credential.user.uid, { emailVerified: true }); // stands in for the email link
  await credential.user.getIdToken(true);
  await waitFor(async () => (await adminRtdb.ref(`authorization/users/${credential.user.uid}/role`).get()).val() === 'User', `user mirror for ${name}`);
  return { ...handle, uid: credential.user.uid, email };
}

function readDeviceSecret(deviceId) {
  const header = readFileSync(path.join(root, 'firmware/secrets', `${deviceId}.h`), 'utf8');
  const value = (key) => new RegExp(`#define ${key} "([^"]+)"`).exec(header)[1];
  return { email: value('SMARTAQUA_DEVICE_EMAIL'), password: value('SMARTAQUA_DEVICE_PASSWORD') };
}

async function deviceClient(deviceId) {
  const handle = client(`device-${deviceId}`);
  const secret = readDeviceSecret(deviceId);
  const credential = await signInWithEmailAndPassword(handle.auth, secret.email, secret.password);
  const token = await credential.user.getIdTokenResult();
  assert.equal(token.claims.principalType, 'device');
  assert.equal(token.claims.deviceId, deviceId);
  return handle;
}

function wizardUpdate(owner, aquariumId, aquarium) {
  const updatedAt = new Date().toISOString();
  const profile = {
    name: 'Front counter tank', species: ['Goldfish'], tankLengthCm: 60, tankWidthCm: 30, tankHeightCm: 35, tankSizeLiters: 63,
    workingWaterVolumeLiters: 55, hasFiltrationSystem: true, filtrationSetup: 'Hang-on-back', filterCapacity: '400',
    fishCount: 2, fishWeightsG: [40, 55], status: 'active', updatedAt, directorySchemaVersion: 3,
  };
  const batch = writeBatch(owner.db);
  batch.update(doc(owner.db, 'aquariums', aquariumId), profile);
  batch.set(doc(owner.db, 'aquarium_directory', aquariumId), {
    name: profile.name, ownerId: aquarium.ownerId, ownerName: aquarium.ownerName, species: profile.species, fishCount: 2,
    tankType: 'Freshwater', tankSizeLiters: 63, tankLengthCm: 60, tankWidthCm: 30, tankHeightCm: 35, workingWaterVolumeLiters: 55,
    hasFiltrationSystem: true, filtrationSetup: 'Hang-on-back', createdAt: aquarium.createdAt, updatedAt, schemaVersion: 3,
  });
  return batch.commit();
}

before(async () => {
  adminApp = admin.app.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL }, 'sprint3-admin');
  adminAuth = admin.auth.getAuth(adminApp);
  adminDb = admin.firestore.getFirestore(adminApp);
  adminRtdb = admin.database.getDatabase(adminApp);
  const seed = JSON.parse(readFileSync(path.join(root, 'scripts/seed/goldfish-draft.json'), 'utf8'));
  const batch = adminDb.batch();
  for (const [id, data] of Object.entries(seed.species)) batch.set(adminDb.doc(`species/${id}`), data);
  for (const [id, data] of Object.entries(seed.rules)) batch.set(adminDb.doc(`rules/${id}`), data);
  await batch.commit();
  labelDir = mkdtempSync(path.join(tmpdir(), 'smartaqua-labels-'));
  // Emulator only: firebase.json rules cover the -default-rtdb namespace, so
  // load the same database.rules.json into the namespace used here.
  const response = await fetch(`http://127.0.0.1:9000/.settings/rules.json?ns=${PROJECT_ID}`, {
    method: 'PUT',
    headers: { Authorization: 'Bearer owner' },
    body: readFileSync(path.join(root, 'database.rules.json'), 'utf8'),
  });
  assert.equal(response.status, 200, await response.text());
});

after(async () => {
  for (const handle of clients) await deleteClientApp(handle.app).catch(() => undefined);
  await admin.app.deleteApp(adminApp);
  for (const deviceId of provisioned) rmSync(path.join(root, 'firmware/secrets', `${deviceId}.h`), { force: true });
  rmSync(labelDir, { recursive: true, force: true });
});

test('1. provision 2 devices', () => {
  const output = execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/provision-device.ts', '--count', '2', '--out', labelDir], {
    cwd: root, env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID }, encoding: 'utf8',
  });
  for (const match of output.matchAll(/Provisioned (SAQ-[A-Z0-9]{4}-[A-Z0-9]{4})/g)) provisioned.push(match[1]);
  assert.equal(provisioned.length, 2);
  state.claims = provisioned.map((deviceId) => JSON.parse(readFileSync(path.join(labelDir, deviceId, 'claim.json'), 'utf8')));
  assert.match(state.claims[0].uri, /^smartaqua:\/\/claim\?d=SAQ-[A-Z0-9-]+&c=[A-Z0-9]{8}$/);
});

test('2. Owner A signs up, claims device 1 ("Davao Pet Shop"), finishes the wizard, claims device 2', async () => {
  const ownerA = await signUp('owner-a');
  state.ownerA = ownerA;
  assert.equal((await getDocs(query(collectionGroup(ownerA.db, 'members'), where('uid', '==', ownerA.uid)))).size, 0, 'a new account starts with no org');
  await assert.rejects(ownerA.call('claimDevice', { deviceId: state.claims[0].deviceId, claimCode: 'ZZZZ2345', aquariumName: 'x' }), /Invalid code/);

  const first = await ownerA.call('claimDevice', { deviceId: state.claims[0].deviceId, claimCode: state.claims[0].claimCode, aquariumName: 'Tank 1', orgName: 'Davao Pet Shop' });
  assert.equal(first.orgCreated, true);
  state.orgId = first.orgId;
  state.tank1 = first.aquariumId;
  const org = await getDoc(doc(ownerA.db, 'organizations', first.orgId));
  assert.equal(org.get('name'), 'Davao Pet Shop');
  const aquarium = (await getDoc(doc(ownerA.db, 'aquariums', state.tank1))).data();
  assert.equal(aquarium.status, 'setup');
  await wizardUpdate(ownerA, state.tank1, aquarium);
  assert.equal((await getDoc(doc(ownerA.db, 'aquariums', state.tank1))).get('status'), 'active');

  const second = await ownerA.call('claimDevice', { deviceId: state.claims[1].deviceId, claimCode: state.claims[1].claimCode, aquariumName: 'Tank 2' });
  assert.equal(second.orgId, state.orgId);
  assert.equal(second.orgCreated, false);
  state.tank2 = second.aquariumId;
  const tanks = await getDocs(query(collection(ownerA.db, 'aquariums'), where('orgId', '==', state.orgId)));
  assert.deepEqual(tanks.docs.map((entry) => entry.id).sort(), [state.tank1, state.tank2].sort());

  // Both provisioned devices can now publish telemetry for their own tank only.
  for (const [deviceId, tank] of [[provisioned[0], state.tank1], [provisioned[1], state.tank2]]) {
    const device = await deviceClient(deviceId);
    await set(ref(device.rtdb, `devices/${tank}/telemetry`), { ...LIVE_TELEMETRY, updatedAt: Date.now() });
    assert.equal((await get(ref(device.rtdb, `deviceBindings/esp32-${deviceId}`))).val(), tank);
  }
  const strayDevice = await deviceClient(provisioned[0]);
  await denied(set(ref(strayDevice.rtdb, `devices/${state.tank2}/telemetry`), { ...LIVE_TELEMETRY, updatedAt: Date.now() }), 'device 1 cannot write tank 2');
});

test('3. Owner A invites Caretaker X for tank 1 only, and X accepts', async () => {
  const invite = await state.ownerA.call('createInvite', { orgId: state.orgId, email: 'care-x@example.test', aquariumIds: [state.tank1] });
  assert.match(invite.path, /^\/invite\//);
  const caretaker = await signUp('care-x');
  state.careX = caretaker;
  const accepted = await caretaker.call('acceptInvite', { token: invite.path.slice('/invite/'.length) });
  assert.deepEqual(accepted.aquariumIds, [state.tank1]);
  await assert.rejects(caretaker.call('acceptInvite', { token: invite.path.slice('/invite/'.length) }), /already been used/);
});

test('4. X sees tank 1 only, can send it a command, and is denied everything on tank 2', async () => {
  const x = state.careX;
  const mine = await getDocs(query(collection(x.db, 'aquariums'), where('orgId', '==', state.orgId), where('caretakerIds', 'array-contains', x.uid)));
  assert.deepEqual(mine.docs.map((entry) => entry.id), [state.tank1]);
  await denied(getDocs(query(collection(x.db, 'aquariums'), where('orgId', '==', state.orgId))), 'X cannot list the whole org');
  assert.equal((await get(ref(x.rtdb, `devices/${state.tank1}/telemetry`))).val().ph, 8.12);
  await set(ref(x.rtdb, `devices/${state.tank1}/commands/latest`), {
    aquariumId: state.tank1, commandId: `feed_now-${Date.now()}`, type: 'feed_now', requestedAt: Date.now(), requestedBy: x.uid, durationMs: 1500,
  });
  await denied(set(ref(x.rtdb, `devices/${state.tank1}/control`), {
    mode: 'manual', automationEnabled: false, feedingTimes: ['08:00'], filtrationStartTime: '06:00', filtrationRuntimeHours: 12,
    manualLightState: 'Off', manualFilterState: 'Active', updatedAt: Date.now(),
  }), 'X cannot change schedules');
  await denied(getDoc(doc(x.db, 'aquariums', state.tank2)), 'tank 2 profile');
  await denied(get(ref(x.rtdb, `devices/${state.tank2}/telemetry`)), 'tank 2 telemetry');
  await denied(set(ref(x.rtdb, `devices/${state.tank2}/commands/latest`), {
    aquariumId: state.tank2, commandId: 'x', type: 'feed_now', requestedAt: Date.now(), requestedBy: x.uid, durationMs: 1500,
  }), 'tank 2 command');
  await denied(getDocs(query(collection(x.db, 'recommendations'), where('aquariumId', '==', state.tank2))), 'tank 2 recommendations');
  await assert.rejects(x.call('createInvite', { orgId: state.orgId, email: 'y@example.test', aquariumIds: [state.tank1] }), /owner/);
});

test('5. Owner A removes X, and X loses access immediately', async () => {
  await state.ownerA.call('removeMember', { orgId: state.orgId, uid: state.careX.uid });
  await denied(getDoc(doc(state.careX.db, 'aquariums', state.tank1)), 'tank 1 profile after removal');
  await denied(get(ref(state.careX.rtdb, `devices/${state.tank1}/telemetry`)), 'tank 1 telemetry after removal');
  await denied(set(ref(state.careX.rtdb, `devices/${state.tank1}/commands/latest`), {
    aquariumId: state.tank1, commandId: 'late', type: 'feed_now', requestedAt: Date.now(), requestedBy: state.careX.uid, durationMs: 1500,
  }), 'tank 1 command after removal');
  const logs = await getDocs(query(collection(state.ownerA.db, 'audit_logs'), where('orgId', '==', state.orgId)));
  assert.deepEqual(logs.docs.map((entry) => entry.get('action')).sort(), ['device.claim', 'device.claim', 'invite.accept', 'invite.create', 'member.remove']);
});

test('6. Owner B cannot see anything of org A', async () => {
  const ownerB = await signUp('owner-b');
  assert.equal((await getDocs(query(collectionGroup(ownerB.db, 'members'), where('uid', '==', ownerB.uid)))).size, 0);
  await denied(getDocs(query(collection(ownerB.db, 'aquariums'), where('orgId', '==', state.orgId))), 'org A aquariums');
  await denied(getDoc(doc(ownerB.db, 'aquariums', state.tank1)), 'tank 1');
  await denied(getDoc(doc(ownerB.db, 'organizations', state.orgId)), 'org A doc');
  await denied(getDocs(collection(ownerB.db, 'organizations', state.orgId, 'members')), 'org A members');
  await denied(getDocs(query(collection(ownerB.db, 'invites'), where('orgId', '==', state.orgId))), 'org A invites');
  await denied(get(ref(ownerB.rtdb, `devices/${state.tank1}/telemetry`)), 'org A telemetry');
  await assert.rejects(ownerB.call('claimDevice', { deviceId: state.claims[0].deviceId, claimCode: state.claims[0].claimCode, aquariumName: 'steal' }), /Already registered, contact the owner/);
});

test('7. the migrated Aquarium 1 still accepts live-format telemetry from its device, and its owner sees it', async () => {
  // Live-shaped legacy data: an aquarium without orgId, the mirror as on 2026-11-06.
  const liveOwner = await signUp('live-owner');
  await adminDb.doc(`aquariums/${LIVE}`).set({
    name: 'Aquarium 1', ownerId: liveOwner.uid, ownerName: 'live-owner', species: ['Goldfish'], tankType: 'Freshwater',
    tankLengthCm: 9, tankWidthCm: 10, tankHeightCm: 9, workingWaterVolumeLiters: 10, minTemp: 20, maxTemp: 24,
    createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-05-01T00:00:00.000Z', directorySchemaVersion: 3,
  });
  await waitFor(async () => (await adminRtdb.ref(`authorization/aquariums/${LIVE}/state`).get()).val() === 'active', 'live mirror');
  await adminRtdb.ref(`authorization/aquariums/${LIVE}`).update({ deviceUids: { [LIVE_DEVICE_UID]: true }, claimOperationId: 'device-claim-SAQ-7K3M-9R2X' });
  await adminAuth.createUser({ uid: LIVE_DEVICE_UID, email: 'live-device@devices.smartaqua.invalid', password: 'live-device-emulator-only' });
  await adminAuth.setCustomUserClaims(LIVE_DEVICE_UID, { principalType: 'device' });

  const output = execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/migrate-orgs.ts', '--database-url', DATABASE_URL], {
    cwd: root, env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID }, encoding: 'utf8',
  });
  assert.match(output, /register SAQ-7K3M-9R2X as claimed/);

  const device = client('live-device');
  await signInWithEmailAndPassword(device.auth, 'live-device@devices.smartaqua.invalid', 'live-device-emulator-only');
  const reading = { ...LIVE_TELEMETRY, updatedAt: Date.now() };
  await set(ref(device.rtdb, `devices/${LIVE}/telemetry`), reading);
  assert.equal((await get(ref(device.rtdb, `deviceBindings/${LIVE_DEVICE_UID}`))).val(), LIVE);

  const orgId = `org-${liveOwner.uid}`;
  const visible = await getDocs(query(collection(liveOwner.db, 'aquariums'), where('orgId', '==', orgId)));
  assert.deepEqual(visible.docs.map((entry) => entry.id), [LIVE]);
  assert.equal((await get(ref(liveOwner.rtdb, `devices/${LIVE}/telemetry`))).val().updatedAt, reading.updatedAt);
  const mirror = (await adminRtdb.ref(`authorization/aquariums/${LIVE}`).get()).val();
  assert.equal(mirror.state, 'active');
  assert.equal(mirror.orgId, orgId);
  assert.equal(mirror.claimOperationId, 'device-claim-SAQ-7K3M-9R2X');
});
