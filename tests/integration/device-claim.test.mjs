import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeApp, deleteApp, getApps } from 'firebase-admin/app';
import { randomBytes } from 'node:crypto';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, set, get } from 'firebase/database';
import { claimDevice } from '../../src/server/deviceClaim.ts';
import { POST } from '../../src/app/api/devices/claim/route.ts';

const projectId = 'demo-smartaqua-device-claims';
process.env.SMARTAQUA_DEVICE_CLAIMING_ENABLED = 'true';
process.env.FIREBASE_ADMIN_PROJECT_ID = projectId;
process.env.FIREBASE_ADMIN_DATABASE_URL = `https://${projectId}.firebaseio.com`;
for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) {
  if (!process.env[name]) throw new Error(`Refusing to run without ${name}`);
}
const app = initializeApp({ projectId, databaseURL: `https://${projectId}.firebaseio.com` });
const deps = { auth: getAuth(app), firestore: getFirestore(app), database: getDatabase(app) };
const actor = { uid: 'owner-a', emailVerified: true };
const other = { uid: 'owner-b', emailVerified: true };
const deviceId = 'SAQ-TEST-0001';
const deviceUid = 'esp32-test-1';
const aquariumId = 'reserved-aquarium-1';
const input = { deviceId, profile: { name: 'Aquarium 1', species: ['Goldfish'],
  tankType: 'Freshwater', tankLengthCm: 50, tankWidthCm: 25, tankHeightCm: 30,
  workingWaterVolumeLiters: 25, hasFiltrationSystem: true, fishCount: 1, fishWeightsG: [5],
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80 } };
let environment;
const testPassword = randomBytes(24).toString('hex');
before(async () => {
  environment = await initializeTestEnvironment({ projectId,
    firestore: { rules: await readFile(process.env.SMARTAQUA_CLAIM_RULES_FILE || 'firestore.rules', 'utf8') },
    database: { rules: await readFile('database.rules.json', 'utf8') },
  });
  for (const uid of [actor.uid, other.uid, deviceUid]) {
    await deps.auth.createUser({ uid, email: `${uid}@example.test`, emailVerified: true, password: testPassword });
  }
  await deps.auth.setCustomUserClaims(deviceUid, { principalType: 'device' });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await deps.database.ref().set(null);
  await deps.auth.updateUser(deviceUid, { disabled: false });
  for (const uid of [actor.uid, other.uid]) await deps.firestore.doc(`users/${uid}`).set({ role: 'User', name: uid });
  await deps.firestore.doc(`device_registry/${deviceId}`).set({ deviceUid, aquariumId,
    state: 'unclaimed', schemaVersion: 1 });
  await deps.firestore.doc(`device_uid_registry/${deviceUid}`).set({ deviceId });
});
after(async () => { await environment?.cleanup(); await Promise.all(getApps().map(deleteApp)); });

test('ID-only claim creates exactly one profile, directory, owner mirror and device grant', async () => {
  const result = await claimDevice(deps, actor, input);
  assert.equal(result.aquariumId, aquariumId);
  const aquarium = (await deps.firestore.doc(`aquariums/${aquariumId}`).get()).data();
  assert.equal(aquarium.ownerId, actor.uid);
  assert.equal(aquarium.deviceUid, deviceUid);
  for (const field of ['temp', 'level', 'quality', 'tdsPpm', 'claimCode']) assert.equal(field in aquarium, false);
  assert.equal((await deps.firestore.collection('aquariums').get()).size, 1);
  assert.equal((await deps.firestore.doc(`aquarium_directory/${aquariumId}`).get()).get('ownerId'), actor.uid);
  const mirror = (await deps.database.ref(`authorization/aquariums/${aquariumId}`).get()).val();
  assert.equal(mirror.state, 'active');
  assert.deepEqual(mirror.deviceUids, { [deviceUid]: true });
});
test('unknown device, device principal and Admin cannot claim', async () => {
  await assert.rejects(claimDevice(deps, actor, { ...input, deviceId: 'SAQ-NONE-0000' }));
  await assert.rejects(claimDevice(deps, { uid: deviceUid, emailVerified: true, principalType: 'device' }, input));
  await deps.firestore.doc(`users/${actor.uid}`).update({ role: 'Admin' });
  await assert.rejects(claimDevice(deps, actor, input));
  assert.equal((await deps.firestore.collection('aquariums').get()).size, 0);
});
test('unverified user requires explicit trusted legacy exemption', async () => {
  await assert.rejects(claimDevice(deps, { ...actor, emailVerified: false }, input));
  await deps.firestore.doc(`authorization_user_policies/${actor.uid}`).set({ emailVerificationRequired: false });
  assert.equal((await claimDevice(deps, { ...actor, emailVerified: false }, input)).status, 'claimed');
});
test('blocked users and disabled devices cannot claim', async () => {
  await deps.firestore.doc(`security_user_blocks/${actor.uid}`).set({ operationId: 'revoke' });
  await assert.rejects(claimDevice(deps, actor, input));
  await deps.firestore.doc(`security_user_blocks/${actor.uid}`).delete();
  await deps.auth.updateUser(deviceUid, { disabled: true });
  await assert.rejects(claimDevice(deps, actor, input));
});
test('two users racing for one device have exactly one winner', async () => {
  const results = await Promise.allSettled([claimDevice(deps, actor, input), claimDevice(deps, other, input)]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await deps.firestore.collection('aquariums').get()).size, 1);
  const owner = (await deps.firestore.doc(`aquariums/${aquariumId}`).get()).get('ownerId');
  assert.equal((await deps.database.ref(`authorization/aquariums/${aquariumId}/ownerUid`).get()).val(), owner);
});
test('same owner retry does not create duplicates or replace the original profile', async () => {
  await claimDevice(deps, actor, input);
  await claimDevice(deps, actor, { ...input, profile: { ...input.profile, name: 'Not a profile update' } });
  assert.equal((await deps.firestore.doc(`aquariums/${aquariumId}`).get()).get('name'), 'Aquarium 1');
  await assert.rejects(claimDevice(deps, other, input));
  assert.equal((await deps.firestore.collection('aquariums').get()).size, 1);
});
test('concurrent retries by the same owner converge to one aquarium', async () => {
  await Promise.allSettled([claimDevice(deps, actor, input), claimDevice(deps, actor, input)]);
  assert.equal((await claimDevice(deps, actor, input)).status, 'claimed');
  assert.equal((await deps.firestore.collection('aquariums').get()).size, 1);
});
test('revocation during setup is not overwritten by activation or retry', async () => {
  await assert.rejects(claimDevice({ ...deps, afterStep: async step => {
    if (step === 'prepared') await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).set('revoked');
  } }, actor, input));
  await assert.rejects(claimDevice(deps, actor, input));
  assert.equal((await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).get()).val(), 'revoked');
});
test('a block added before completion closes this claim without deleting the block', async () => {
  await assert.rejects(claimDevice({ ...deps, afterStep: async step => {
    if (step === 'activated') await deps.firestore.doc(`security_aquarium_blocks/${aquariumId}`).set({ operationId: 'admin-revoke' });
  } }, actor, input));
  assert.equal((await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).get()).val(), 'revoked');
  assert.equal((await deps.firestore.doc(`security_aquarium_blocks/${aquariumId}`).get()).get('operationId'), 'admin-revoke');
});
for (const step of ['reserved', 'staged', 'prepared', 'activated']) {
  test(`interruption after ${step} resumes without duplicate ownership`, async () => {
    await assert.rejects(claimDevice({ ...deps, afterStep: async current => {
      if (current === step) throw new Error('Injected crash');
    } }, actor, input));
    if (step !== 'activated') {
      assert.notEqual((await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).get()).val(), 'active');
    }
    assert.equal((await claimDevice(deps, actor, input)).status, 'claimed');
    assert.equal((await deps.firestore.collection('aquariums').get()).size, 1);
  });
}
test('revoked access is never resurrected by retry', async () => {
  await claimDevice(deps, actor, input);
  await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).set('revoked');
  await assert.rejects(claimDevice(deps, actor, input));
  assert.equal((await deps.database.ref(`authorization/aquariums/${aquariumId}/state`).get()).val(), 'revoked');
});
test('a foreign security block remains intact during recovery', async () => {
  await assert.rejects(claimDevice({ ...deps, afterStep: async step => {
    if (step === 'reserved') throw new Error('crash');
  } }, actor, input));
  await deps.firestore.doc(`security_aquarium_blocks/${aquariumId}`).set({ operationId: 'admin-revoke' });
  await assert.rejects(claimDevice(deps, actor, input));
  assert.equal((await deps.firestore.doc(`security_aquarium_blocks/${aquariumId}`).get()).get('operationId'), 'admin-revoke');
});
test('limits attempts across server instances', async () => {
  for (let index = 0; index < 10; index++) {
    await assert.rejects(claimDevice(deps, actor, { ...input, deviceId: 'SAQ-NONE-0000' }));
  }
  await assert.rejects(claimDevice(deps, actor, input), error => error.status === 429);
});
test('rules deny direct claims, secret reads and forged owner/UID fields', async () => {
  const user = environment.authenticatedContext(actor.uid, { email_verified: true });
  const otherUser = environment.authenticatedContext(other.uid, { email_verified: true });
  await assertFails(getDoc(doc(user.firestore(), 'device_registry', deviceId)));
  await assertFails(setDoc(doc(user.firestore(), 'device_registry', deviceId), { state: 'claimed' }));
  await assertFails(setDoc(doc(user.firestore(), 'aquariums', 'forged'), { ownerId: actor.uid }));
  await claimDevice(deps, actor, input);
  await assertSucceeds(getDoc(doc(user.firestore(), 'aquariums', aquariumId)));
  await assertFails(getDoc(doc(otherUser.firestore(), 'aquariums', aquariumId)));
  await assertFails(updateDoc(doc(user.firestore(), 'aquariums', aquariumId), { deviceUid: 'evil-device' }));
  await assertFails(set(ref(user.database(), `authorization/aquariums/${aquariumId}/deviceUids/evil-device`), true));
  const device = environment.authenticatedContext(deviceUid, { principalType: 'device' });
  const telemetry = { temperatureC: 24, waterLevelPercent: 50, updatedAt: Date.now(), online: true };
  await assertSucceeds(set(ref(device.database(), `devices/${aquariumId}/telemetry`), telemetry));
  await assertSucceeds(get(ref(user.database(), `devices/${aquariumId}/telemetry`)));
  await assertFails(get(ref(otherUser.database(), `devices/${aquariumId}/telemetry`)));
  await assertFails(set(ref(device.database(), 'devices/other-aquarium/telemetry'), telemetry));
});

test('a newly claimed profile remains editable without inventing telemetry', async () => {
  await claimDevice(deps, actor, input);
  const db = environment.authenticatedContext(actor.uid, { email_verified: true }).firestore();
  const batch = writeBatch(db);
  const changes = { name: 'Renamed Aquarium', updatedAt: new Date().toISOString() };
  batch.update(doc(db, 'aquariums', aquariumId), changes);
  batch.update(doc(db, 'aquarium_directory', aquariumId), changes);
  await assertSucceeds(batch.commit());
  const updated = await getDoc(doc(db, 'aquariums', aquariumId));
  assert.equal(updated.get('name'), changes.name);
  assert.equal(updated.get('temp'), undefined);
});
test('claimed owner can issue light/filter commands read only by the assigned device', async () => {
  await claimDevice(deps, actor, input);
  const owner = environment.authenticatedContext(actor.uid, { email_verified: true }).database();
  const wrongOwner = environment.authenticatedContext(other.uid, { email_verified: true }).database();
  const device = environment.authenticatedContext(deviceUid, { principalType: 'device' }).database();
  const wrongDevice = environment.authenticatedContext('other-device', { principalType: 'device' }).database();
  const path = `devices/${aquariumId}/commands/latest`;
  for (const [type, state] of [['set_light_state', 'On'], ['set_light_state', 'Off'],
    ['set_filter_state', 'Active'], ['set_filter_state', 'Inactive']]) {
    const command = { aquariumId, commandId: `${type}-${state}`, type, state,
      requestedAt: Date.now(), requestedBy: actor.uid };
    await assertSucceeds(set(ref(owner, path), command));
    assert.equal((await assertSucceeds(get(ref(device, path)))).val().state, state);
    await assertFails(get(ref(wrongDevice, path)));
    await assertFails(set(ref(wrongOwner, path), { ...command, requestedBy: other.uid }));
  }
});

test('HTTP boundary rejects missing auth, foreign origins and incorrect content type', async () => {
  const request = headers => new Request('http://localhost:3000/api/devices/claim', { method: 'POST', headers });
  assert.equal((await POST(request({}))).status, 401);
  assert.equal((await POST(request({ Origin: 'https://untrusted.example' }))).status, 403);
  assert.equal((await POST(request({ Authorization: 'Bearer test' }))).status, 415);
  assert.equal((await POST(request({ Authorization: 'Bearer invalid', 'Content-Type': 'application/json' }))).status, 401);
});
test('HTTP boundary verifies an emulator ID token, enforces body limit and completes a claim', async () => {
  const login = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=emulator-only`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: `${actor.uid}@example.test`, password: testPassword, returnSecureToken: true }),
  });
  assert.equal(login.ok, true);
  const { idToken } = await login.json();
  const request = body => new Request('http://localhost:3000/api/devices/claim', {
    method: 'POST', headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, body,
  });
  assert.equal((await POST(request('x'.repeat(32_769)))).status, 413);
  assert.equal((await POST(request('{'))).status, 400);
  const response = await POST(request(JSON.stringify(input)));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'claimed', aquariumId, deviceId });
});
