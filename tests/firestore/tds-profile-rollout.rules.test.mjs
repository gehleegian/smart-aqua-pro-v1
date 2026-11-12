import assert from 'node:assert/strict';
import test, { before, beforeEach, after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, writeBatch, getDoc } from 'firebase/firestore';
import { addTdsProfileValidation } from '../../scripts/lib/tdsRulesPatch.mjs';

if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Explicit emulator required');
const folder = process.env.TDS_RULES_BACKUP;
// Use the exact reviewed live export during a rollout; fresh checkouts can
// run the same regression against repository rules without private backups.
const candidate = (await readFile(folder ? `${folder}/candidate.rules` : 'firestore.rules', 'utf8')).replace(/\r\n/g, '\n');
const original = folder ? (await readFile(`${folder}/before.rules`, 'utf8')).replace(/\r\n/g, '\n') : candidate
  .replace("        'minTdsPpm',\n        'maxTdsPpm',\n", '')
  .replace(/    function validTdsPpmRange\(data\) \{[\s\S]*?\n    \}\n\n/, '')
  .replace("        && (!changed.hasAny(['minTdsPpm', 'maxTdsPpm']) || validTdsPpmRange(request.resource.data))\n", '');
assert.equal(candidate, addTdsProfileValidation(original));
const profile = { name: 'Rules test tank', ownerId: 'owner', ownerName: 'Owner',
  orgId: 'org-a', caretakerIds: ['caretaker'], species: ['Goldfish'],
  tankType: 'Freshwater', fishCount: 1, fishWeightsG: [10],
  tankLengthCm: 40, tankWidthCm: 30, tankHeightCm: 30,
  workingWaterVolumeLiters: 30, hasFiltrationSystem: true,
  minTemp: 23, maxTemp: 27, minPh: 7, maxPh: 10, minLevel: 70, minQuality: 80,
  createdAt: '2026-11-01', updatedAt: '2026-11-01', directorySchemaVersion: 3 };
const directory = { name: profile.name, ownerId: profile.ownerId, ownerName: profile.ownerName,
  species: profile.species, tankType: profile.tankType, fishCount: profile.fishCount,
  tankLengthCm: profile.tankLengthCm, tankWidthCm: profile.tankWidthCm, tankHeightCm: profile.tankHeightCm,
  workingWaterVolumeLiters: profile.workingWaterVolumeLiters, hasFiltrationSystem: true,
  createdAt: profile.createdAt, updatedAt: profile.updatedAt, schemaVersion: 3 };
let env;
const database = (uid, verified = true) => uid ? env.authenticatedContext(uid, { email_verified: verified }).firestore()
  : env.unauthenticatedContext().firestore();
function save(uid, fields, verified = true) {
  const db = database(uid, verified);
  const batch = writeBatch(db);
  batch.update(doc(db, 'aquariums/tank'), { ...fields, updatedAt: '2026-11-12' });
  batch.set(doc(db, 'aquarium_directory/tank'), { ...directory, updatedAt: '2026-11-12' });
  return batch.commit();
}
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-smartaqua-tds-rollout', firestore: { rules: candidate } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const [path, value] of Object.entries({
      'aquariums/tank': profile, 'aquarium_directory/tank': directory,
      'users/owner': { role: 'User' }, 'users/stranger': { role: 'User' },
      'users/caretaker': { role: 'User' }, 'users/admin': { role: 'Admin' },
      'organizations/org-a': { status: 'active' },
      'organizations/org-a/members/owner': { role: 'owner' },
      'organizations/org-a/members/caretaker': { role: 'caretaker' },
    })) await setDoc(doc(db, path), value);
  });
});
after(async () => { await env?.cleanup(); });

test('original deployed rules reproduce the rejected TDS save; focused candidate accepts it', async () => {
  await env.cleanup();
  env = await initializeTestEnvironment({ projectId: 'demo-smartaqua-tds-rollout', firestore: { rules: original } });
  try { await assertFails(save('owner', { minTdsPpm: 50, maxTdsPpm: 400 })); }
  finally {
    await env.cleanup();
    env = await initializeTestEnvironment({ projectId: 'demo-smartaqua-tds-rollout', firestore: { rules: candidate } });
  }
  await assertSucceeds(save('owner', { minTdsPpm: 50, maxTdsPpm: 400 }));
  const saved = (await getDoc(doc(database('owner'), 'aquariums/tank'))).data();
  assert.equal(saved.minTdsPpm, 50);
  assert.equal(saved.maxTdsPpm, 400);
  assert.equal(saved.minQuality, 80);
});

test('legacy profile edits without TDS remain valid and zero minimum is accepted', async () => {
  await assertSucceeds(save('owner', { minTemp: 24 }));
  await assertSucceeds(save('owner', { minTdsPpm: 0, maxTdsPpm: 400 }));
  await assertSucceeds(save('owner', { maxTdsPpm: 500 }));
});

test('partial, nonnumeric, negative, reversed, equal and nonfinite ranges remain denied', async () => {
  for (const fields of [
    { minTdsPpm: 50 }, { maxTdsPpm: 400 },
    { minTdsPpm: '50', maxTdsPpm: 400 }, { minTdsPpm: 50, maxTdsPpm: '400' },
    { minTdsPpm: null, maxTdsPpm: 400 }, { minTdsPpm: -1, maxTdsPpm: 400 },
    { minTdsPpm: 400, maxTdsPpm: 50 }, { minTdsPpm: 50, maxTdsPpm: 50 },
    { minTdsPpm: 50, maxTdsPpm: Infinity }, { minTdsPpm: NaN, maxTdsPpm: 400 },
    { minTdsPpm: -Infinity, maxTdsPpm: 400 },
  ]) await assertFails(save('owner', fields));
});

test('stranger, caretaker, platform admin, anonymous and unverified callers remain denied', async () => {
  for (const uid of ['stranger', 'caretaker', 'admin', null])
    await assertFails(save(uid, { minTdsPpm: 50, maxTdsPpm: 400 }));
  await assertFails(save('owner', { minTdsPpm: 50, maxTdsPpm: 400 }, false));
});

for (const path of ['security_user_blocks/owner', 'security_aquarium_blocks/tank']) {
  test(`${path} still denies the owner save`, async () => {
    await env.withSecurityRulesDisabled(async context => setDoc(doc(context.firestore(), path), { reason: 'test' }));
    await assertFails(save('owner', { minTdsPpm: 50, maxTdsPpm: 400 }));
  });
}

test('owner transfer, administrator overrides, invalid pH and unknown fields remain denied', async () => {
  for (const fields of [
    { ownerId: 'stranger' }, { thresholdOverrides: { tdsPpm: { min: 0, max: 999 } } },
    { minPh: 15, maxPh: 16 }, { unknownField: true },
  ]) await assertFails(save('owner', { minTdsPpm: 50, maxTdsPpm: 400, ...fields }));
});

test('patch refuses partial or already changed TDS rules and changed insertion anchors', () => {
  assert.throws(() => addTdsProfileValidation(candidate), /ALREADY_PRESENT/);
  assert.throws(() => addTdsProfileValidation(original + '\n// minTdsPpm'), /ALREADY_PRESENT/);
  assert.throws(() => addTdsProfileValidation(original.replace('function userAquariumUpdateFields()', 'function changed()')), /ANCHOR_CHANGED/);
});
