import assert from 'node:assert/strict';
import test, { after, before } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const PROJECT_ID = 'demo-smartaqua-auth-sync';
const USER_A = 'trigger-user-a';
const USER_B = 'trigger-user-b';
const AQUARIUM_ID = 'trigger-aquarium';
const POLL_TIMEOUT_MS = 20_000;

let app: App;
let firestore: Firestore;
let database: Database;

async function waitFor(
  read: () => Promise<unknown>,
  predicate: (value: unknown) => boolean
) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error('Timed out waiting for the Functions emulator trigger.');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

before(async () => {
  const databaseHost = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
  if (!process.env.FIRESTORE_EMULATOR_HOST || !databaseHost) {
    throw new Error('Firestore and RTDB emulator variables are required.');
  }

  app = initializeApp(
    {
      projectId: PROJECT_ID,
      databaseURL: `http://${databaseHost}?ns=${PROJECT_ID}`,
    },
    'authorization-trigger-tests'
  );
  firestore = getFirestore(app);
  database = getDatabase(app);
  await database.ref().set(null);
});

after(async () => {
  await deleteApp(app);
});

test('TRIGGER-01 Firestore user and aquarium writes dispatch synchronization', async () => {
  await Promise.all([
    firestore.doc(`users/${USER_A}`).set({ role: 'User' }),
    firestore.doc(`users/${USER_B}`).set({ role: 'User' }),
  ]);

  await waitFor(
    async () => (await database.ref(`authorization/users/${USER_A}`).get()).val(),
    (value) =>
      isRecord(value) &&
      value.role === 'User' &&
      value.emailVerificationRequired === true
  );
  const policy = await waitFor(
    async () =>
      (await firestore.doc(`authorization_user_policies/${USER_A}`).get()).data(),
    (value) =>
      isRecord(value) && value.emailVerificationRequired === true
  );
  assert.equal(
    (policy as { emailVerificationRequired: boolean }).emailVerificationRequired,
    true
  );

  await firestore.doc(`aquariums/${AQUARIUM_ID}`).set({ ownerId: USER_A });
  await waitFor(
    async () =>
      (await database.ref(`authorization/aquariums/${AQUARIUM_ID}`).get()).val(),
    (value) =>
      isRecord(value) && value.state === 'active' && value.ownerUid === USER_A
  );

  await firestore.doc(`aquariums/${AQUARIUM_ID}`).update({ ownerId: USER_B });
  const transferred = await waitFor(
    async () =>
      (await database.ref(`authorization/aquariums/${AQUARIUM_ID}`).get()).val(),
    (value) =>
      isRecord(value) && value.state === 'active' && value.ownerUid === USER_B
  );
  assert.equal((transferred as { ownerUid: string }).ownerUid, USER_B);

  await firestore.doc(`aquariums/${AQUARIUM_ID}`).delete();
  const deleted = await waitFor(
    async () =>
      (await database.ref(`authorization/aquariums/${AQUARIUM_ID}`).get()).val(),
    (value) =>
      isRecord(value) && value.state === 'revoked' && value.ownerUid === undefined
  );
  assert.equal((deleted as { state: string }).state, 'revoked');
});
