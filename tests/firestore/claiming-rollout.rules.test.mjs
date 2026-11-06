import test, { before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
let env;
const aquarium = { name: 'Legacy', ownerId: 'a', ownerName: 'A', species: ['Goldfish'],
  fishCount: 1, tankType: 'Freshwater', workingWaterVolumeLiters: 20,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', directorySchemaVersion: 1 };
const directory = { name: 'Legacy', ownerId: 'a', ownerName: 'A', species: ['Goldfish'],
  fishCount: 1, tankType: 'Freshwater', workingWaterVolumeLiters: 20,
  createdAt: '2026-01-01', updatedAt: '2026-01-01', schemaVersion: 1 };
const db = uid => env.authenticatedContext(uid, { email_verified: true }).firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-smartaqua-claiming-rollout',
  firestore: { rules: await readFile('firestore.claiming.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const database = context.firestore();
    for (const [path, value] of Object.entries({ 'users/a': { role: 'User' },
      'users/b': { role: 'User' }, 'users/admin': { role: 'Admin' },
      'aquariums/legacy': aquarium, 'aquarium_directory/legacy': directory,
      'device_registry/SAQ-TEST-1234': { state: 'unclaimed' },
      'authorization_user_policies/a': { emailVerificationRequired: false } }))
      await setDoc(doc(database, path), value);
  });
});
after(async () => { await env?.cleanup(); });
test('legacy owner edit behavior is preserved', async () => {
  const database = db('a'); const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums/legacy'), { name: 'Renamed', updatedAt: 'new' });
  batch.set(doc(database, 'aquarium_directory/legacy'), { ...directory, name: 'Renamed', updatedAt: 'new' });
  await assertSucceeds(batch.commit());
});
test('legacy paired deletion remains available; other owner is denied', async () => {
  for (const [uid, allowed] of [['b', false], ['a', true]]) {
    const database = db(uid); const batch = writeBatch(database);
    batch.delete(doc(database, 'aquariums/legacy'));
    batch.delete(doc(database, 'aquarium_directory/legacy'));
    await (allowed ? assertSucceeds : assertFails)(batch.commit());
  }
});
test('claiming cannot be bypassed by direct profile creation', async () => {
  await assertFails(setDoc(doc(db('a'), 'aquariums/forged'), aquarium));
  await assertFails(updateDoc(doc(db('a'), 'aquariums/legacy'), { deviceId: 'SAQ-TEST-1234', deviceUid: 'fake' }));
});
test('registry stays private to users and Admin', async () => {
  for (const uid of ['a', 'b', 'admin']) {
    await assertFails(getDoc(doc(db(uid), 'device_registry/SAQ-TEST-1234')));
    await assertFails(setDoc(doc(db(uid), 'device_uid_registry/fake'), { deviceId: 'SAQ-TEST-1234' }));
  }
});
test('policy reads are self-only; writes remain denied', async () => {
  await assertSucceeds(getDoc(doc(db('a'), 'authorization_user_policies/a')));
  await assertFails(getDoc(doc(db('b'), 'authorization_user_policies/a')));
  await assertFails(setDoc(doc(db('a'), 'authorization_user_policies/a'), { emailVerificationRequired: false }));
});
test('security blocks close direct owner reads', async () => {
  await env.withSecurityRulesDisabled(async context =>
    setDoc(doc(context.firestore(), 'security_aquarium_blocks/legacy'), { reason: 'test' }));
  await assertFails(getDoc(doc(db('a'), 'aquariums/legacy')));
});
test('unrelated support-message feature is not enabled by this rollout', async () => {
  await assertFails(setDoc(doc(db('a'), 'support_threads/new'), { ownerId: 'a' }));
});
