import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  reconcileAuthorization,
  syncAquariumAuthorization,
  syncUserAuthorization,
} from '../src/authorizationSync.js';
import {
  MutationError,
  prepareAquariumDeletion,
  revokeUserAccount,
  transferAquariumOwnership,
  updateUserRoleTrusted,
  type MutationActor,
  type MutationStep,
  type TrustedMutationDependencies,
} from '../src/trustedMutations.js';

const PROJECT_ID = 'demo-smartaqua-trusted-mutations';
const ADMIN_A = 'admin-a';
const ADMIN_B = 'admin-b';
const USER_A = 'user-a';
const USER_B = 'user-b';
const USER_C = 'user-c';
const AQUARIUM_A = 'aquarium-a';
const AQUARIUM_B = 'aquarium-b';

let app: App;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let dependencies: TrustedMutationDependencies;

const adminActor: MutationActor = { uid: ADMIN_A, emailVerified: true };
const userActor: MutationActor = { uid: USER_A, emailVerified: true };

function requireEmulators() {
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !databaseHost || !authHost) {
    throw new Error('Auth, Firestore, and RTDB emulators are required.');
  }
  return { databaseHost };
}

async function clearCollection(name: string) {
  const snapshot = await firestore.collection(name).get();
  for (let start = 0; start < snapshot.docs.length; start += 400) {
    const batch = firestore.batch();
    snapshot.docs.slice(start, start + 400).forEach((document) => {
      batch.delete(document.ref);
    });
    await batch.commit();
  }
}

async function clearAuth() {
  const users = await auth.listUsers(1000);
  if (users.users.length > 0) {
    await auth.deleteUsers(users.users.map((user) => user.uid));
  }
}

async function seedUser(uid: string, role: 'User' | 'Admin') {
  await auth.createUser({
    uid,
    email: `${uid}@example.test`,
    emailVerified: true,
    password: 'SmartAqua-Test-123!',
  });
  await firestore.doc(`users/${uid}`).set({
    name: uid,
    full_name: uid,
    email: `${uid}@example.test`,
    role,
    account_status: 'active',
  });
  await syncUserAuthorization(dependencies, uid, { cascadeAquariums: false });
}

async function seedAquarium(aquariumId: string, ownerId: string) {
  const data = {
    name: aquariumId,
    ownerId,
    ownerName: ownerId,
    species: ['Goldfish'],
    fishCount: 2,
    hasFiltrationSystem: true,
    updatedAt: new Date().toISOString(),
    directorySchemaVersion: 3,
  };
  await Promise.all([
    firestore.doc(`aquariums/${aquariumId}`).set(data),
    firestore.doc(`aquarium_directory/${aquariumId}`).set({
      ...data,
      schemaVersion: 3,
    }),
  ]);
  await syncAquariumAuthorization(dependencies, aquariumId);
}

async function mirror(path: string) {
  return (await database.ref(path).get()).val();
}

async function standardTransferFixture() {
  await Promise.all([
    seedUser(ADMIN_A, 'Admin'),
    seedUser(USER_A, 'User'),
    seedUser(USER_B, 'User'),
  ]);
  await seedAquarium(AQUARIUM_A, USER_A);
}

function expectMutationCode(code: string) {
  return (error: unknown) =>
    error instanceof MutationError && error.code === code;
}

before(async () => {
  const { databaseHost } = requireEmulators();
  app = initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}`,
    },
    'trusted-mutation-tests'
  );
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
  dependencies = { auth, firestore, database };
});

beforeEach(async () => {
  await Promise.all([
    clearCollection('users'),
    clearCollection('aquariums'),
    clearCollection('aquarium_directory'),
    clearCollection('security_mutation_operations'),
    clearCollection('security_mutation_locks'),
    clearCollection('security_user_blocks'),
    clearCollection('authorization_user_policies'),
    clearCollection('security_aquarium_blocks'),
    clearCollection('security_aquarium_deletion_preparations'),
    clearCollection('security_audit_events'),
    database.ref().set(null),
    clearAuth(),
  ]);
});

after(async () => {
  await deleteApp(app);
});

test('MUT-01 an Admin transfers an aquarium to an eligible User', async () => {
  await standardTransferFixture();
  const result = await transferAquariumOwnership(dependencies, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0001',
  });

  assert.equal(result.status, 'completed');
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_A}`).get()).get('ownerId'), USER_B);
  const transferredDirectory = await firestore.doc(`aquarium_directory/${AQUARIUM_A}`).get();
  assert.equal(transferredDirectory.get('ownerId'), USER_B);
  assert.equal(transferredDirectory.get('hasFiltrationSystem'), true);
  assert.equal(transferredDirectory.get('schemaVersion'), 3);
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).ownerUid, USER_B);
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'active');
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).activeMutationId, undefined);
  assert.equal((await firestore.doc(`security_aquarium_blocks/${AQUARIUM_A}`).get()).exists, false);
});

test('MUT-02 an ordinary User cannot transfer aquarium ownership', async () => {
  await standardTransferFixture();
  await assert.rejects(
    transferAquariumOwnership(dependencies, userActor, {
      aquariumId: AQUARIUM_A,
      newOwnerUid: USER_B,
      idempotencyKey: 'transfer-0002',
    }),
    expectMutationCode('permission-denied')
  );
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_A}`).get()).get('ownerId'), USER_A);
  assert.equal((await firestore.collection('security_mutation_operations').get()).empty, true);
});

test('MUT-02B an explicitly exempt legacy Admin retains trusted mutation access', async () => {
  await standardTransferFixture();
  await firestore.doc(`authorization_user_policies/${ADMIN_A}`).set({
    emailVerificationRequired: false,
  });

  const result = await transferAquariumOwnership(
    dependencies,
    { uid: ADMIN_A, emailVerified: false },
    {
      aquariumId: AQUARIUM_A,
      newOwnerUid: USER_B,
      idempotencyKey: 'transfer-legacy-admin',
    }
  );
  assert.equal(result.status, 'completed');
});

test('MUT-02C an unverified Admin without an explicit policy is denied', async () => {
  await standardTransferFixture();
  await assert.rejects(
    transferAquariumOwnership(
      dependencies,
      { uid: ADMIN_A, emailVerified: false },
      {
        aquariumId: AQUARIUM_A,
        newOwnerUid: USER_B,
        idempotencyKey: 'transfer-unverified-admin',
      }
    ),
    expectMutationCode('permission-denied')
  );
});

test('MUT-03 transfer revokes the previous owner before canonical ownership changes', async () => {
  await standardTransferFixture();
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const checkpoint = new Promise<void>((resolve) => { reached = resolve; });
  const paused: TrustedMutationDependencies = {
    ...dependencies,
    beforeStep: async (step) => {
      if (step === 'after-rtdb-revocation') {
        reached();
        await gate;
      }
    },
  };

  const pending = transferAquariumOwnership(paused, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0003',
  });
  await checkpoint;
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'transitioning');
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_A}`).get()).get('ownerId'), USER_A);
  release();
  await pending;
});

test('MUT-04 transfer activates only the new owner', async () => {
  await standardTransferFixture();
  await transferAquariumOwnership(dependencies, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0004',
  });
  const authorization = await mirror(`authorization/aquariums/${AQUARIUM_A}`);
  assert.equal(authorization.ownerUid, USER_B);
  assert.notEqual(authorization.ownerUid, USER_A);
});

test('MUT-05 simultaneous transfer attempts are serialized by the aquarium lock', async () => {
  await Promise.all([
    seedUser(ADMIN_A, 'Admin'),
    seedUser(ADMIN_B, 'Admin'),
    seedUser(USER_A, 'User'),
    seedUser(USER_B, 'User'),
    seedUser(USER_C, 'User'),
  ]);
  await seedAquarium(AQUARIUM_A, USER_A);
  let release!: () => void;
  let reached!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const checkpoint = new Promise<void>((resolve) => { reached = resolve; });
  const paused: TrustedMutationDependencies = {
    ...dependencies,
    beforeStep: async (step: MutationStep) => {
      if (step === 'after-lock') {
        reached();
        await gate;
      }
    },
  };
  const first = transferAquariumOwnership(paused, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0005-a',
  });
  await checkpoint;
  await assert.rejects(
    transferAquariumOwnership(
      dependencies,
      { uid: ADMIN_B, emailVerified: true },
      {
        aquariumId: AQUARIUM_A,
        newOwnerUid: USER_C,
        idempotencyKey: 'transfer-0005-b',
      }
    ),
    expectMutationCode('aborted')
  );
  release();
  await first;
});

test('MUT-06 duplicate transfer requests return the stored result', async () => {
  await standardTransferFixture();
  const input = {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0006',
  };
  const first = await transferAquariumOwnership(dependencies, adminActor, input);
  const duplicate = await transferAquariumOwnership(dependencies, adminActor, input);
  assert.deepEqual(duplicate, first);
});

test('MUT-07 a failed transfer remains denied and can be retried', async () => {
  await standardTransferFixture();
  let failed = false;
  const injected: TrustedMutationDependencies = {
    ...dependencies,
    beforeStep: (step) => {
      if (!failed && step === 'before-canonical-write') {
        failed = true;
        throw new Error('Injected transfer failure.');
      }
    },
  };
  const input = {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0007',
  };
  await assert.rejects(transferAquariumOwnership(injected, adminActor, input));
  assert.notEqual((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'active');
  assert.equal((await firestore.doc(`security_aquarium_blocks/${AQUARIUM_A}`).get()).exists, true);
  const retry = await transferAquariumOwnership(dependencies, adminActor, input);
  assert.equal(retry.status, 'completed');
});

test('MUT-08 stale synchronization cannot reactivate a blocked transfer', async () => {
  await standardTransferFixture();
  const injected: TrustedMutationDependencies = {
    ...dependencies,
    beforeStep: (step) => {
      if (step === 'before-canonical-write') throw new Error('Pause transfer.');
    },
  };
  await assert.rejects(
    transferAquariumOwnership(injected, adminActor, {
      aquariumId: AQUARIUM_A,
      newOwnerUid: USER_B,
      idempotencyKey: 'transfer-0008',
    })
  );
  await syncAquariumAuthorization(dependencies, AQUARIUM_A);
  assert.notEqual((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'active');
});

test('MUT-09 transfer preserves an unrelated aquarium and owner', async () => {
  await standardTransferFixture();
  await seedAquarium(AQUARIUM_B, USER_A);
  const before = await mirror(`authorization/aquariums/${AQUARIUM_B}`);
  await transferAquariumOwnership(dependencies, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0009',
  });
  assert.deepEqual(await mirror(`authorization/aquariums/${AQUARIUM_B}`), before);
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_B}`).get()).get('ownerId'), USER_A);
});

test('MUT-10 the owner can prepare aquarium deletion without deleting canonical data', async () => {
  await Promise.all([seedUser(USER_A, 'User'), seedUser(ADMIN_A, 'Admin')]);
  await seedAquarium(AQUARIUM_A, USER_A);
  const result = await prepareAquariumDeletion(dependencies, userActor, {
    aquariumId: AQUARIUM_A,
    idempotencyKey: 'deletion-0010',
  });
  assert.equal(result.status, 'prepared');
  const retainedAquarium = await firestore.doc(`aquariums/${AQUARIUM_A}`).get();
  const retainedDirectory = await firestore.doc(`aquarium_directory/${AQUARIUM_A}`).get();
  assert.equal(retainedAquarium.exists, true);
  assert.equal(retainedDirectory.exists, true);
  assert.equal(retainedAquarium.get('ownerId'), '');
  assert.equal(retainedDirectory.get('ownerId'), '');
  assert.equal(retainedAquarium.get('lifecycleState'), 'deletion_prepared');
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'revoked');
});

test('MUT-11 a non-owner cannot prepare aquarium deletion', async () => {
  await Promise.all([seedUser(USER_A, 'User'), seedUser(USER_B, 'User')]);
  await seedAquarium(AQUARIUM_A, USER_A);
  await assert.rejects(
    prepareAquariumDeletion(
      dependencies,
      { uid: USER_B, emailVerified: true },
      { aquariumId: AQUARIUM_A, idempotencyKey: 'deletion-0011' }
    ),
    expectMutationCode('permission-denied')
  );
  assert.equal((await firestore.collection('security_mutation_operations').get()).empty, true);
});

test('MUT-12 reconciliation cannot reactivate a deletion-prepared aquarium', async () => {
  await seedUser(USER_A, 'User');
  await seedAquarium(AQUARIUM_A, USER_A);
  await prepareAquariumDeletion(dependencies, userActor, {
    aquariumId: AQUARIUM_A,
    idempotencyKey: 'deletion-0012',
  });
  await reconcileAuthorization(dependencies);
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'revoked');
});

test('MUT-13 an Admin promotes a User and owned aquariums remain revoked', async () => {
  await Promise.all([seedUser(ADMIN_A, 'Admin'), seedUser(USER_A, 'User')]);
  await seedAquarium(AQUARIUM_A, USER_A);
  await updateUserRoleTrusted(dependencies, adminActor, {
    targetUid: USER_A,
    role: 'Admin',
    idempotencyKey: 'role-0013',
  });
  assert.equal((await firestore.doc(`users/${USER_A}`).get()).get('role'), 'Admin');
  assert.equal((await mirror(`authorization/users/${USER_A}`)).role, 'Admin');
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'revoked');
});

test('MUT-14 an ordinary User cannot change roles', async () => {
  await Promise.all([
    seedUser(USER_A, 'User'),
    seedUser(USER_B, 'User'),
  ]);
  await assert.rejects(
    updateUserRoleTrusted(dependencies, userActor, {
      targetUid: USER_B,
      role: 'Admin',
      idempotencyKey: 'role-0014',
    }),
    expectMutationCode('permission-denied')
  );
  assert.equal((await firestore.collection('security_mutation_operations').get()).empty, true);
});

test('MUT-15 an Admin cannot change their own role', async () => {
  await seedUser(ADMIN_A, 'Admin');
  await assert.rejects(
    updateUserRoleTrusted(dependencies, adminActor, {
      targetUid: ADMIN_A,
      role: 'User',
      idempotencyKey: 'role-0015',
    }),
    expectMutationCode('permission-denied')
  );
  assert.equal((await firestore.collection('security_mutation_operations').get()).empty, true);
});

test('MUT-16 an Admin can demote another Admin when one Admin remains', async () => {
  await Promise.all([
    seedUser(ADMIN_A, 'Admin'),
    seedUser(ADMIN_B, 'Admin'),
  ]);
  await seedAquarium(AQUARIUM_A, ADMIN_B);
  await updateUserRoleTrusted(dependencies, adminActor, {
    targetUid: ADMIN_B,
    role: 'User',
    idempotencyKey: 'role-0016',
  });
  assert.equal((await firestore.doc(`users/${ADMIN_B}`).get()).get('role'), 'User');
  assert.equal((await mirror(`authorization/users/${ADMIN_B}`)).role, 'User');
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'active');
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).ownerUid, ADMIN_B);
});

test('MUT-17 an Admin can revoke a User without deleting the profile or aquariums', async () => {
  await Promise.all([seedUser(ADMIN_A, 'Admin'), seedUser(USER_A, 'User')]);
  await seedAquarium(AQUARIUM_A, USER_A);
  const result = await revokeUserAccount(dependencies, adminActor, {
    targetUid: USER_A,
    idempotencyKey: 'revoke-0017',
  });
  assert.equal(result.status, 'revoked');
  assert.equal((await auth.getUser(USER_A)).disabled, true);
  assert.equal((await firestore.doc(`users/${USER_A}`).get()).exists, true);
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_A}`).get()).exists, true);
  assert.equal(await mirror(`authorization/users/${USER_A}`), null);
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'revoked');
});

test('MUT-18 an ordinary User cannot revoke another account', async () => {
  await Promise.all([seedUser(USER_A, 'User'), seedUser(USER_B, 'User')]);
  await assert.rejects(
    revokeUserAccount(dependencies, userActor, {
      targetUid: USER_B,
      idempotencyKey: 'revoke-0018',
    }),
    expectMutationCode('permission-denied')
  );
  assert.equal((await firestore.collection('security_mutation_operations').get()).empty, true);
});

test('MUT-19 duplicate user revocation is idempotent', async () => {
  await Promise.all([seedUser(ADMIN_A, 'Admin'), seedUser(USER_A, 'User')]);
  const input = { targetUid: USER_A, idempotencyKey: 'revoke-0019' };
  const first = await revokeUserAccount(dependencies, adminActor, input);
  const duplicate = await revokeUserAccount(dependencies, adminActor, input);
  assert.deepEqual(duplicate, first);
});

test('MUT-20 reconciliation cannot restore a security-revoked User', async () => {
  await Promise.all([seedUser(ADMIN_A, 'Admin'), seedUser(USER_A, 'User')]);
  await seedAquarium(AQUARIUM_A, USER_A);
  await revokeUserAccount(dependencies, adminActor, {
    targetUid: USER_A,
    idempotencyKey: 'revoke-0020',
  });
  await reconcileAuthorization(dependencies);
  assert.equal(await mirror(`authorization/users/${USER_A}`), null);
  assert.equal((await mirror(`authorization/aquariums/${AQUARIUM_A}`)).state, 'revoked');
});

test('MUT-21 a reused idempotency key with a different payload is rejected', async () => {
  await standardTransferFixture();
  await transferAquariumOwnership(dependencies, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'shared-key-0021',
  });
  await seedUser(USER_C, 'User');
  await assert.rejects(
    transferAquariumOwnership(dependencies, adminActor, {
      aquariumId: AQUARIUM_A,
      newOwnerUid: USER_C,
      idempotencyKey: 'shared-key-0021',
    }),
    expectMutationCode('already-exists')
  );
});

test('MUT-22 invalid IDs and short idempotency keys are rejected', async () => {
  await seedUser(ADMIN_A, 'Admin');
  await assert.rejects(
    transferAquariumOwnership(dependencies, adminActor, {
      aquariumId: 'bad/id',
      newOwnerUid: USER_A,
      idempotencyKey: 'short',
    }),
    expectMutationCode('invalid-argument')
  );
});

test('MUT-23 account_status remains informational during trusted mutations', async () => {
  await standardTransferFixture();
  await firestore.doc(`users/${USER_B}`).update({ account_status: 'inactive' });
  await transferAquariumOwnership(dependencies, adminActor, {
    aquariumId: AQUARIUM_A,
    newOwnerUid: USER_B,
    idempotencyKey: 'transfer-0023',
  });
  assert.equal((await firestore.doc(`aquariums/${AQUARIUM_A}`).get()).get('ownerId'), USER_B);
});
