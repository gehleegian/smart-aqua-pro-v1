// Sprint 3 access model: Firestore isolation (emulator only).
// Run: npm run test:firestore-org-rules
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-smartaqua-firestore-org';
const ORG_A = 'org-owner-a';
const ORG_B = 'org-owner-b';
const ORG_S = 'org-owner-s';
const ORG_LIVE = 'org-live-owner';
const TANK_1 = 'tank-1';
const TANK_2 = 'tank-2';
const TANK_3 = 'tank-3';
const TANK_S = 'tank-s';
const LIVE = 'TtNtMT5Ba100fS66GZHc';
const NOW_ISO = '2026-11-07T02:00:00.000Z';
let environment;

function claimedAquarium(orgId, ownerId, name, caretakerIds = [], extra = {}) {
  return {
    name, species: ['Goldfish'], tankType: 'Freshwater', status: 'setup', orgId, caretakerIds, ownerId, ownerName: ownerId,
    deviceId: 'SAQ-AAAA-1111', deviceUid: 'esp32-SAQ-AAAA-1111', feeder: 'Active', light: 'On', filter: 'Active',
    createdAt: NOW_ISO, updatedAt: NOW_ISO, directorySchemaVersion: 3, ...extra,
  };
}

function directoryFor(aquarium) {
  return {
    name: aquarium.name, ownerId: aquarium.ownerId, ownerName: aquarium.ownerName, species: aquarium.species,
    tankType: aquarium.tankType, createdAt: aquarium.createdAt, updatedAt: aquarium.updatedAt, schemaVersion: 3,
  };
}

const AQUARIUMS = {
  [TANK_1]: claimedAquarium(ORG_A, 'owner-a', 'Tank 1', ['care-x', 'care-z']),
  [TANK_2]: claimedAquarium(ORG_A, 'owner-a', 'Tank 2'),
  [TANK_3]: claimedAquarium(ORG_B, 'owner-b', 'B Tank'),
  [TANK_S]: claimedAquarium(ORG_S, 'owner-s', 'Suspended Tank'),
  // Migrated live Aquarium 1: legacy profile plus orgId/caretakerIds.
  [LIVE]: {
    name: 'Aquarium 1', species: ['Goldfish'], tankType: 'Freshwater', ownerId: 'live-owner', ownerName: 'Live Owner',
    orgId: ORG_LIVE, caretakerIds: [], minTemp: 20, maxTemp: 24, createdAt: NOW_ISO, updatedAt: NOW_ISO, directorySchemaVersion: 3,
  },
};

function context(uid, claims = {}) {
  return environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, ...claims }).firestore();
}

async function seed() {
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const writes = [];
    const put = (path, data) => writes.push(setDoc(doc(db, path), data));
    for (const uid of ['owner-a', 'owner-b', 'owner-s', 'care-x', 'care-z', 'newbie', 'live-owner']) {
      put(`users/${uid}`, { name: uid, email: `${uid}@example.test`, role: 'User' });
      put(`authorization_user_policies/${uid}`, { emailVerificationRequired: true });
    }
    put('users/admin-p', { name: 'Admin', email: 'admin-p@example.test', role: 'Admin' });
    put('authorization_user_policies/admin-p', { emailVerificationRequired: true });
    put(`organizations/${ORG_A}`, { name: 'Davao Pet Shop', type: 'business', status: 'active', createdBy: 'owner-a', createdAt: 1 });
    put(`organizations/${ORG_B}`, { name: 'owner-b', type: 'personal', status: 'active', createdBy: 'owner-b', createdAt: 1 });
    put(`organizations/${ORG_S}`, { name: 'Suspended', type: 'personal', status: 'suspended', createdBy: 'owner-s', createdAt: 1 });
    put(`organizations/${ORG_LIVE}`, { name: 'Live Owner', type: 'personal', status: 'active', createdBy: 'live-owner', createdAt: 1 });
    put(`organizations/${ORG_A}/members/owner-a`, { uid: 'owner-a', role: 'owner', joinedAt: 1, invitedBy: null });
    put(`organizations/${ORG_A}/members/care-x`, { uid: 'care-x', role: 'caretaker', joinedAt: 2, invitedBy: 'owner-a' });
    // care-z was removed: still listed in caretakerIds but has no member doc.
    put(`organizations/${ORG_B}/members/owner-b`, { uid: 'owner-b', role: 'owner', joinedAt: 1, invitedBy: null });
    put(`organizations/${ORG_S}/members/owner-s`, { uid: 'owner-s', role: 'owner', joinedAt: 1, invitedBy: null });
    put(`organizations/${ORG_LIVE}/members/live-owner`, { uid: 'live-owner', role: 'owner', joinedAt: 1, invitedBy: null });
    for (const [id, data] of Object.entries(AQUARIUMS)) {
      put(`aquariums/${id}`, data);
      put(`aquarium_directory/${id}`, directoryFor(data));
      put(`recommendations/rec-${id}`, { aquariumId: id, ownerId: data.ownerId, status: 'pending', ruleId: 'temp_high_warning', createdAt: 1, resolvedAt: null, resolvedBy: null });
      put(`alert_records/alert-${id}`, { aquarium_id: id, isRead: false });
      put(`sensor_readings/reading-${id}`, { aquariumId: id, dateKey: '2026-11-07', temperatureC: 25 });
      put(`aquariums/${id}/sensor_readings/2026-11-07`, { aquariumId: id });
      put(`maintenance_actions/clean-${id}`, { aquariumId: id, actionType: 'cleaning', performedAt: 1 });
      put(`monitoring_reports/report-${id}`, { aquarium_id: id, report_type: 'daily' });
      put(`command_logs/${id}_cmd-1`, { aquariumId: id, commandId: 'cmd-1', type: 'feed_now', status: 'pending', requestedAt: 1 });
    }
    put('organizations/org-owner-a/members/co-owner', { uid: 'co-owner', role: 'owner', joinedAt: 3, invitedBy: 'owner-a' });
    put('users/co-owner', { name: 'co-owner', email: 'co-owner@example.test', role: 'User' });
    put('authorization_user_policies/co-owner', { emailVerificationRequired: true });
    put('invites/invite-a', { orgId: ORG_A, email: 'care-y@example.test', role: 'caretaker', aquariumIds: [TANK_2], tokenHash: 'h', expiresAt: 9e15, usedAt: null, usedBy: null, revokedAt: null, createdBy: 'owner-a', createdAt: 1 });
    put('audit_logs/log-a', { actor: 'owner-a', action: 'device.claim', target: 'device_registry/SAQ-AAAA-1111', orgId: ORG_A, details: {}, at: 1 });
    put('audit_logs/log-b', { actor: 'owner-b', action: 'device.claim', target: 'device_registry/SAQ-BBBB-2222', orgId: ORG_B, details: {}, at: 1 });
    put('device_registry/SAQ-AAAA-1111', { status: 'claimed', claimCodeHash: 'x', deviceUid: 'esp32-SAQ-AAAA-1111', orgId: ORG_A, aquariumId: TANK_1 });
    await Promise.all(writes);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { host: '127.0.0.1', port: 8080, rules: await readFile('firestore.rules', 'utf8') },
  });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await seed();
});
after(async () => {
  await environment.cleanup();
});

async function canReadTankData(db, id) {
  await assertSucceeds(getDoc(doc(db, 'aquariums', id)));
  await assertSucceeds(getDoc(doc(db, 'recommendations', `rec-${id}`)));
  await assertSucceeds(getDocs(query(collection(db, 'recommendations'), where('aquariumId', '==', id))));
  await assertSucceeds(getDoc(doc(db, 'alert_records', `alert-${id}`)));
  await assertSucceeds(getDocs(query(collection(db, 'alert_records'), where('aquarium_id', '==', id))));
  await assertSucceeds(getDocs(query(collection(db, 'sensor_readings'), where('aquariumId', '==', id), where('dateKey', '==', '2026-11-07'))));
  await assertSucceeds(getDoc(doc(db, 'aquariums', id, 'sensor_readings', '2026-11-07')));
  await assertSucceeds(getDoc(doc(db, 'maintenance_actions', `clean-${id}`)));
  await assertSucceeds(getDoc(doc(db, 'monitoring_reports', `report-${id}`)));
}

async function cannotReadTankData(db, id) {
  await assertFails(getDoc(doc(db, 'aquariums', id)));
  await assertFails(getDoc(doc(db, 'recommendations', `rec-${id}`)));
  await assertFails(getDocs(query(collection(db, 'recommendations'), where('aquariumId', '==', id))));
  await assertFails(getDoc(doc(db, 'alert_records', `alert-${id}`)));
  await assertFails(getDocs(query(collection(db, 'sensor_readings'), where('aquariumId', '==', id), where('dateKey', '==', '2026-11-07'))));
  await assertFails(getDoc(doc(db, 'aquariums', id, 'sensor_readings', '2026-11-07')));
  await assertFails(getDoc(doc(db, 'maintenance_actions', `clean-${id}`)));
  await assertFails(getDoc(doc(db, 'monitoring_reports', `report-${id}`)));
}

function profileUpdate(db, id, changes) {
  const batch = writeBatch(db);
  const next = { ...AQUARIUMS[id], ...changes, updatedAt: '2026-11-07T03:00:00.000Z' };
  batch.update(doc(db, 'aquariums', id), { ...changes, updatedAt: next.updatedAt });
  batch.set(doc(db, 'aquarium_directory', id), directoryFor(next));
  return batch.commit();
}

test('ORG-01 the owner lists and reads every aquarium in the org (orgId query)', async () => {
  const db = context('owner-a');
  const snapshot = await assertSucceeds(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_A))));
  assert.deepEqual(snapshot.docs.map((entry) => entry.id).sort(), [TANK_1, TANK_2]);
  await canReadTankData(db, TANK_1);
  await canReadTankData(db, TANK_2);
});

test('ORG-02 a caretaker on tank 1 reads tank 1 only, and cannot list the whole org', async () => {
  const db = context('care-x');
  const mine = await assertSucceeds(
    getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_A), where('caretakerIds', 'array-contains', 'care-x')))
  );
  assert.deepEqual(mine.docs.map((entry) => entry.id), [TANK_1]);
  await assertFails(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_A))));
  await canReadTankData(db, TANK_1);
  await cannotReadTankData(db, TANK_2);
});

test('ORG-03 org A and org B cannot see each other', async () => {
  const b = context('owner-b');
  await cannotReadTankData(b, TANK_1);
  await cannotReadTankData(b, TANK_2);
  await assertFails(getDocs(query(collection(b, 'aquariums'), where('orgId', '==', ORG_A))));
  await assertFails(getDoc(doc(b, 'organizations', ORG_A)));
  await assertFails(getDocs(collection(b, 'organizations', ORG_A, 'members')));
  await assertFails(getDocs(query(collection(b, 'invites'), where('orgId', '==', ORG_A))));
  await assertFails(getDocs(query(collection(b, 'audit_logs'), where('orgId', '==', ORG_A))));
  await canReadTankData(b, TANK_3);
  await cannotReadTankData(context('owner-a'), TANK_3);
});

test('ORG-04 a removed caretaker (no member doc) loses access even if still in caretakerIds', async () => {
  const db = context('care-z');
  await cannotReadTankData(db, TANK_1);
  await assertFails(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_A), where('caretakerIds', 'array-contains', 'care-z'))));
  await assertFails(updateDoc(doc(db, 'recommendations', `rec-${TANK_1}`), { status: 'applied', resolvedAt: Date.now(), resolvedBy: 'care-z' }));
});

test('ORG-05 a caretaker cannot edit profiles or thresholds, but can apply or dismiss recommendations', async () => {
  const db = context('care-x');
  await assertFails(profileUpdate(db, TANK_1, { name: 'Renamed by caretaker' }));
  await assertFails(profileUpdate(db, TANK_1, { minTemp: 18, maxTemp: 30 }));
  await assertFails(profileUpdate(db, TANK_1, { status: 'active' }));
  await assertSucceeds(updateDoc(doc(db, 'recommendations', `rec-${TANK_1}`), { status: 'dismissed', resolvedAt: Date.now(), resolvedBy: 'care-x' }));
  await assertFails(updateDoc(doc(db, 'recommendations', `rec-${TANK_2}`), { status: 'applied', resolvedAt: Date.now(), resolvedBy: 'care-x' }));
  await assertSucceeds(updateDoc(doc(db, 'alert_records', `alert-${TANK_1}`), { isRead: true }));
  await assertFails(updateDoc(doc(db, 'alert_records', `alert-${TANK_2}`), { isRead: true }));
});

test('ORG-06 only the owner updates the profile, thresholds and setup status; access fields are protected', async () => {
  const db = context('owner-a');
  await assertSucceeds(profileUpdate(db, TANK_1, { name: 'Tank One', status: 'active', minTemp: 19, maxTemp: 23 }));
  await assertFails(profileUpdate(db, TANK_2, { status: 'archived' }));
  await assertFails(profileUpdate(db, TANK_2, { caretakerIds: ['owner-b'] }));
  await assertFails(profileUpdate(db, TANK_2, { orgId: ORG_B }));
  await assertFails(profileUpdate(db, TANK_2, { ownerId: 'owner-b' }));
  await assertFails(profileUpdate(db, TANK_2, { deviceId: 'SAQ-ZZZZ-9999' }));
  await assertFails(profileUpdate(context('owner-b'), TANK_1, { name: 'Hijack' }));
});

test('ORG-07 a new user with no org and no invite sees nothing', async () => {
  const db = context('newbie');
  const memberships = await assertSucceeds(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'newbie'))));
  assert.equal(memberships.size, 0);
  for (const id of Object.keys(AQUARIUMS)) await cannotReadTankData(db, id);
  await assertFails(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_A))));
  await assertFails(getDocs(query(collectionGroup(db, 'members'), where('uid', '==', 'owner-a'))));
  await assertFails(getDoc(doc(db, 'device_registry', 'SAQ-AAAA-1111')));
  await assertFails(setDoc(doc(db, 'aquariums', 'self-made'), claimedAquarium('org-newbie', 'newbie', 'Mine')));
});

test('ORG-08 a suspended org is locked out of its data but can still read its org status', async () => {
  const db = context('owner-s');
  await cannotReadTankData(db, TANK_S);
  await assertFails(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_S))));
  await assertFails(profileUpdate(db, TANK_S, { name: 'Edit while suspended' }));
  const org = await assertSucceeds(getDoc(doc(db, 'organizations', ORG_S)));
  assert.equal(org.data().status, 'suspended');
});

test('ORG-09 members: self-lookup by collection group; the owner lists the team; a caretaker cannot', async () => {
  const caretaker = context('care-x');
  const mine = await assertSucceeds(getDocs(query(collectionGroup(caretaker, 'members'), where('uid', '==', 'care-x'))));
  assert.deepEqual(mine.docs.map((entry) => entry.ref.parent.parent.id), [ORG_A]);
  await assertSucceeds(getDoc(doc(caretaker, 'organizations', ORG_A)));
  await assertSucceeds(getDoc(doc(caretaker, 'organizations', ORG_A, 'members', 'care-x')));
  await assertFails(getDocs(collection(caretaker, 'organizations', ORG_A, 'members')));
  await assertFails(getDocs(query(collection(caretaker, 'invites'), where('orgId', '==', ORG_A))));
  const owner = context('owner-a');
  const team = await assertSucceeds(getDocs(collection(owner, 'organizations', ORG_A, 'members')));
  assert.deepEqual(team.docs.map((entry) => entry.id).sort(), ['care-x', 'co-owner', 'owner-a']);
  await assertSucceeds(getDocs(query(collection(owner, 'invites'), where('orgId', '==', ORG_A))));
  await assertSucceeds(getDocs(query(collection(owner, 'audit_logs'), where('orgId', '==', ORG_A))));
});

test('ORG-10 no client writes orgs, members, the registry, invites or audit logs', async () => {
  for (const uid of ['owner-a', 'care-x', 'admin-p']) {
    const db = context(uid, uid === 'admin-p' ? { platformAdmin: true } : {});
    await assertFails(setDoc(doc(db, 'organizations', 'org-new'), { name: 'x', status: 'active' }));
    await assertFails(updateDoc(doc(db, 'organizations', ORG_A), { status: 'suspended' }));
    await assertFails(setDoc(doc(db, 'organizations', ORG_A, 'members', 'newbie'), { uid: 'newbie', role: 'owner' }));
    await assertFails(updateDoc(doc(db, 'organizations', ORG_A, 'members', 'care-x'), { role: 'owner' }));
    await assertFails(setDoc(doc(db, 'device_registry', 'SAQ-NEWW-0000'), { status: 'unclaimed' }));
    await assertFails(setDoc(doc(db, 'invites', 'forged'), { orgId: ORG_A, email: 'x@example.test' }));
    await assertFails(setDoc(doc(db, 'audit_logs', 'forged'), { orgId: ORG_A, action: 'x' }));
    await assertFails(setDoc(doc(db, 'claim_attempts', uid), { failures: [] }));
  }
});

test('ORG-11 the platform admin reads everything and writes nothing', async () => {
  const db = context('admin-p', { platformAdmin: true });
  const orgs = await assertSucceeds(getDocs(collection(db, 'organizations')));
  assert.equal(orgs.size, 4);
  await assertSucceeds(getDocs(collection(db, 'aquariums')));
  await assertSucceeds(getDocs(collection(db, 'organizations', ORG_A, 'members')));
  await assertSucceeds(getDoc(doc(db, 'device_registry', 'SAQ-AAAA-1111')));
  await assertSucceeds(getDocs(collection(db, 'audit_logs')));
  await assertSucceeds(getDocs(collection(db, 'invites')));
  await canReadTankData(db, TANK_S);
  await assertFails(profileUpdate(db, TANK_1, { name: 'Admin edit' }));
  await assertFails(updateDoc(doc(db, 'recommendations', `rec-${TANK_1}`), { status: 'applied', resolvedAt: Date.now(), resolvedBy: 'admin-p' }));
  // A non-admin with a forged-looking claim name is not enough: claims come from the Admin SDK only.
  await assertFails(getDocs(collection(context('owner-a'), 'organizations')));
});

test('ORG-12 the migrated live Aquarium 1 stays readable and editable by its owner', async () => {
  const db = context('live-owner');
  const snapshot = await assertSucceeds(getDocs(query(collection(db, 'aquariums'), where('orgId', '==', ORG_LIVE))));
  assert.deepEqual(snapshot.docs.map((entry) => entry.id), [LIVE]);
  await canReadTankData(db, LIVE);
  await assertSucceeds(profileUpdate(db, LIVE, { name: 'Aquarium 1 (migrated)' }));
  await cannotReadTankData(context('owner-a'), LIVE);
});

const TOKEN_ID = 'a'.repeat(40);
const tokenDoc = (extra = {}) => ({ token: 'fcm-token', platform: 'web', userAgent: 'Chrome on macOS', createdAt: 1, lastSeenAt: 1, ...extra });
const prefsDoc = (extra = {}) => ({ minSeverity: 'warning', mutedAquariumIds: [], deviceAlerts: true, cleaningReminders: true, updatedAt: 1, ...extra });

test('ORG-13 FCM tokens and notification prefs: only the user themself, valid shapes only', async () => {
  const me = context('care-x');
  await assertSucceeds(setDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID), tokenDoc()));
  await assertSucceeds(getDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID)));
  await assertFails(setDoc(doc(me, 'users/care-x/fcmTokens', 'not-a-hash'), tokenDoc()));
  await assertFails(setDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID), tokenDoc({ extra: true })));
  // Every allowed platform, including the native iOS app ('ios'), is accepted.
  for (const platform of ['web', 'ios-pwa', 'android', 'ios']) {
    await assertSucceeds(setDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID), tokenDoc({ platform })), `platform ${platform}`);
  }
  await assertFails(setDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID), tokenDoc({ platform: 'desktop' })));
  await assertFails(setDoc(doc(me, 'users/care-x/fcmTokens', TOKEN_ID), tokenDoc({ platform: 'IOS' })), 'platform match is exact');
  await assertFails(setDoc(doc(me, 'users/owner-a/fcmTokens', TOKEN_ID), tokenDoc({ platform: 'ios' })), 'ios does not bypass the owner check');
  await assertFails(setDoc(doc(me, 'users/owner-a/fcmTokens', TOKEN_ID), tokenDoc()), 'not someone else\'s');
  await assertFails(getDoc(doc(context('owner-a'), 'users/care-x/fcmTokens', TOKEN_ID)), 'an owner cannot read a caretaker\'s tokens');
  await assertFails(getDoc(doc(context('admin-p', { platformAdmin: true }), 'users/care-x/fcmTokens', TOKEN_ID)));

  await assertSucceeds(setDoc(doc(me, 'users/care-x/notificationPrefs/default'), prefsDoc({ mutedAquariumIds: [TANK_1] })));
  await assertFails(setDoc(doc(me, 'users/care-x/notificationPrefs/other'), prefsDoc()));
  await assertFails(setDoc(doc(me, 'users/care-x/notificationPrefs/default'), prefsDoc({ minSeverity: 'info' })));
  await assertFails(setDoc(doc(context('owner-a'), 'users/care-x/notificationPrefs/default'), prefsDoc()));
});

test('ORG-14 command logs: members of the tank read, nobody writes; a co-owner (owner member) reads every tank', async () => {
  await assertSucceeds(getDoc(doc(context('care-x'), 'command_logs', `${TANK_1}_cmd-1`)));
  await assertFails(getDoc(doc(context('care-x'), 'command_logs', `${TANK_2}_cmd-1`)));
  await assertSucceeds(getDocs(query(collection(context('care-x'), 'command_logs'), where('aquariumId', '==', TANK_1))));
  await assertFails(getDoc(doc(context('owner-b'), 'command_logs', `${TANK_1}_cmd-1`)));
  for (const id of [TANK_1, TANK_2]) {
    await assertSucceeds(getDoc(doc(context('co-owner'), 'command_logs', `${id}_cmd-1`)));
    await assertSucceeds(getDoc(doc(context('co-owner'), 'aquariums', id)));
  }
  await assertSucceeds(getDocs(query(collection(context('co-owner'), 'audit_logs'), where('orgId', '==', ORG_A))));
  await assertSucceeds(getDoc(doc(context('admin-p', { platformAdmin: true }), 'command_logs', `${TANK_1}_cmd-1`)));
  await assertFails(setDoc(doc(context('owner-a'), 'command_logs', 'forged'), { aquariumId: TANK_1, status: 'done' }));
  await assertFails(updateDoc(doc(context('owner-a'), 'command_logs', `${TANK_1}_cmd-1`), { status: 'done' }));
  await assertFails(setDoc(doc(context('owner-a'), 'maintenance_actions', 'forged'), { aquariumId: TANK_1, actionType: 'cleaning', performedAt: 2 }));
});

test('ORG-15 monitoring reports (Sprint 5): the Reports page list query is org-scoped; a caretaker sees only assigned tanks; nobody writes', async () => {
  const list = (db, id) => getDocs(query(collection(db, 'monitoring_reports'), where('aquarium_id', '==', id), orderBy('generated_at', 'desc'), limit(30)));
  await assertSucceeds(list(context('owner-a'), TANK_1));
  await assertSucceeds(list(context('owner-a'), TANK_2));
  await assertSucceeds(list(context('care-x'), TANK_1));
  await assertFails(list(context('care-x'), TANK_2));
  await assertFails(list(context('owner-b'), TANK_1));
  await assertFails(list(context('owner-s'), TANK_S));
  await assertFails(getDocs(query(collection(context('owner-a'), 'monitoring_reports'))), 'an unfiltered list is denied');
  await assertSucceeds(list(context('admin-p', { platformAdmin: true }), TANK_3));
  await assertFails(setDoc(doc(context('owner-a'), 'monitoring_reports', 'mine'), { aquarium_id: TANK_1, report_type: 'daily' }));
  await assertFails(updateDoc(doc(context('owner-a'), 'monitoring_reports', `report-${TANK_1}`), { summary: 'edited' }));
});
