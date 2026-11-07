import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getDatabase, type Database } from 'firebase-admin/database';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { syncUserAuthorization } from '../src/authorizationSync.js';
import {
  CLAIM_FAILURE_LIMIT,
  INVITE_TTL_MS,
  acceptInvite,
  claimDevice,
  createInvite,
  hashClaimCode,
  removeMember,
  revokeInvite,
  setMemberRole,
  setOrganizationStatus,
  updateCaretakerAssignments,
  type OrgActor,
  type OrgDependencies,
} from '../src/orgAccess.js';
import { MutationError } from '../src/trustedMutations.js';

// Emulator-only. The pepper below is a fixed test value, not a secret.
const PROJECT_ID = 'demo-smartaqua-org-access';
const PEPPER = 'emulator-test-pepper';
const DEVICE_1 = 'SAQ-AAAA-1111';
const DEVICE_2 = 'SAQ-BBBB-2222';
const DEVICE_3 = 'SAQ-CCCC-3333';
const CODE_1 = 'ABCD2345';
const CODE_2 = 'EFGH6789';
const CODE_3 = 'JKMN2345';

let app: App;
let auth: Auth;
let firestore: Firestore;
let database: Database;
let dependencies: OrgDependencies;
let clockMs = Date.UTC(2026, 10, 7, 2, 0, 0);

const owner = (uid: string): OrgActor => ({ uid, email: `${uid}@example.test`, emailVerified: true, platformAdmin: false });
const OWNER_A = owner('owner-a');
const OWNER_B = owner('owner-b');
const CARE_X = owner('care-x');
const CARE_Y = owner('care-y');
const ADMIN: OrgActor = { uid: 'admin-p', email: 'admin-p@example.test', emailVerified: true, platformAdmin: true };

before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_DATABASE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('Auth, Firestore, and RTDB emulators are required.');
  }
  app = initializeApp(
    { projectId: PROJECT_ID, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` },
    'org-access-test'
  );
  auth = getAuth(app);
  firestore = getFirestore(app);
  database = getDatabase(app);
  dependencies = { firestore, database, auth, claimCodePepper: PEPPER, now: () => clockMs };
});

after(async () => {
  await deleteApp(app);
});

async function seedUser(actor: OrgActor, role: 'User' | 'Admin' = 'User') {
  await auth.createUser({ uid: actor.uid, email: actor.email ?? undefined, emailVerified: true, password: 'SmartAqua-Test-123!' });
  await firestore.doc(`users/${actor.uid}`).set({ name: actor.uid, full_name: actor.uid, email: actor.email, role });
  await syncUserAuthorization({ firestore, database }, actor.uid, { cascadeAquariums: false });
}

async function provision(deviceId: string, code: string) {
  await firestore.doc(`device_registry/${deviceId}`).set({
    claimCodeHash: hashClaimCode(PEPPER, deviceId, code),
    status: 'unclaimed',
    deviceUid: `esp32-${deviceId}`,
    orgId: null,
    aquariumId: null,
    claimedBy: null,
    claimedAt: null,
    createdAt: clockMs,
  });
}

async function mirror(aquariumId: string) {
  return (await database.ref(`authorization/aquariums/${aquariumId}`).get()).val() as Record<string, unknown> | null;
}

async function rejects(promise: Promise<unknown>, code: string, message?: RegExp) {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof MutationError, String(error));
    assert.equal(error.code, code);
    if (message) assert.match(error.message, message);
    return true;
  });
}

beforeEach(async () => {
  clockMs = Date.UTC(2026, 10, 7, 2, 0, 0);
  for (const name of ['users', 'aquariums', 'aquarium_directory', 'organizations', 'device_registry', 'invites', 'audit_logs', 'claim_attempts', 'authorization_user_policies']) {
    for (const document of await firestore.collection(name).listDocuments()) await firestore.recursiveDelete(document);
  }
  await database.ref().set(null);
  const users = await auth.listUsers(1000);
  if (users.users.length > 0) await auth.deleteUsers(users.users.map((user) => user.uid));
  for (const actor of [OWNER_A, OWNER_B, CARE_X, CARE_Y]) await seedUser(actor);
  await seedUser(ADMIN, 'Admin');
  await provision(DEVICE_1, CODE_1);
  await provision(DEVICE_2, CODE_2);
  await provision(DEVICE_3, CODE_3);
});

async function setupOrgA() {
  const tank1 = await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'Tank 1', orgName: 'Davao Pet Shop' });
  const tank2 = await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_2, claimCode: CODE_2, aquariumName: 'Tank 2' });
  return { orgId: tank1.orgId, tank1: tank1.aquariumId, tank2: tank2.aquariumId };
}

async function inviteAndAccept(orgId: string, aquariumIds: string[], caretaker = CARE_X) {
  const invite = await createInvite(dependencies, OWNER_A, { orgId, email: caretaker.email, aquariumIds });
  await acceptInvite(dependencies, caretaker, { token: invite.token });
  return invite;
}

test('first claim auto-creates the named org; second claim reuses it', async () => {
  const first = await claimDevice(dependencies, OWNER_A, { deviceId: 'saq-aaaa-1111', claimCode: 'abcd-2345', aquariumName: 'Tank 1', orgName: 'Davao Pet Shop' });
  assert.equal(first.orgCreated, true);
  assert.equal(first.orgId, 'org-owner-a');
  const org = (await firestore.doc(`organizations/${first.orgId}`).get()).data();
  assert.deepEqual(
    { name: org?.name, type: org?.type, status: org?.status, createdBy: org?.createdBy },
    { name: 'Davao Pet Shop', type: 'business', status: 'active', createdBy: OWNER_A.uid }
  );
  assert.equal((await firestore.doc(`organizations/${first.orgId}/members/${OWNER_A.uid}`).get()).get('role'), 'owner');

  const aquarium = (await firestore.doc(`aquariums/${first.aquariumId}`).get()).data();
  assert.equal(aquarium?.status, 'setup');
  assert.equal(aquarium?.orgId, first.orgId);
  assert.deepEqual(aquarium?.caretakerIds, []);
  assert.equal(aquarium?.ownerId, OWNER_A.uid);
  assert.equal(aquarium?.deviceId, DEVICE_1);
  assert.equal(aquarium?.minTemp, undefined, 'no profile limits: species defaults apply');
  assert.ok((await firestore.doc(`aquarium_directory/${first.aquariumId}`).get()).exists);

  const registry = (await firestore.doc(`device_registry/${DEVICE_1}`).get()).data();
  assert.equal(registry?.status, 'claimed');
  assert.equal(registry?.aquariumId, first.aquariumId);
  assert.equal(registry?.claimedBy, OWNER_A.uid);

  const access = await mirror(first.aquariumId);
  assert.equal(access?.state, 'active');
  assert.equal(access?.ownerUid, OWNER_A.uid);
  assert.equal(access?.orgId, first.orgId);
  assert.deepEqual(access?.deviceUids, { [`esp32-${DEVICE_1}`]: true });
  assert.equal(access?.caretakerUids, undefined);
  assert.equal((await database.ref(`deviceBindings/esp32-${DEVICE_1}`).get()).val(), first.aquariumId);

  const second = await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_2, claimCode: CODE_2, aquariumName: 'Tank 2' });
  assert.equal(second.orgCreated, false);
  assert.equal(second.orgId, first.orgId);

  const audit = await firestore.collection('audit_logs').where('action', '==', 'device.claim').get();
  assert.equal(audit.size, 2);
});

test('a first claim without an org name creates a personal org named after the user', async () => {
  const result = await claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_3, claimCode: CODE_3, aquariumName: 'Home tank' });
  const org = (await firestore.doc(`organizations/${result.orgId}`).get()).data();
  assert.equal(org?.type, 'personal');
  assert.equal(org?.name, OWNER_B.uid);
});

test('claim errors: invalid code, unknown device, already registered, unverified email', async () => {
  await rejects(claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_1, claimCode: 'ZZZZ2345', aquariumName: 'T' }), 'invalid-argument', /^Invalid code\.$/);
  await rejects(claimDevice(dependencies, OWNER_A, { deviceId: 'SAQ-ZZZZ-9999', claimCode: CODE_1, aquariumName: 'T' }), 'invalid-argument', /^Invalid code\.$/);
  await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' });
  await rejects(claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' }), 'already-exists', /Already registered, contact the owner/);
  await rejects(
    claimDevice(dependencies, { ...OWNER_B, emailVerified: false }, { deviceId: DEVICE_2, claimCode: CODE_2, aquariumName: 'T' }),
    'permission-denied',
    /Verify your email/
  );
  await rejects(claimDevice(dependencies, ADMIN, { deviceId: DEVICE_2, claimCode: CODE_2, aquariumName: 'T' }), 'permission-denied');
});

test('a retried claim by the same owner is idempotent and repairs the RTDB binding', async () => {
  const first = await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' });
  await database.ref(`deviceBindings/esp32-${DEVICE_1}`).remove();
  const retry = await claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' });
  assert.equal(retry.aquariumId, first.aquariumId);
  assert.equal((await database.ref(`deviceBindings/esp32-${DEVICE_1}`).get()).val(), first.aquariumId);
});

test(`rate limit: ${CLAIM_FAILURE_LIMIT} failed attempts per hour, then even a valid code is refused`, async () => {
  for (let attempt = 0; attempt < CLAIM_FAILURE_LIMIT; attempt += 1) {
    await rejects(claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_1, claimCode: 'ZZZZ2345', aquariumName: 'T' }), 'invalid-argument');
  }
  await rejects(claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' }), 'resource-exhausted', /Too many attempts/);
  clockMs += 61 * 60 * 1000;
  const result = await claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_1, claimCode: CODE_1, aquariumName: 'T' });
  assert.ok(result.aquariumId);
});

test('a caretaker cannot claim into the org they were invited to; a suspended org cannot claim', async () => {
  const { orgId, tank1 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1]);
  await rejects(claimDevice(dependencies, CARE_X, { deviceId: DEVICE_3, claimCode: CODE_3, aquariumName: 'T', orgId }), 'permission-denied');
  await setOrganizationStatus(dependencies, ADMIN, { orgId, status: 'suspended' });
  await rejects(claimDevice(dependencies, OWNER_A, { deviceId: DEVICE_3, claimCode: CODE_3, aquariumName: 'T' }), 'failed-precondition', /suspended/);
});

test('invite → accept gives the caretaker only the assigned tank, in Firestore and the RTDB mirror', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  const invite = await createInvite(dependencies, OWNER_A, { orgId, email: 'Care-X@Example.test', aquariumIds: [tank1] });
  assert.match(invite.path, /^\/invite\/[A-Za-z0-9_-]{43}$/);
  const stored = (await firestore.doc(`invites/${invite.inviteId}`).get()).data();
  assert.equal(stored?.email, 'care-x@example.test');
  assert.equal(stored?.expiresAt, clockMs + INVITE_TTL_MS);
  assert.notEqual(stored?.tokenHash, invite.token);
  assert.ok(!JSON.stringify(stored).includes(invite.token), 'the raw token is never stored');

  await acceptInvite(dependencies, CARE_X, { token: invite.token });
  const member = (await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get()).data();
  assert.equal(member?.role, 'caretaker');
  assert.equal(member?.invitedBy, OWNER_A.uid);
  assert.deepEqual((await firestore.doc(`aquariums/${tank1}`).get()).get('caretakerIds'), [CARE_X.uid]);
  assert.deepEqual((await firestore.doc(`aquariums/${tank2}`).get()).get('caretakerIds'), []);
  assert.deepEqual((await mirror(tank1))?.caretakerUids, { [CARE_X.uid]: true });
  assert.equal((await mirror(tank2))?.caretakerUids, undefined);
  assert.equal((await firestore.doc(`invites/${invite.inviteId}`).get()).get('usedBy'), CARE_X.uid);

  await rejects(acceptInvite(dependencies, CARE_X, { token: invite.token }), 'failed-precondition', /already been used/);
});

test('invite checks: owner only, tanks in the org, email match, expiry, revocation', async () => {
  const { orgId, tank1 } = await setupOrgA();
  const other = await claimDevice(dependencies, OWNER_B, { deviceId: DEVICE_3, claimCode: CODE_3, aquariumName: 'B tank' });
  await rejects(createInvite(dependencies, OWNER_B, { orgId, email: CARE_Y.email, aquariumIds: [tank1] }), 'permission-denied');
  await rejects(createInvite(dependencies, OWNER_A, { orgId, email: CARE_Y.email, aquariumIds: [other.aquariumId] }), 'permission-denied');
  await rejects(createInvite(dependencies, OWNER_A, { orgId, email: CARE_Y.email, aquariumIds: [] }), 'invalid-argument');

  const wrongPerson = await createInvite(dependencies, OWNER_A, { orgId, email: CARE_Y.email, aquariumIds: [tank1] });
  await rejects(acceptInvite(dependencies, CARE_X, { token: wrongPerson.token }), 'permission-denied', /different email/);
  await rejects(acceptInvite(dependencies, { ...CARE_Y, emailVerified: false }, { token: wrongPerson.token }), 'permission-denied', /Verify/);

  const expiring = await createInvite(dependencies, OWNER_A, { orgId, email: CARE_X.email, aquariumIds: [tank1] });
  clockMs += INVITE_TTL_MS + 1;
  await rejects(acceptInvite(dependencies, CARE_X, { token: expiring.token }), 'failed-precondition', /expired/);

  const revoked = await createInvite(dependencies, OWNER_A, { orgId, email: CARE_X.email, aquariumIds: [tank1] });
  await rejects(revokeInvite(dependencies, CARE_X, { inviteId: revoked.inviteId }), 'permission-denied');
  await revokeInvite(dependencies, OWNER_A, { inviteId: revoked.inviteId });
  await rejects(acceptInvite(dependencies, CARE_X, { token: revoked.token }), 'failed-precondition', /revoked/);
  await rejects(acceptInvite(dependencies, CARE_X, { token: 'not-a-real-token' }), 'not-found');
});

test('removeMember ends access at once, keeps logs, and never removes the owner', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1, tank2]);
  await rejects(removeMember(dependencies, CARE_X, { orgId, uid: OWNER_A.uid }), 'permission-denied');
  await rejects(removeMember(dependencies, OWNER_A, { orgId, uid: OWNER_A.uid }), 'failed-precondition', /at least one owner/);

  const result = await removeMember(dependencies, OWNER_A, { orgId, uid: CARE_X.uid });
  assert.deepEqual([...result.aquariumIds].sort(), [tank1, tank2].sort());
  assert.equal((await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get()).exists, false);
  assert.deepEqual((await firestore.doc(`aquariums/${tank1}`).get()).get('caretakerIds'), []);
  assert.equal((await mirror(tank1))?.caretakerUids, undefined);
  assert.equal((await mirror(tank2))?.caretakerUids, undefined);
  const actions = (await firestore.collection('audit_logs').where('orgId', '==', orgId).get()).docs.map((doc) => doc.get('action')).sort();
  assert.deepEqual(actions, ['device.claim', 'device.claim', 'invite.accept', 'invite.create', 'member.remove']);
});

test('a uid left in caretakerIds without a member doc gets no RTDB access', async () => {
  const { orgId, tank1 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1]);
  await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).delete();
  await firestore.doc(`aquariums/${tank1}`).update({ name: 'touched' });
  const { syncAquariumAuthorization } = await import('../src/authorizationSync.js');
  await syncAquariumAuthorization({ firestore, database }, tank1);
  assert.equal((await mirror(tank1))?.caretakerUids, undefined);
});

test('updateCaretakerAssignments moves a caretaker between tanks and keeps the mirror in sync', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1]);
  const result = await updateCaretakerAssignments(dependencies, OWNER_A, { orgId, uid: CARE_X.uid, aquariumIds: [tank2] });
  assert.deepEqual([...result.changed].sort(), [tank1, tank2].sort());
  assert.equal((await mirror(tank1))?.caretakerUids, undefined);
  assert.deepEqual((await mirror(tank2))?.caretakerUids, { [CARE_X.uid]: true });
  await rejects(updateCaretakerAssignments(dependencies, CARE_X, { orgId, uid: CARE_X.uid, aquariumIds: [tank1, tank2] }), 'permission-denied');
  await rejects(updateCaretakerAssignments(dependencies, OWNER_A, { orgId, uid: OWNER_A.uid, aquariumIds: [tank1] }), 'failed-precondition');
});

test('platform admin suspends and reactivates an org; the mirror follows; others cannot', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  await rejects(setOrganizationStatus(dependencies, OWNER_A, { orgId, status: 'suspended' }), 'permission-denied');
  await setOrganizationStatus(dependencies, ADMIN, { orgId, status: 'suspended', reason: 'Billing test' });
  assert.equal((await mirror(tank1))?.state, 'suspended');
  assert.equal((await mirror(tank2))?.state, 'suspended');
  assert.deepEqual((await mirror(tank1))?.deviceUids, { [`esp32-${DEVICE_1}`]: true }, 'device binding survives suspension');
  await rejects(createInvite(dependencies, OWNER_A, { orgId, email: CARE_X.email, aquariumIds: [tank1] }), 'failed-precondition', /suspended/);

  await setOrganizationStatus(dependencies, ADMIN, { orgId, status: 'active' });
  assert.equal((await mirror(tank1))?.state, 'active');
  const actions = (await firestore.collection('audit_logs').where('target', '==', `organizations/${orgId}`).get()).docs.map((doc) => doc.get('action')).sort();
  assert.deepEqual(actions, ['org.reactivate', 'org.suspend']);

  // Fallback: an Admin whose claim is not set yet is recognised by role.
  await setOrganizationStatus(dependencies, { ...ADMIN, platformAdmin: false }, { orgId, status: 'suspended' });
  assert.equal((await mirror(tank1))?.state, 'suspended');
});

test('co-owners: promote a caretaker; the mirror grants every tank at once; the last owner can never be demoted or removed', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1]);
  await rejects(setMemberRole(dependencies, CARE_X, { orgId, uid: CARE_X.uid, role: 'owner' }), 'permission-denied');
  await rejects(setMemberRole(dependencies, OWNER_A, { orgId, uid: OWNER_A.uid, role: 'caretaker' }), 'failed-precondition', /at least one owner/);
  await rejects(setMemberRole(dependencies, OWNER_A, { orgId, uid: CARE_X.uid, role: 'admin' }), 'invalid-argument');

  await setMemberRole(dependencies, OWNER_A, { orgId, uid: CARE_X.uid, role: 'owner' });
  assert.equal((await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get()).get('role'), 'owner');
  for (const tank of [tank1, tank2]) {
    const entry = await mirror(tank);
    assert.deepEqual(entry?.coOwnerUids, { [CARE_X.uid]: true }, 'a co-owner reaches every tank');
    assert.equal(entry?.caretakerUids, undefined, 'owners are not also caretakers');
    assert.equal(entry?.ownerUid, OWNER_A.uid);
  }

  // The new co-owner demotes the original owner: tanks move to the co-owner.
  await setMemberRole(dependencies, CARE_X, { orgId, uid: OWNER_A.uid, role: 'caretaker' });
  assert.equal((await firestore.doc(`aquariums/${tank1}`).get()).get('ownerId'), CARE_X.uid);
  assert.equal((await firestore.doc(`aquarium_directory/${tank1}`).get()).get('ownerId'), CARE_X.uid);
  const entry = await mirror(tank1);
  assert.equal(entry?.ownerUid, CARE_X.uid);
  assert.equal(entry?.coOwnerUids, undefined, 'the demoted owner loses access immediately');
  assert.equal(entry?.state, 'active');

  // Now CARE_X is the only owner: neither demotion nor removal is possible.
  await rejects(setMemberRole(dependencies, CARE_X, { orgId, uid: CARE_X.uid, role: 'caretaker' }), 'failed-precondition', /at least one owner/);
  await rejects(removeMember(dependencies, CARE_X, { orgId, uid: CARE_X.uid }), 'failed-precondition', /at least one owner/);
  const actions = (await firestore.collection('audit_logs').where('orgId', '==', orgId).get()).docs.map((doc) => doc.get('action'));
  assert.ok(actions.includes('member.promote') && actions.includes('member.demote'));
});

test('co-owners: an owner can remove another owner; the removed owner loses access and their tanks move', async () => {
  const { orgId, tank1, tank2 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank2], CARE_Y);
  await setMemberRole(dependencies, OWNER_A, { orgId, uid: CARE_Y.uid, role: 'owner' });
  await removeMember(dependencies, CARE_Y, { orgId, uid: OWNER_A.uid });
  assert.equal((await firestore.doc(`organizations/${orgId}/members/${OWNER_A.uid}`).get()).exists, false);
  for (const tank of [tank1, tank2]) {
    assert.equal((await firestore.doc(`aquariums/${tank}`).get()).get('ownerId'), CARE_Y.uid);
    const entry = await mirror(tank);
    assert.equal(entry?.ownerUid, CARE_Y.uid);
    assert.equal(entry?.coOwnerUids, undefined);
  }
  const log = (await firestore.collection('audit_logs').where('action', '==', 'member.remove').get()).docs[0];
  assert.deepEqual([...log.get('details.movedAquariumIds')].sort(), [tank1, tank2].sort());
});

test('a caretaker may claim a device of their own: it creates their own org, never touching the org they care for', async () => {
  const { orgId, tank1 } = await setupOrgA();
  await inviteAndAccept(orgId, [tank1]);
  const own = await claimDevice(dependencies, CARE_X, { deviceId: DEVICE_3, claimCode: CODE_3, aquariumName: 'My tank' });
  assert.equal(own.orgCreated, true);
  assert.equal(own.orgId, `org-${CARE_X.uid}`);
  assert.equal((await firestore.doc(`organizations/${own.orgId}/members/${CARE_X.uid}`).get()).get('role'), 'owner');
  assert.equal((await firestore.doc(`organizations/${orgId}/members/${CARE_X.uid}`).get()).get('role'), 'caretaker', 'still a caretaker in org A');
  assert.equal((await firestore.doc(`aquariums/${own.aquariumId}`).get()).get('orgId'), own.orgId);
  assert.equal((await firestore.collection('aquariums').where('orgId', '==', orgId).get()).size, 2, 'org A gained nothing');
});
