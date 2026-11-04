import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';

import { deleteApp, initializeApp } from 'firebase/app';
import {
  applyActionCode,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getIdTokenResult,
  reload,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';

import {
  getEmailAccessState,
  isEmailPolicyReadDenied,
  resolveEmailAccessState,
} from '../../src/utils/emailVerification.ts';

const projectId = process.env.GCLOUD_PROJECT || 'demo-smartaqua-email-verification';
const emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const emulatorUrl = `http://${emulatorHost}`;
const password = 'Test-only-password-42';
const apps = [];

const requireFromFunctions = createRequire(
  new URL('../../functions/package.json', import.meta.url)
);
const { deleteApp: deleteAdminApp, initializeApp: initializeAdminApp } =
  requireFromFunctions('firebase-admin/app');
const { getAuth: getAdminAuth } = requireFromFunctions('firebase-admin/auth');

let adminApp;
let adminAuth;

function createClient(label) {
  const app = initializeApp(
    {
      apiKey: 'demo-api-key',
      authDomain: `${projectId}.firebaseapp.com`,
      projectId,
    },
    `${label}-${Date.now()}-${Math.random()}`
  );
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, emulatorUrl, { disableWarnings: true });
  return auth;
}

async function getVerificationCode(email) {
  const response = await fetch(
    `${emulatorUrl}/emulator/v1/projects/${projectId}/oobCodes`
  );
  assert.equal(response.ok, true, `Unable to read Auth Emulator OOB codes: ${response.status}`);
  const payload = await response.json();
  const entry = payload.oobCodes
    .slice()
    .reverse()
    .find((code) => code.email === email && code.requestType === 'VERIFY_EMAIL');
  assert.ok(entry?.oobCode, `No verification code was generated for ${email}`);
  return entry.oobCode;
}

before(async () => {
  assert.match(projectId, /^demo-/);
  process.env.FIREBASE_AUTH_EMULATOR_HOST = emulatorHost;
  process.env.GCLOUD_PROJECT = projectId;

  const clearResponse = await fetch(
    `${emulatorUrl}/emulator/v1/projects/${projectId}/accounts`,
    { method: 'DELETE' }
  );
  assert.equal(clearResponse.ok, true, `Unable to clear Auth Emulator: ${clearResponse.status}`);

  adminApp = initializeAdminApp({ projectId }, `auth-test-admin-${Date.now()}`);
  adminAuth = getAdminAuth(adminApp);
});

after(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
  await deleteAdminApp(adminApp);
});

test('new email/password account is unverified until its Firebase verification action is applied', async () => {
  const auth = createClient('new-user');
  const email = 'new-user@example.test';
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  assert.equal(credential.user.emailVerified, false);
  assert.equal(getEmailAccessState(credential.user, true), 'verification-required');
  const initialToken = await getIdTokenResult(credential.user, true);
  assert.notEqual(initialToken.claims.email_verified, true);

  await sendEmailVerification(credential.user);
  await applyActionCode(auth, await getVerificationCode(email));
  await reload(credential.user);

  assert.equal(credential.user.emailVerified, true);
  assert.equal(getEmailAccessState(credential.user, true), 'access-allowed');
  const verifiedToken = await getIdTokenResult(credential.user, true);
  assert.equal(verifiedToken.claims.email_verified, true);
});

test('existing verified user signs in, signs out, and signs in again without reverification', async () => {
  const email = 'existing-verified@example.test';
  await adminAuth.createUser({ email, password, emailVerified: true });
  const auth = createClient('existing-verified');

  const first = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(getEmailAccessState(first.user, true), 'access-allowed');
  await signOut(auth);
  assert.equal(getEmailAccessState(auth.currentUser, true), 'signed-out');

  const second = await signInWithEmailAndPassword(auth, email, password);
  assert.equal(second.user.emailVerified, true);
  assert.equal(getEmailAccessState(second.user, true), 'access-allowed');
});

test('explicit legacy policy exempts an unverified account without altering Firebase Auth', async () => {
  const email = 'legacy-unverified@example.test';
  const created = await adminAuth.createUser({
    email,
    password,
    emailVerified: false,
  });
  const auth = createClient('legacy-user');
  const credential = await signInWithEmailAndPassword(auth, email, password);

  assert.equal(credential.user.emailVerified, false);
  assert.equal(getEmailAccessState(credential.user, false), 'access-allowed');
  assert.equal((await adminAuth.getUser(created.uid)).emailVerified, false);
});

test('new or unknown unverified accounts fail closed when policy is required or missing', async () => {
  const user = { emailVerified: false };
  assert.equal(getEmailAccessState(user, true), 'verification-required');
});

test('a denied policy read can only fall back to the secure verification-required default', () => {
  assert.equal(isEmailPolicyReadDenied({ code: 'permission-denied' }), true);
  assert.equal(isEmailPolicyReadDenied({ code: 'firestore/permission-denied' }), true);
  assert.equal(isEmailPolicyReadDenied({ code: 'unavailable' }), false);
  assert.equal(isEmailPolicyReadDenied(new Error('network error')), false);
});

test('verification is sufficient even when the account policy requires it', () => {
  assert.equal(
    getEmailAccessState({ emailVerified: true }, true),
    'access-allowed'
  );
});

test('verified users are allowed without reading the compatibility policy', async () => {
  let policyReads = 0;
  const state = await resolveEmailAccessState(
    { emailVerified: true },
    async () => {
      policyReads += 1;
      throw new Error('Policy should not be read for a verified user.');
    }
  );

  assert.equal(state, 'access-allowed');
  assert.equal(policyReads, 0);
});

test('unverified users wait for the trusted policy result', async () => {
  assert.equal(
    await resolveEmailAccessState(
      { emailVerified: false },
      async () => false
    ),
    'access-allowed'
  );
  assert.equal(
    await resolveEmailAccessState(
      { emailVerified: false },
      async () => true
    ),
    'verification-required'
  );
});

test('policy loading failures remain distinguishable from verification denial', async () => {
  await assert.rejects(
    resolveEmailAccessState(
      { emailVerified: false },
      async () => {
        throw new Error('permission-denied');
      }
    ),
    /permission-denied/
  );
});
