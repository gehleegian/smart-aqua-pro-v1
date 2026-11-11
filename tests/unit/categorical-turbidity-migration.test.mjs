import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareCategoricalTurbidity, CATEGORICAL_TURBIDITY_RULE_IDS } from '../../scripts/lib/prepare-categorical-turbidity.mjs';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { validateRuleDraft } from '../../src/utils/monitoringAssessmentCore.ts';

test('prepared migration changes only three warning conditions and invalidates prior approval', () => {
  const rules = seedRuleConfig({ approved: true }).rules;
  const original = structuredClone(rules);
  const plan = prepareCategoricalTurbidity(rules);
  assert.deepEqual(rules, original);
  assert.deepEqual(plan.map(item => item.id), CATEGORICAL_TURBIDITY_RULE_IDS);
  for (const item of plan) {
    assert.equal(item.changed, true);
    assert.deepEqual(item.after.condition, { op: 'eq', value: 'Cloudy' });
    const changed = new Set(['condition', 'status', 'approvedBy', 'approvedAt']);
    for (const key of Object.keys(item.before)) {
      if (!changed.has(key)) assert.deepEqual(item.after[key], item.before[key], key);
    }
    assert.equal(item.after.status, 'draft');
    assert.equal(item.after.approvedBy, null);
    assert.equal(item.after.approvedAt, null);
    assert.equal(validateRuleDraft(item.id, item.after).ok, true);
  }
  assert.equal(plan.some(item => item.id === 'turbidity_critical'), false);
  assert.ok(prepareCategoricalTurbidity(plan.map(item => item.after)).every(item => !item.changed));
});

test('preparation fails closed on missing, duplicate or unexpected rule content', () => {
  const rules = seedRuleConfig().rules;
  assert.throws(() => prepareCategoricalTurbidity([]), /exactly one/);
  assert.throws(() => prepareCategoricalTurbidity([...rules, rules.find(r => r.ruleId === 'turbidity_warning')]), /exactly one/);
  for (const patch of [{severity:'critical'}, {condition:{op:'gt',ref:'max',marginPct:20}}, {parameter:'ph'}]) {
    const changed = rules.map(rule => rule.ruleId === 'turbidity_warning' ? {...rule,...patch} : rule);
    assert.throws(() => prepareCategoricalTurbidity(changed), /Unexpected/);
  }
});
