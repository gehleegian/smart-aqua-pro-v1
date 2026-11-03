import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  reconcileAuthorization,
  syncAquariumAuthorization,
  syncUserAuthorization,
  type SyncDependencies,
} from '../src/authorizationSync.js';

const PROJECT_ID = 'demo-smartaqua-auth-sync';
const USER_A = 'user-a';
const USER_B = 'user-b';
const AQUARIUM_A = 'aquarium-a';

let app: App;
let firestore: Firestore;
let database: Database;
let dependencies: SyncDependencies;

function requireEmulatorEnvironment() {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;

  if (!firestoreHost || !databaseHost) {
    throw new Error(
      'Run this suite with the Firestore and Realtime Database emulators.'
    );
  }

  return { databaseHost };
}

async function clearFirestoreCollection(name: string) {
  const snapshot = await firestore.collection(name).get();

  if (snapshot.empty) {
    return;
  }

  const batch = firestore.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();
}

async function seedUser(uid: string, role: unknown = 'User') {
  await firestore.doc(`users/${uid}`).set({
    name: uid,
    role,
    account_status: 'active',
  });
}

async function seedAquarium(aquariumId: string, ownerId: unknown) {
  await firestore.doc(`aquariums/${aquariumId}`).set({
    name: aquariumId,
    ownerId,
  });
}

async function readMirror(path: string) {
  return (await database.ref(path).get()).val();
}

before(async () => {
  const { databaseHost } = requireEmulatorEnvironment();
  app = initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}`,
    },
    'authorization-sync-tests'
  );
  firestore = getFirestore(app);
  database = getDatabase(app);
  dependencies = { firestore, database };
});

beforeEach(async () => {
  await Promise.all([
    clearFirestoreCollection('users'),
    clearFirestoreCollection('aquariums'),
    clearFirestoreCollection('authorization_user_policies'),
    database.ref().set(null),
  ]);
});

after(async () => {
  await deleteApp(app);
});

test('SYNC-01 user creation projects the canonical User role', async () => {
  await seedUser(USER_A);
  const result = await syncUserAuthorization(dependencies, USER_A);
  const mirror = await readMirror(`authorization/users/${USER_A}`);

  assert.equal(result.status, 'User');
  assert.equal(mirror.role, 'User');
  assert.equal(mirror.emailVerificationRequired, true);
  assert.equal(typeof mirror.sourceUpdatedAt, 'string');
  assert.equal(typeof mirror.syncedAt, 'number');
  assert.equal('account_status' in mirror, false);
});

test('SYNC-01B an explicit legacy exemption is mirrored and preserved', async () => {
  await seedUser(USER_A);
  await firestore.doc(`authorization_user_policies/${USER_A}`).set({
    emailVerificationRequired: false,
  });

  await syncUserAuthorization(dependencies, USER_A);
  await syncUserAuthorization(dependencies, USER_A);

  const mirror = await readMirror(`authorization/users/${USER_A}`);
  assert.equal(mirror.role, 'User');
  assert.equal(mirror.emailVerificationRequired, false);
  assert.equal(
    (await firestore.doc(`authorization_user_policies/${USER_A}`).get()).get(
      'emailVerificationRequired'
    ),
    false
  );
});

test('SYNC-01C missing policy defaults safely to verification required', async () => {
  await seedUser(USER_A);
  await syncUserAuthorization(dependencies, USER_A);
  assert.equal(
    (await readMirror(`authorization/users/${USER_A}`)).emailVerificationRequired,
    true
  );
});

test('SYNC-02 role changes propagate and revoke aquariums owned by an Admin', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A);

  await firestore.doc(`users/${USER_A}`).update({ role: 'Admin' });
  await syncUserAuthorization(dependencies, USER_A);

  const userMirror = await readMirror(`authorization/users/${USER_A}`);
  const aquariumMirror = await readMirror(
    `authorization/aquariums/${AQUARIUM_A}`
  );
  assert.equal(userMirror.role, 'Admin');
  assert.equal(aquariumMirror.state, 'revoked');
});

test('SYNC-03 aquarium creation projects an active owner mapping', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);

  await syncUserAuthorization(dependencies, USER_A, {
    cascadeAquariums: false,
  });
  const result = await syncAquariumAuthorization(dependencies, AQUARIUM_A);
  const mirror = await readMirror(`authorization/aquariums/${AQUARIUM_A}`);

  assert.equal(result.status, 'active');
  assert.equal(mirror.ownerUid, USER_A);
  assert.equal(mirror.state, 'active');
});

test('SYNC-04 ownership changes replace the old owner and preserve assigned devices', async () => {
  await Promise.all([seedUser(USER_A), seedUser(USER_B)]);
  await seedAquarium(AQUARIUM_A, USER_A);
  await Promise.all([
    syncUserAuthorization(dependencies, USER_A, { cascadeAquariums: false }),
    syncUserAuthorization(dependencies, USER_B, { cascadeAquariums: false }),
  ]);
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);
  await database
    .ref(`authorization/aquariums/${AQUARIUM_A}/deviceUids/device-a`)
    .set(true);

  await firestore.doc(`aquariums/${AQUARIUM_A}`).update({ ownerId: USER_B });
  await syncAquariumAuthorization(dependencies, AQUARIUM_A, {
    transitionBeforeActivation: true,
  });

  const mirror = await readMirror(`authorization/aquariums/${AQUARIUM_A}`);
  assert.equal(mirror.ownerUid, USER_B);
  assert.equal(mirror.state, 'active');
  assert.equal(mirror.deviceUids['device-a'], true);
});

test('SYNC-05 aquarium deletion leaves a revoked tombstone without device assignments', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A);
  await database
    .ref(`authorization/aquariums/${AQUARIUM_A}/deviceUids/device-a`)
    .set(true);

  await firestore.doc(`aquariums/${AQUARIUM_A}`).delete();
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);

  const mirror = await readMirror(`authorization/aquariums/${AQUARIUM_A}`);
  assert.equal(mirror.state, 'revoked');
  assert.equal(mirror.ownerUid, undefined);
  assert.equal(mirror.deviceUids, undefined);
});

test('SYNC-06 user deletion removes the role mirror and revokes owned aquariums', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A);

  await firestore.doc(`users/${USER_A}`).delete();
  await syncUserAuthorization(dependencies, USER_A);

  assert.equal(await readMirror(`authorization/users/${USER_A}`), null);
  const aquariumMirror = await readMirror(
    `authorization/aquariums/${AQUARIUM_A}`
  );
  assert.equal(aquariumMirror.state, 'revoked');
});

test('SYNC-07 duplicate processing is idempotent and does not rewrite current mirrors', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A);
  const first = await readMirror('authorization');

  const userResult = await syncUserAuthorization(dependencies, USER_A);
  const aquariumResult = await syncAquariumAuthorization(
    dependencies,
    AQUARIUM_A,
    { transitionBeforeActivation: true }
  );
  const second = await readMirror('authorization');

  assert.equal(userResult.status, 'unchanged');
  assert.equal(aquariumResult.status, 'unchanged');
  assert.deepEqual(second, first);
});

test('SYNC-08 stale event handling rereads Firestore and cannot restore an old owner', async () => {
  await Promise.all([seedUser(USER_A), seedUser(USER_B)]);
  await seedAquarium(AQUARIUM_A, USER_A);
  await Promise.all([
    syncUserAuthorization(dependencies, USER_A, { cascadeAquariums: false }),
    syncUserAuthorization(dependencies, USER_B, { cascadeAquariums: false }),
  ]);
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);
  await firestore.doc(`aquariums/${AQUARIUM_A}`).update({ ownerId: USER_B });
  await syncAquariumAuthorization(dependencies, AQUARIUM_A, {
    transitionBeforeActivation: true,
  });

  await syncAquariumAuthorization(dependencies, AQUARIUM_A, {
    transitionBeforeActivation: true,
  });

  const mirror = await readMirror(`authorization/aquariums/${AQUARIUM_A}`);
  assert.equal(mirror.ownerUid, USER_B);
  assert.equal(mirror.state, 'active');
});

test('SYNC-09 a failed write can be retried safely', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A, {
    cascadeAquariums: false,
  });

  let failNextWrite = true;
  const failingDependencies: SyncDependencies = {
    ...dependencies,
    beforeMirrorWrite: () => {
      if (failNextWrite) {
        failNextWrite = false;
        throw new Error('Injected transient mirror write failure.');
      }
    },
  };

  await assert.rejects(
    syncAquariumAuthorization(failingDependencies, AQUARIUM_A),
    /Injected transient mirror write failure/
  );
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);

  const mirror = await readMirror(`authorization/aquariums/${AQUARIUM_A}`);
  assert.equal(mirror.ownerUid, USER_A);
  assert.equal(mirror.state, 'active');
});

test('SYNC-10 missing or invalid authoritative data fails closed', async () => {
  await database.ref(`authorization/aquariums/${AQUARIUM_A}`).set({
    ownerUid: USER_A,
    state: 'active',
  });
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);
  assert.equal(
    (await readMirror(`authorization/aquariums/${AQUARIUM_A}`)).state,
    'revoked'
  );

  await seedUser(USER_A, 'Owner');
  await seedAquarium(AQUARIUM_A, USER_A);
  await syncUserAuthorization(dependencies, USER_A);
  assert.equal(await readMirror(`authorization/users/${USER_A}`), null);
  assert.equal(
    (await readMirror(`authorization/aquariums/${AQUARIUM_A}`)).state,
    'revoked'
  );
});

test('SYNC-11 reconciliation repairs drift and removes or revokes orphan mirrors', async () => {
  await seedUser(USER_A);
  await seedAquarium(AQUARIUM_A, USER_A);
  await database.ref('authorization').set({
    users: {
      [USER_A]: { role: 'Admin', sourceUpdatedAt: 'stale' },
      orphan: { role: 'User', sourceUpdatedAt: 'stale' },
    },
    aquariums: {
      [AQUARIUM_A]: {
        ownerUid: USER_B,
        state: 'active',
        sourceUpdatedAt: 'stale',
      },
      orphan: {
        ownerUid: USER_B,
        state: 'active',
        deviceUids: { 'device-orphan': true },
      },
    },
  });

  const result = await reconcileAuthorization(dependencies);
  const authorization = await readMirror('authorization');

  assert.equal(authorization.users[USER_A].role, 'User');
  assert.equal(authorization.users[USER_A].emailVerificationRequired, true);
  assert.equal(authorization.users.orphan, undefined);
  assert.equal(authorization.aquariums[AQUARIUM_A].ownerUid, USER_A);
  assert.equal(authorization.aquariums[AQUARIUM_A].state, 'active');
  assert.equal(authorization.aquariums.orphan.state, 'revoked');
  assert.equal(authorization.aquariums.orphan.deviceUids, undefined);
  assert.deepEqual(result, {
    usersProcessed: 1,
    aquariumsProcessed: 1,
    orphanedUsersRemoved: 1,
    orphanedAquariumsRevoked: 1,
  });
});
