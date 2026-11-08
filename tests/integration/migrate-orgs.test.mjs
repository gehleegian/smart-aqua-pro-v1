// scripts/migrate-orgs.ts against a live-shaped fixture (emulator only).
// Run: npm run test:migrate-orgs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';

const root = process.cwd();
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp, deleteApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const PROJECT_ID = 'demo-smartaqua-migrate-orgs';
const LIVE = 'TtNtMT5Ba100fS66GZHc';
const LIVE_DEVICE = 'esp32-SAQ-7K3M-9R2X';
const OWNER = 'live-owner';
let app;
let firestore;
let database;
let auth;

function run(...flags) {
  return execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/migrate-orgs.ts', ...flags], {
    cwd: root,
    env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID },
    encoding: 'utf8',
  });
}

before(async () => {
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` }, 'migrate-test');
  firestore = getFirestore(app);
  database = getDatabase(app);
  auth = getAuth(app);
  await auth.createUser({ uid: OWNER, email: 'owner@example.test', emailVerified: true });
  await auth.createUser({ uid: 'admin-1', email: 'admin@example.test', emailVerified: true });
  await auth.setCustomUserClaims('admin-1', { keep: 'me' });
  await firestore.doc(`users/${OWNER}`).set({ name: 'Live Owner', email: 'owner@example.test', role: 'User' });
  await firestore.doc('users/admin-1').set({ name: 'Admin', email: 'admin@example.test', role: 'Admin' });
  await firestore.doc(`aquariums/${LIVE}`).set({ name: 'Aquarium 1', ownerId: OWNER, ownerName: 'Live Owner', species: ['Goldfish'], minTemp: 20, maxTemp: 24 });
  await firestore.doc('aquariums/halwan').set({ name: 'Halwan', ownerId: OWNER, ownerName: 'Live Owner', species: ['Goldfish'] });
  await database.ref('authorization').set({
    users: { [OWNER]: { role: 'User', emailVerificationRequired: true } },
    aquariums: {
      [LIVE]: { ownerUid: OWNER, state: 'active', deviceUids: { [LIVE_DEVICE]: true }, claimOperationId: 'device-claim-SAQ-7K3M-9R2X' },
      halwan: { ownerUid: OWNER, state: 'active' },
    },
  });
});

after(async () => {
  await deleteApp(app);
});

test('dry run writes nothing', async () => {
  const output = run('--dry-run');
  assert.match(output, /create organizations\/org-live-owner/);
  assert.match(output, /register SAQ-7K3M-9R2X as claimed/);
  assert.match(output, /set platformAdmin claim on Admin admin-1/);
  assert.equal((await firestore.doc('organizations/org-live-owner').get()).exists, false);
  assert.equal((await firestore.doc(`aquariums/${LIVE}`).get()).get('orgId'), undefined);
});

test('migration: personal org, orgId on each tank, claimed registry, binding, admin claim, mirror kept', async () => {
  run();
  const org = (await firestore.doc('organizations/org-live-owner').get()).data();
  assert.deepEqual({ name: org.name, type: org.type, status: org.status, createdBy: org.createdBy }, { name: 'Live Owner', type: 'personal', status: 'active', createdBy: OWNER });
  assert.equal((await firestore.doc(`organizations/org-live-owner/members/${OWNER}`).get()).get('role'), 'owner');
  for (const id of [LIVE, 'halwan']) {
    const aquarium = (await firestore.doc(`aquariums/${id}`).get()).data();
    assert.equal(aquarium.orgId, 'org-live-owner');
    assert.deepEqual(aquarium.caretakerIds, []);
    assert.equal(aquarium.ownerId, OWNER, 'ownerId kept');
  }
  assert.equal((await firestore.doc(`aquariums/${LIVE}`).get()).get('minTemp'), 20, 'profile untouched');
  const registry = (await firestore.doc('device_registry/SAQ-7K3M-9R2X').get()).data();
  assert.equal(registry.status, 'claimed');
  assert.equal(registry.claimCodeHash, null);
  assert.equal(registry.aquariumId, LIVE);
  assert.equal(registry.migratedFrom, 'device-claim-SAQ-7K3M-9R2X');
  assert.equal((await database.ref(`deviceBindings/${LIVE_DEVICE}`).get()).val(), LIVE);
  assert.deepEqual((await auth.getUser('admin-1')).customClaims, { keep: 'me', platformAdmin: true });

  const mirror = (await database.ref(`authorization/aquariums/${LIVE}`).get()).val();
  assert.equal(mirror.state, 'active');
  assert.equal(mirror.ownerUid, OWNER);
  assert.equal(mirror.orgId, 'org-live-owner');
  assert.deepEqual(mirror.deviceUids, { [LIVE_DEVICE]: true });
  assert.equal(mirror.claimOperationId, 'device-claim-SAQ-7K3M-9R2X');
});

test('re-running is a no-op', () => {
  assert.match(run(), /Migration plan: 0 step\(s\)/);
});

test('rollback removes exactly what the migration created', async () => {
  run('--rollback');
  assert.equal((await firestore.doc('organizations/org-live-owner').get()).exists, false);
  assert.equal((await firestore.doc(`organizations/org-live-owner/members/${OWNER}`).get()).exists, false);
  assert.equal((await firestore.doc(`aquariums/${LIVE}`).get()).get('orgId'), undefined);
  assert.equal((await firestore.doc(`aquariums/${LIVE}`).get()).get('deviceId'), undefined);
  assert.equal((await firestore.doc('device_registry/SAQ-7K3M-9R2X').get()).exists, false);
  assert.equal((await database.ref(`deviceBindings/${LIVE_DEVICE}`).get()).val(), null);
  assert.deepEqual((await auth.getUser('admin-1')).customClaims, { keep: 'me' });
  const mirror = (await database.ref(`authorization/aquariums/${LIVE}`).get()).val();
  assert.equal(mirror.state, 'active');
  assert.equal(mirror.orgId, undefined);
  assert.deepEqual(mirror.deviceUids, { [LIVE_DEVICE]: true });
  assert.equal(mirror.claimOperationId, 'device-claim-SAQ-7K3M-9R2X');
});
