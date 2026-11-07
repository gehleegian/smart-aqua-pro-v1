// scripts/convert-pr8-registry.ts on Gian's PR #8 schema, seeded exactly as the
// live data looks (docs/security/review-handoff-2026-11-07.md,
// aquarium2-live-setup-status.md; writers: scripts/provision-device.mjs and
// src/server/deviceClaim.ts). Emulator only.
// Run: npm run test:convert-pr8
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';

const root = process.cwd();
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp, deleteApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const PROJECT_ID = 'demo-smartaqua-convert-pr8';
const PEPPER = 'emulator-test-pepper';
const OUT = path.join(root, 'provisioning-output', PROJECT_ID);

// Aquarium 1: the original live tank (pre-claiming; migrate-orgs registers its device).
const AQ1 = 'TtNtMT5Ba100fS66GZHc';
const AQ1_DEVICE_UID = 'esp32-SAQ-7K3M-9R2X';
// Aquarium 2: registered by setup-aquarium2.mjs + provision-device.mjs, claimed through his ID-only route.
const AQ2 = 'Aq2ReservedByProvisioning';
const AQ2_DEVICE = 'SAQ-4M7Q-X2P9';
const AQ2_DEVICE_UID = 'aq2DeviceAuthUid0001';
const USER1 = 'live-owner';
const USER2 = 'user-two';
// A device he provisioned that nobody has claimed (reserved aquarium ID, no aquarium doc).
const SPARE = 'Aq3ReservedNoDocYet';
const SPARE_DEVICE = 'SAQ-9T3K-H6W2';
const SPARE_DEVICE_UID = 'spareDeviceAuthUid002';
// A claim left half-way (state 'claiming') must be skipped, not converted.
const STUCK_DEVICE = 'SAQ-5R8N-B3V7';

const CREATED = '2026-11-07T03:12:45.120Z';
const CLAIMED = '2026-11-07T05:40:10.002Z';
const SEED = {
  registry: {
    [AQ2_DEVICE]: { deviceUid: AQ2_DEVICE_UID, aquariumId: AQ2, state: 'claimed', schemaVersion: 1, createdAt: CREATED, ownerUid: USER2, operationId: `device-claim-${AQ2_DEVICE}`, claimedAt: CLAIMED },
    [SPARE_DEVICE]: { deviceUid: SPARE_DEVICE_UID, aquariumId: SPARE, state: 'unclaimed', schemaVersion: 1, createdAt: CREATED },
    [STUCK_DEVICE]: { deviceUid: 'stuckDeviceUid003', aquariumId: 'Aq4Stuck', state: 'claiming', schemaVersion: 1, createdAt: CREATED, ownerUid: USER1, operationId: `device-claim-${STUCK_DEVICE}`, claimedAt: CLAIMED },
  },
  uidRegistry: {
    [AQ2_DEVICE_UID]: { deviceId: AQ2_DEVICE },
    [SPARE_DEVICE_UID]: { deviceId: SPARE_DEVICE },
    stuckDeviceUid003: { deviceId: STUCK_DEVICE },
  },
  aq2: {
    name: 'Aquarium 2', species: ['Goldfish'], tankType: 'Freshwater', tankLengthCm: 60, tankWidthCm: 30, tankHeightCm: 36,
    workingWaterVolumeLiters: 55, hasFiltrationSystem: true, fishCount: 2,
    ownerId: USER2, ownerName: 'User Two', deviceId: AQ2_DEVICE, deviceUid: AQ2_DEVICE_UID,
    createdAt: CLAIMED, updatedAt: CLAIMED, directorySchemaVersion: 3, feeder: 'Inactive', light: 'Off', filter: 'Inactive',
  },
  aq2Mirror: { ownerUid: USER2, state: 'active', deviceUids: { [AQ2_DEVICE_UID]: true }, claimOperationId: `device-claim-${AQ2_DEVICE}` },
  aq2Telemetry: { temperatureC: 24.06, waterLevelPercent: 61.2, ph: 7.1, phReadingValid: true, tdsReadingValid: false, turbidityState: 'Unknown', lightState: 'Off', filterState: 'Inactive', powerStatus: 'Online', updatedAt: 1794022800000 },
  aq2Control: { automationEnabled: true, feedingTimes: ['08:00', '17:00'], lightOnTime: '07:00', lightOffTime: '19:00' },
};

let app;
let firestore;
let database;
let auth;

function run(script, ...flags) {
  return execFileSync('node', ['--experimental-strip-types', '--no-warnings', script, ...flags], {
    cwd: root,
    env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID, CLAIM_CODE_PEPPER: PEPPER },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const convert = (...flags) => run('scripts/convert-pr8-registry.ts', '--out', OUT, ...flags);

async function snapshot() {
  const docs = {};
  for (const name of ['device_registry', 'device_uid_registry', 'aquariums', 'aquarium_directory', 'users']) {
    for (const doc of (await firestore.collection(name).get()).docs) docs[`${name}/${doc.id}`] = doc.data();
  }
  return { docs, rtdb: (await database.ref().get()).val() };
}

before(async () => {
  rmSync(OUT, { recursive: true, force: true });
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` }, 'convert-pr8-test');
  firestore = getFirestore(app);
  database = getDatabase(app);
  auth = getAuth(app);
  for (const [uid, email] of [[USER1, 'owner@example.test'], [USER2, 'user2@example.test']]) {
    await auth.createUser({ uid, email, emailVerified: true });
  }
  for (const uid of [AQ1_DEVICE_UID, AQ2_DEVICE_UID, SPARE_DEVICE_UID]) {
    await auth.createUser({ uid, email: `${uid.toLowerCase()}@devices.example.test` });
    await auth.setCustomUserClaims(uid, { principalType: 'device' });
  }
  await firestore.doc(`users/${USER1}`).set({ name: 'Live Owner', full_name: 'Live Owner', email: 'owner@example.test', role: 'User' });
  await firestore.doc(`users/${USER2}`).set({ name: 'User Two', full_name: 'User Two', email: 'user2@example.test', role: 'User' });
  await firestore.doc(`aquariums/${AQ1}`).set({ name: 'Aquarium 1', ownerId: USER1, ownerName: 'Live Owner', species: ['Goldfish'], minTemp: 20, maxTemp: 24 });
  await firestore.doc(`aquariums/${AQ2}`).set(SEED.aq2);
  await firestore.doc(`aquarium_directory/${AQ2}`).set({ name: 'Aquarium 2', ownerId: USER2, ownerName: 'User Two', species: ['Goldfish'], createdAt: CLAIMED, updatedAt: CLAIMED, schemaVersion: 3 });
  for (const [id, data] of Object.entries(SEED.registry)) await firestore.doc(`device_registry/${id}`).set(data);
  for (const [id, data] of Object.entries(SEED.uidRegistry)) await firestore.doc(`device_uid_registry/${id}`).set(data);
  await database.ref().set({
    authorization: {
      users: { [USER1]: { role: 'User', emailVerificationRequired: true }, [USER2]: { role: 'User', emailVerificationRequired: true } },
      aquariums: {
        [AQ1]: { ownerUid: USER1, state: 'active', deviceUids: { [AQ1_DEVICE_UID]: true }, claimOperationId: 'device-claim-SAQ-7K3M-9R2X' },
        [AQ2]: SEED.aq2Mirror,
      },
    },
    devices: { [AQ2]: { telemetry: SEED.aq2Telemetry, control: SEED.aq2Control } },
  });
});

after(async () => {
  rmSync(OUT, { recursive: true, force: true });
  await deleteApp(app);
});

test('CONVERT-01 before migrate-orgs, a claimed tank without an org is skipped (order check)', async () => {
  const output = convert('--dry-run');
  assert.match(output, /has no orgId yet; run scripts\/migrate-orgs\.ts first/);
});

test('CONVERT-02 dry run after migrate-orgs plans the claimed and unclaimed devices, skips the stuck claim, writes nothing', async () => {
  run('scripts/migrate-orgs.ts');
  const before = await snapshot();
  const output = convert('--dry-run');
  assert.match(output, new RegExp(`claimed ${AQ2_DEVICE} -> status claimed, org org-${USER2}, aquarium ${AQ2} \\(no code\\), write deviceBindings/${AQ2_DEVICE_UID}`));
  assert.match(output, new RegExp(`unclaimed ${SPARE_DEVICE} -> status unclaimed with a new claim code, reservedAquariumId ${SPARE}`));
  assert.match(output, new RegExp(`skip device_registry/${STUCK_DEVICE}: state "claiming" is a claim in progress`));
  assert.match(output, /Conversion plan: 2 step\(s\)/);
  assert.deepEqual(await snapshot(), before, 'a dry run writes nothing');
  assert.equal(existsSync(path.join(OUT, SPARE_DEVICE)), false, 'no label in a dry run');
});

test('CONVERT-03 apply: no data lost, claimed device fully in our schema, unclaimed device gets a hashed code and a label', async () => {
  const output = convert();
  assert.match(output, /Applied 2 step\(s\); re-synced 1 RTDB access mirror entry/);

  // Claimed Aquarium 2: every one of his fields is still there, plus ours.
  const aq2Registry = (await firestore.doc(`device_registry/${AQ2_DEVICE}`).get()).data();
  for (const [field, value] of Object.entries(SEED.registry[AQ2_DEVICE])) assert.deepEqual(aq2Registry[field], value, `his ${field} kept`);
  assert.deepEqual(aq2Registry.pr8Original, SEED.registry[AQ2_DEVICE]);
  assert.deepEqual(
    { status: aq2Registry.status, claimCodeHash: aq2Registry.claimCodeHash, orgId: aq2Registry.orgId, aquariumId: aq2Registry.aquariumId, claimedBy: aq2Registry.claimedBy, claimedAtMs: aq2Registry.claimedAtMs },
    { status: 'claimed', claimCodeHash: null, orgId: `org-${USER2}`, aquariumId: AQ2, claimedBy: USER2, claimedAtMs: Date.parse(CLAIMED) },
  );
  const aq2 = (await firestore.doc(`aquariums/${AQ2}`).get()).data();
  for (const [field, value] of Object.entries(SEED.aq2)) assert.deepEqual(aq2[field], value, `aquarium ${field} kept`);
  assert.equal(aq2.orgId, `org-${USER2}`);
  assert.deepEqual((await firestore.doc(`device_uid_registry/${AQ2_DEVICE_UID}`).get()).data(), SEED.uidRegistry[AQ2_DEVICE_UID]);
  assert.equal((await database.ref(`deviceBindings/${AQ2_DEVICE_UID}`).get()).val(), AQ2);
  const mirror = (await database.ref(`authorization/aquariums/${AQ2}`).get()).val();
  assert.equal(mirror.ownerUid, USER2);
  assert.equal(mirror.state, 'active');
  assert.deepEqual(mirror.deviceUids, SEED.aq2Mirror.deviceUids);
  assert.equal(mirror.claimOperationId, SEED.aq2Mirror.claimOperationId);
  assert.equal(mirror.orgId, `org-${USER2}`);
  assert.deepEqual((await database.ref(`devices/${AQ2}/telemetry`).get()).val(), SEED.aq2Telemetry, 'telemetry untouched');
  assert.deepEqual((await database.ref(`devices/${AQ2}/control`).get()).val(), SEED.aq2Control, 'control untouched');

  // Unclaimed spare: original kept in pr8Original, his ID-only route closed, our code set.
  const spare = (await firestore.doc(`device_registry/${SPARE_DEVICE}`).get()).data();
  assert.deepEqual(spare.pr8Original, SEED.registry[SPARE_DEVICE]);
  assert.deepEqual(
    { status: spare.status, state: spare.state, aquariumId: spare.aquariumId, reservedAquariumId: spare.reservedAquariumId, deviceUid: spare.deviceUid, schemaVersion: spare.schemaVersion, createdAt: spare.createdAt },
    { status: 'unclaimed', state: 'converted', aquariumId: null, reservedAquariumId: SPARE, deviceUid: SPARE_DEVICE_UID, schemaVersion: 1, createdAt: CREATED },
  );
  assert.match(spare.claimCodeHash, /^[0-9a-f]{64}$/);
  for (const file of ['qr.png', 'label.svg', 'claim.json']) assert.ok(existsSync(path.join(OUT, SPARE_DEVICE, file)), `${file} written`);
  const label = JSON.parse(readFileSync(path.join(OUT, SPARE_DEVICE, 'claim.json'), 'utf8'));
  assert.equal(label.deviceId, SPARE_DEVICE);
  assert.ok(!JSON.stringify(spare).includes(label.claimCode), 'the plain code is never stored');

  // Stuck claim untouched.
  assert.deepEqual((await firestore.doc(`device_registry/${STUCK_DEVICE}`).get()).data(), SEED.registry[STUCK_DEVICE]);
});

test('CONVERT-04 idempotent: a second run plans 0 steps and changes nothing (no new code)', async () => {
  const before = await snapshot();
  const label = readFileSync(path.join(OUT, SPARE_DEVICE, 'claim.json'), 'utf8');
  assert.match(convert(), /Conversion plan: 0 step\(s\)/);
  assert.deepEqual(await snapshot(), before);
  assert.equal(readFileSync(path.join(OUT, SPARE_DEVICE, 'claim.json'), 'utf8'), label);
});

test('CONVERT-05 the converted spare is claimable through claimDevice with the new code, under the aquarium ID its firmware already uses', async () => {
  const { claimDevice } = await import(path.join(root, 'functions/lib/src/orgAccess.js'));
  const { claimCode } = JSON.parse(readFileSync(path.join(OUT, SPARE_DEVICE, 'claim.json'), 'utf8'));
  const deps = { firestore, database, auth, claimCodePepper: PEPPER };
  const actor = { uid: USER1, email: 'owner@example.test', emailVerified: true, platformAdmin: false };
  await assert.rejects(claimDevice(deps, actor, { deviceId: SPARE_DEVICE, claimCode: 'ABCD2345', aquariumName: 'Spare' }), /Invalid code/, 'knowing the ID is not enough');
  const result = await claimDevice(deps, actor, { deviceId: SPARE_DEVICE, claimCode, aquariumName: 'Aquarium 3' });
  assert.equal(result.aquariumId, SPARE);
  assert.equal(result.orgId, `org-${USER1}`, 'joins the owner\'s existing org from migrate-orgs');
  const mirror = (await database.ref(`authorization/aquariums/${SPARE}`).get()).val();
  assert.equal(mirror.state, 'active');
  assert.equal(mirror.deviceUids[SPARE_DEVICE_UID], true, 'his device UID can now write devices/<reserved id>');
  assert.equal((await database.ref(`deviceBindings/${SPARE_DEVICE_UID}`).get()).val(), SPARE);
  const registry = (await firestore.doc(`device_registry/${SPARE_DEVICE}`).get()).data();
  assert.deepEqual([registry.status, registry.aquariumId, registry.claimedBy], ['claimed', SPARE, USER1]);
});

test('CONVERT-06 a real-project run refuses to start without CLAIM_CODE_PEPPER in the environment (never the emulator .secret.local)', async () => {
  const before = await snapshot();
  const env = { ...process.env };
  for (const name of ['CLAIM_CODE_PEPPER', 'FIRESTORE_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST']) delete env[name];
  const result = spawnSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/convert-pr8-registry.ts',
    '--project', 'demo-not-a-real-project', '--database-url', 'http://127.0.0.1:9/?ns=none', '--out', OUT], {
    cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30_000,
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /CLAIM_CODE_PEPPER is not set.*Nothing was written/s);
  assert.doesNotMatch(result.stdout, /Type the project id/, 'fails before the confirmation prompt');
  assert.deepEqual(await snapshot(), before);
});
