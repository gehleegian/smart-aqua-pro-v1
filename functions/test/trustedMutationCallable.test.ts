import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-smartaqua-trusted-mutations';
const ADMIN_UID = 'callable-admin';
const USER_A = 'callable-user-a';
const USER_B = 'callable-user-b';
const USER_C = 'callable-user-c';
const USER_D = 'callable-user-d';
const AQUARIUM_ID = 'callable-aquarium';
const DELETION_AQUARIUM_ID = 'callable-deletion-aquarium';
const PASSWORD = 'SmartAqua-Test-123!';
const FUNCTIONS_BASE = `http://127.0.0.1:5001/${PROJECT_ID}/asia-southeast1`;

let app: App;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let adminToken = '';
let userToken = '';

function requireEmulators() {
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (
    !process.env.FIRESTORE_EMULATOR_HOST ||
    !process.env.FIREBASE_AUTH_EMULATOR_HOST ||
    !databaseHost
  ) {
    throw new Error('Auth, Firestore, and RTDB emulators are required.');
  }
  return { databaseHost };
}

async function createUser(uid: string, role: 'User' | 'Admin') {
  const email = `${uid}@example.test`;
  await auth.createUser({
    uid,
    email,
    emailVerified: true,
    password: PASSWORD,
  });
  await firestore.doc(`users/${uid}`).set({
    name: uid,
    full_name: uid,
    email,
    role,
    account_status: 'active',
  });
  return email;
}

async function signIn(email: string) {
  const response = await fetch(
    'http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD, returnSecureToken: true }),
    }
  );
  const body = (await response.json()) as { idToken?: string; error?: unknown };
  if (!response.ok || !body.idToken) {
    throw new Error(`Auth emulator sign-in failed: ${JSON.stringify(body.error)}`);
  }
  return body.idToken;
}

async function callFunction(
  name: string,
  data: Record<string, unknown>,
  token?: string
) {
  const response = await fetch(`${FUNCTIONS_BASE}/${name}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await response.json()) as {
    result?: Record<string, unknown>;
    error?: { status?: string; message?: string };
  };
  return { response, body };
}

before(async () => {
  const { databaseHost } = requireEmulators();
  app = initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}`,
    },
    'trusted-mutation-callable-tests'
  );
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
  await database.ref().set(null);

  const [adminEmail, userAEmail] = await Promise.all([
    createUser(ADMIN_UID, 'Admin'),
    createUser(USER_A, 'User'),
    createUser(USER_B, 'User'),
    createUser(USER_C, 'User'),
    createUser(USER_D, 'User'),
  ]);
  await Promise.all([
    firestore.doc(`aquariums/${AQUARIUM_ID}`).set({
      name: AQUARIUM_ID,
      ownerId: USER_A,
      ownerName: USER_A,
      species: ['Goldfish'],
      hasFiltrationSystem: true,
      updatedAt: new Date().toISOString(),
      directorySchemaVersion: 3,
    }),
    firestore.doc(`aquarium_directory/${AQUARIUM_ID}`).set({
      name: AQUARIUM_ID,
      ownerId: USER_A,
      ownerName: USER_A,
      species: ['Goldfish'],
      hasFiltrationSystem: true,
      updatedAt: new Date().toISOString(),
      schemaVersion: 3,
    }),
    firestore.doc(`aquariums/${DELETION_AQUARIUM_ID}`).set({
      name: DELETION_AQUARIUM_ID,
      ownerId: USER_A,
      ownerName: USER_A,
      species: ['Goldfish'],
      hasFiltrationSystem: true,
      updatedAt: new Date().toISOString(),
      directorySchemaVersion: 3,
    }),
    firestore.doc(`aquarium_directory/${DELETION_AQUARIUM_ID}`).set({
      name: DELETION_AQUARIUM_ID,
      ownerId: USER_A,
      ownerName: USER_A,
      species: ['Goldfish'],
      hasFiltrationSystem: true,
      updatedAt: new Date().toISOString(),
      schemaVersion: 3,
    }),
  ]);
  await database.ref('authorization').set({
    users: {
      [ADMIN_UID]: { role: 'Admin' },
      [USER_A]: { role: 'User' },
      [USER_B]: { role: 'User' },
      [USER_C]: { role: 'User' },
      [USER_D]: { role: 'User' },
    },
    aquariums: {
      [AQUARIUM_ID]: { ownerUid: USER_A, state: 'active' },
      [DELETION_AQUARIUM_ID]: { ownerUid: USER_A, state: 'active' },
    },
  });
  [adminToken, userToken] = await Promise.all([
    signIn(adminEmail),
    signIn(userAEmail),
  ]);
});

after(async () => {
  await deleteApp(app);
});

test('CALL-01 callable rejects an unauthenticated request', async () => {
  const { body } = await callFunction('transferAquariumOwnership', {
    aquariumId: AQUARIUM_ID,
    newOwnerUid: USER_B,
    idempotencyKey: 'callable-unauthenticated',
  });
  assert.equal(body.error?.status, 'UNAUTHENTICATED');
});

test('CALL-02 callable rejects an authenticated non-Admin transfer', async () => {
  const { body } = await callFunction(
    'transferAquariumOwnership',
    {
      aquariumId: AQUARIUM_ID,
      newOwnerUid: USER_B,
      idempotencyKey: 'callable-user-denied',
    },
    userToken
  );
  assert.equal(body.error?.status, 'PERMISSION_DENIED');
});

test('CALL-03 callable validates required payload fields', async () => {
  const { body } = await callFunction(
    'transferAquariumOwnership',
    { aquariumId: AQUARIUM_ID },
    adminToken
  );
  assert.equal(body.error?.status, 'INVALID_ARGUMENT');
});

test('CALL-04 authenticated Admin transfer succeeds through the function endpoint', async () => {
  const { body } = await callFunction(
    'transferAquariumOwnership',
    {
      aquariumId: AQUARIUM_ID,
      newOwnerUid: USER_B,
      idempotencyKey: 'callable-admin-transfer',
    },
    adminToken
  );
  assert.equal(body.result?.status, 'completed');
  assert.equal(
    (await firestore.doc(`aquariums/${AQUARIUM_ID}`).get()).get('ownerId'),
    USER_B
  );
});

test('CALL-05 a duplicate transfer returns the same terminal operation', async () => {
  const { body } = await callFunction(
    'transferAquariumOwnership',
    {
      aquariumId: AQUARIUM_ID,
      newOwnerUid: USER_B,
      idempotencyKey: 'callable-admin-transfer',
    },
    adminToken
  );
  assert.equal(body.result?.status, 'completed');
});

test('CALL-06 an ordinary User cannot update another user role', async () => {
  const { body } = await callFunction(
    'updateUserRoleTrusted',
    {
      targetUid: USER_C,
      role: 'Admin',
      idempotencyKey: 'callable-user-role-denied',
    },
    userToken
  );
  assert.equal(body.error?.status, 'PERMISSION_DENIED');
});

test('CALL-07 an Admin role update succeeds through the callable endpoint', async () => {
  const { body } = await callFunction(
    'updateUserRoleTrusted',
    {
      targetUid: USER_C,
      role: 'Admin',
      idempotencyKey: 'callable-admin-role-update',
    },
    adminToken
  );
  assert.equal(body.result?.status, 'completed');
  assert.equal((await firestore.doc(`users/${USER_C}`).get()).get('role'), 'Admin');
});

test('CALL-08 an Admin revocation disables access without deleting retained records', async () => {
  const { body } = await callFunction(
    'revokeUserAccount',
    {
      targetUid: USER_D,
      idempotencyKey: 'callable-admin-user-revocation',
    },
    adminToken
  );
  assert.equal(body.result?.status, 'revoked');
  assert.equal((await auth.getUser(USER_D)).disabled, true);
  assert.equal((await firestore.doc(`users/${USER_D}`).get()).exists, true);
});

test('CALL-09 an owner prepares aquarium deletion and the retained record is disassociated', async () => {
  const { body } = await callFunction(
    'prepareAquariumDeletion',
    {
      aquariumId: DELETION_AQUARIUM_ID,
      idempotencyKey: 'callable-owner-deletion-preparation',
    },
    userToken
  );
  assert.equal(body.result?.status, 'prepared');
  const retained = await firestore.doc(`aquariums/${DELETION_AQUARIUM_ID}`).get();
  assert.equal(retained.exists, true);
  assert.equal(retained.get('ownerId'), '');
  assert.equal(retained.get('lifecycleState'), 'deletion_prepared');
});

test('CALL-10 a duplicate deletion preparation returns its terminal result', async () => {
  const { body } = await callFunction(
    'prepareAquariumDeletion',
    {
      aquariumId: DELETION_AQUARIUM_ID,
      idempotencyKey: 'callable-owner-deletion-preparation',
    },
    userToken
  );
  assert.equal(body.result?.status, 'prepared');
});

test('CALL-11 a former owner cannot prepare deletion after ownership transfer', async () => {
  const { body } = await callFunction(
    'prepareAquariumDeletion',
    {
      aquariumId: AQUARIUM_ID,
      idempotencyKey: 'callable-former-owner-deletion-denied',
    },
    userToken
  );
  assert.equal(body.error?.status, 'PERMISSION_DENIED');
});
