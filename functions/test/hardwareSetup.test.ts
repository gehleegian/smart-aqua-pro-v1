// Emulator-only authorization/transaction tests. No production writes or telemetry.
import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { deviceHardwareSetup } from '../src/hardwareSetup.js';
import { confirmedHardware } from '../src/shared/hardwareInventory.js';
import { clearCollections } from './testSeed.js';

let app: App;
let firestore: Firestore;
const actor = { uid: 'owner', email: 'owner@example.test', emailVerified: true, platformAdmin: false };
const inventory = { sensors: [{ type: 'temperature', count: 2 }, { type: 'ph', count: 1 }], equipment: ['lights', 'filter'] };
const call = (input: Record<string, unknown> = {}, who = actor) => deviceHardwareSetup({ firestore, now: () => 123456 }, who,
  { aquariumId: 'tank', mode: 'read', ...input });
before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw new Error('Local Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-smartaqua-hardware-setup' }, 'hardware-setup-tests');
  firestore = getFirestore(app);
});
beforeEach(async () => {
  await clearCollections(firestore, ['users', 'organizations', 'aquariums', 'device_registry', 'audit_logs']);
  const batch = firestore.batch();
  batch.set(firestore.doc('users/owner'), { role: 'User', account_status: 'inactive' }); // Informational only.
  batch.set(firestore.doc('organizations/org'), { status: 'active' });
  batch.set(firestore.doc('organizations/org/members/owner'), { role: 'owner' });
  batch.set(firestore.doc('aquariums/tank'), { status: 'setup', orgId: 'org', ownerId: 'owner', deviceId: 'SAQ-TEST-0001', deviceUid: 'device', caretakerIds: ['helper'] });
  batch.set(firestore.doc('device_registry/SAQ-TEST-0001'), { status: 'claimed', aquariumId: 'tank', deviceUid: 'device', claimCodeHash: 'PRIVATE-TEST-FIXTURE' });
  await batch.commit();
});
after(async () => { await deleteApp(app); });

test('read returns only hardware metadata; confirmation saves only inventory and audit', async () => {
  const initial = await call();
  assert.equal(initial.confirmed, false); assert.equal(initial.inventory, null);
  assert.doesNotMatch(JSON.stringify(initial), /PRIVATE/);
  const result = await call({ mode: 'confirm', confirmed: true, inventory });
  assert.equal(result.confirmed, true);
  const doc = await firestore.doc('device_registry/SAQ-TEST-0001').get();
  assert.equal(doc.get('hardwareConfirmedBy'), 'owner'); assert.equal(doc.get('hardwareConfirmedAt'), 123456);
  assert.equal(doc.get('claimCodeHash'), 'PRIVATE-TEST-FIXTURE');
  assert.equal(doc.get('status'), 'claimed');
  assert.equal((await firestore.doc('aquariums/tank').get()).get('status'), 'setup');
  assert.equal((await firestore.collection('audit_logs').get()).size, 1);
  assert.deepEqual((await call()).inventory, result.inventory);
});

test('parallel/reordered retries are idempotent and do not duplicate audits', async () => {
  const reversed = { sensors: [...inventory.sensors].reverse(), equipment: [...inventory.equipment].reverse() };
  const results = await Promise.all([call({ mode: 'confirm', confirmed: true, inventory }), call({ mode: 'confirm', confirmed: true, inventory: reversed })]);
  assert.deepEqual(results[0].inventory, results[1].inventory);
  assert.equal((await firestore.collection('audit_logs').get()).size, 1);
  await assert.rejects(call({ mode: 'confirm', confirmed: true, inventory: { sensors: [{ type: 'ph', count: 9 }], equipment: [] } }), /already confirmed/);
});

test('unverified, platform-admin, profile-admin, caretaker and unrelated users cannot confirm', async () => {
  await assert.rejects(call({}, { ...actor, emailVerified: false }), /Verify/);
  await assert.rejects(call({}, { ...actor, platformAdmin: true }), /read-only/);
  await firestore.doc('users/owner').update({ role: 'Admin' });
  await assert.rejects(call(), /owner account/);
  await firestore.doc('organizations/org/members/helper').set({ role: 'caretaker' });
  await assert.rejects(call({}, { ...actor, uid: 'helper' }), /Only an owner/);
  await assert.rejects(call({}, { ...actor, uid: 'stranger' }), /access/);
  assert.equal((await firestore.collection('audit_logs').get()).size, 0);
});

test('suspended organization and mismatched or unclaimed bindings fail closed', async () => {
  await firestore.doc('organizations/org').update({ status: 'suspended' });
  await assert.rejects(call(), /suspended/);
  await firestore.doc('organizations/org').update({ status: 'active' });
  await firestore.doc('device_registry/SAQ-TEST-0001').update({ aquariumId: 'other' });
  await assert.rejects(call(), /binding/);
  await firestore.doc('device_registry/SAQ-TEST-0001').update({ aquariumId: 'tank', deviceUid: 'other' });
  await assert.rejects(call(), /binding/);
  await firestore.doc('device_registry/SAQ-TEST-0001').update({ deviceUid: 'device', status: 'unclaimed' });
  await assert.rejects(call(), /binding/);
});

test('invalid quantities, unknown types, duplicates and missing acknowledgement never write', async () => {
  await assert.rejects(call({ mode: 'confirm', inventory }), /checklist/);
  for (const bad of [
    { sensors: [], equipment: [] }, { sensors: [{ type: 'ph', count: 0 }], equipment: [] },
    { sensors: [{ type: 'ph', count: 1.5 }], equipment: [] }, { sensors: [{ type: 'ph', count: 101 }], equipment: [] },
    { sensors: [{ type: 'unknown', count: 1 }], equipment: [] }, { ...inventory, equipment: ['pump-unknown'] },
    { ...inventory, sensors: [...inventory.sensors, inventory.sensors[0]] }, { ...inventory, deviceId: 'other' },
  ]) await assert.rejects(call({ mode: 'confirm', confirmed: true, inventory: bad }), error => (error as { code: string }).code === 'invalid-argument');
  assert.equal((await firestore.collection('audit_logs').get()).size, 0);
});

test('both known aquariums remain confirmed without any migration or repeat setup', async () => {
  for (const deviceId of ['SAQ-7K3M-9R2X', 'SAQ-HGCA-SJRS']) {
    await firestore.doc('aquariums/tank').update({ status: 'active', deviceId });
    await firestore.doc(`device_registry/${deviceId}`).set({ state: 'claimed', aquariumId: 'tank', deviceUid: 'device' });
    const result = await call();
    assert.equal(result.confirmed, true); assert.equal(result.source, 'owner-confirmed');
    assert.deepEqual(result.inventory, confirmedHardware(deviceId));
    assert.equal(result.inventory!.sensors.reduce((sum, sensor) => sum + sensor.count, 0), 6);
    await call({ mode: 'confirm' }); // No checklist required and no writes.
    assert.equal((await firestore.doc(`device_registry/${deviceId}`).get()).get('hardwareConfirmedAt'), undefined);
  }
  assert.equal((await firestore.collection('audit_logs').get()).size, 0);
});

test('active unknown legacy aquariums are not forced into a new confirmation flow', async () => {
  await firestore.doc('aquariums/tank').update({ status: 'active' });
  await assert.rejects(call({ mode: 'confirm', confirmed: true, inventory }), /new-device setup/);
});

test('path injection and unsupported operations are rejected', async () => {
  await assert.rejects(call({ aquariumId: '../other' }), /invalid/);
  await assert.rejects(call({ mode: 'delete' }), /Invalid/);
});
