// Sprint 5 (FR21): report files in Storage are org-scoped, same access as the tank.
// Run: npm run test:storage-rules   (Firestore + Storage emulators: cross-service rules)
import { readFile } from 'node:fs/promises';
import test, { after, before } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { getBytes, ref, uploadString } from 'firebase/storage';

const PROJECT_ID = 'demo-smartaqua-storage';
const ORG_A = 'org-a';
const ORG_B = 'org-b';
const ORG_S = 'org-s';
let environment;

const path = (orgId, aquariumId, file = 'report-1.pdf') => `reports/${orgId}/${aquariumId}/${file}`;

function storage(uid, claims = {}) {
  return uid === null
    ? environment.unauthenticatedContext().storage()
    : environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, ...claims }).storage();
}

const read = (uid, filePath, claims) => getBytes(ref(storage(uid, claims), filePath));

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: await readFile('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: await readFile('storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
  await environment.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const put = (docPath, data) => setDoc(doc(db, docPath), data);
    await Promise.all([
      put(`organizations/${ORG_A}`, { name: 'A', status: 'active' }),
      put(`organizations/${ORG_A}/members/owner-a`, { uid: 'owner-a', role: 'owner' }),
      put(`organizations/${ORG_A}/members/co-owner`, { uid: 'co-owner', role: 'owner', orgStatus: 'active' }),
      put(`organizations/${ORG_A}/members/care-x`, { uid: 'care-x', role: 'caretaker' }),
      put(`organizations/${ORG_A}/members/care-removed`, { uid: 'care-removed', role: 'caretaker' }),
      put(`organizations/${ORG_B}`, { name: 'B', status: 'active' }),
      put(`organizations/${ORG_B}/members/owner-b`, { uid: 'owner-b', role: 'owner' }),
      put(`organizations/${ORG_S}`, { name: 'S', status: 'suspended' }),
      put(`organizations/${ORG_S}/members/owner-s`, { uid: 'owner-s', role: 'owner', orgStatus: 'suspended' }),
      put('aquariums/tank-1', { name: 'Tank 1', orgId: ORG_A, caretakerIds: ['care-x'] }),
      put('aquariums/tank-2', { name: 'Tank 2', orgId: ORG_A, caretakerIds: [] }),
      put('aquariums/tank-b', { name: 'B Tank', orgId: ORG_B, caretakerIds: [] }),
      put('aquariums/tank-s', { name: 'S Tank', orgId: ORG_S, caretakerIds: [] }),
    ]);
    const bucket = ctx.storage();
    await Promise.all([
      uploadString(ref(bucket, path(ORG_A, 'tank-1')), '%PDF-1.3 test'),
      uploadString(ref(bucket, path(ORG_A, 'tank-1', 'report-1.csv')), 'a,b\n'),
      uploadString(ref(bucket, path(ORG_A, 'tank-2')), '%PDF-1.3 test'),
      uploadString(ref(bucket, path(ORG_B, 'tank-b')), '%PDF-1.3 test'),
      // A file filed under the wrong org: the aquarium's own orgId decides.
      uploadString(ref(bucket, path(ORG_B, 'tank-1')), '%PDF-1.3 test'),
      uploadString(ref(bucket, path(ORG_S, 'tank-s')), '%PDF-1.3 test'),
      uploadString(ref(bucket, 'other/file.txt'), 'x'),
    ]);
  });
});

after(async () => {
  await environment?.cleanup();
});

test('STORAGE-01 owners (and co-owners) of the org read their tanks\' reports', async () => {
  await assertSucceeds(read('owner-a', path(ORG_A, 'tank-1')));
  await assertSucceeds(read('owner-a', path(ORG_A, 'tank-1', 'report-1.csv')));
  await assertSucceeds(read('owner-a', path(ORG_A, 'tank-2')));
  await assertSucceeds(read('co-owner', path(ORG_A, 'tank-2')));
});

test('STORAGE-02 a caretaker reads only the tanks assigned to them', async () => {
  await assertSucceeds(read('care-x', path(ORG_A, 'tank-1')));
  await assertFails(read('care-x', path(ORG_A, 'tank-2')));
  await assertFails(read('care-removed', path(ORG_A, 'tank-1')));
});

test('STORAGE-03 no access across organizations, including a mismatched path', async () => {
  await assertFails(read('owner-b', path(ORG_A, 'tank-1')));
  await assertFails(read('owner-a', path(ORG_B, 'tank-b')));
  await assertFails(read('owner-b', path(ORG_B, 'tank-1')), 'tank-1 belongs to org-a whatever the path says');
  await assertFails(read('newbie', path(ORG_A, 'tank-1')));
});

test('STORAGE-04 a suspended organization loses access', async () => {
  await assertFails(read('owner-s', path(ORG_S, 'tank-s')));
});

test('STORAGE-05 platform admin reads (read-only); unverified, device and anonymous callers do not', async () => {
  await assertSucceeds(read('admin-p', path(ORG_B, 'tank-b'), { platformAdmin: true }));
  await assertFails(read('owner-a', path(ORG_A, 'tank-1'), { email_verified: false }));
  await assertFails(read('esp32-SAQ-AAAA-1111', path(ORG_A, 'tank-1'), { principalType: 'device' }));
  await assertFails(read(null, path(ORG_A, 'tank-1')));
});

test('STORAGE-06 nobody writes report files from a client; other paths are closed', async () => {
  await assertFails(uploadString(ref(storage('owner-a'), path(ORG_A, 'tank-1', 'mine.pdf')), 'x'));
  await assertFails(uploadString(ref(storage('admin-p', { platformAdmin: true }), path(ORG_A, 'tank-1', 'x.pdf')), 'x'));
  await assertFails(read('owner-a', 'other/file.txt'));
  await assertFails(uploadString(ref(storage('owner-a'), 'other/new.txt'), 'x'));
});
