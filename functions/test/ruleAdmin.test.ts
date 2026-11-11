import assert from 'node:assert/strict';
import test, { after, before, beforeEach } from 'node:test';
import { deleteApp, initializeApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { approveRuleConfig } from '../src/ruleAdmin.js';
import { clearCollections, readSeed, seedRules } from './testSeed.js';

let app: App;
let firestore: Firestore;
const actor = { uid: 'approval-test-admin', email: 'admin@example.test', emailVerified: true, platformAdmin: true };
before(() => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Firestore emulator required.');
  app = initializeApp({ projectId: 'demo-smartaqua-rule-approval' }, 'rule-approval-tests');
  firestore = getFirestore(app);
});
beforeEach(async () => {
  await clearCollections(firestore, ['rules', 'species', 'audit_logs', 'users']);
  await seedRules(firestore, readSeed());
});
after(async () => { await deleteApp(app); });

test('approval still requires a source and an authorized administrator', async () => {
  await assert.rejects(approveRuleConfig({ firestore }, actor, { kind: 'rule', id: 'turbidity_warning' }), /citation/);
  await firestore.doc('rules/turbidity_warning').update({ source: 'TEST_FIXTURE_ONLY reference' });
  await assert.rejects(approveRuleConfig({ firestore }, { ...actor, platformAdmin: false }, {
    kind: 'rule', id: 'turbidity_warning',
  }), /administrator/);
});

test('valid categorical configuration is approved with an audit record, without approving other drafts', async () => {
  await firestore.doc('rules/turbidity_warning').update({
    condition: { op: 'eq', value: 'Cloudy' }, source: 'TEST_FIXTURE_ONLY reference',
  });
  const result = await approveRuleConfig({ firestore, now: () => 1000 }, actor, { kind: 'rule', id: 'turbidity_warning' });
  assert.equal(result.changed, true);
  assert.equal((await firestore.doc('rules/turbidity_warning').get()).get('status'), 'approved');
  assert.equal((await firestore.doc('rules/tds_high_warning').get()).get('status'), 'draft');
  const audit = await firestore.collection('audit_logs').get();
  assert.equal(audit.size, 1);
  assert.equal(audit.docs[0].get('action'), 'rule.approve');
});
