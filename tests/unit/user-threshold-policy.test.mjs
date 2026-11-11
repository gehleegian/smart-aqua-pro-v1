// Offline configuration/assessment fixtures only; no live telemetry or writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { assessAquarium, evaluateAquariumReading, getEffectiveThresholds } from '../../src/utils/conditionAssessment.ts';
import { assessmentConfigurationKey, toConditionSummary } from '../../src/utils/monitoringAssessmentCore.ts';
import { assessAquarium as mobileAssess } from '../../../smart-aqua-mobile/src/utils/condition-assessment.ts';

const now = 1794402000000;
const tank = { species: ['Goldfish'], minTemp: 20, maxTemp: 28, minPh: 6.5, maxPh: 10.5,
  minLevel: 70, minTdsPpm: 100, maxTdsPpm: 300 };
const reading = patch => ({ temperatureC: 25.8, temperatureReadingValid: true,
  ph: 10.2, phReadingValid: true, tdsPpm: 220, tdsReadingValid: true,
  waterLevelPercent: 100, waterPresent: true, waterLevelReadingValid: true,
  online: true, updatedAt: now, ...patch });

test('saved user ranges match displayed/assessed limits even with draft species and rules', () => {
  const config = seedRuleConfig();
  const thresholds = getEffectiveThresholds(tank, config);
  assert.deepEqual(thresholds.values.temperatureC, { min: 20, max: 28 });
  assert.deepEqual(thresholds.values.ph, { min: 6.5, max: 10.5 });
  assert.deepEqual(getEffectiveThresholds({ ...tank, minLevel: 0 }, config).values.waterLevelPercent, { min: 0 });
  const admin = getEffectiveThresholds({ ...tank, thresholdOverrides: { temperatureC: { max: 27 } } }, config);
  assert.deepEqual(admin.values.temperatureC, { min: 20, max: 27 });
  assert.deepEqual(admin.values.ph, { min: 6.5, max: 10.5 });
  const result = evaluateAquariumReading(tank, reading(), config);
  for (const key of ['temperatureC', 'ph', 'tdsPpm', 'waterLevelPercent'])
    assert.equal(result.perParameter.find(p => p.parameter === key).status, 'normal');
  assert.equal(result.draft, true);
  assert.deepEqual(result.matchedRules, []);
  const options = { aquarium: tank, reading: reading({ ph: 11 }), source: 'live', now, ruleConfig: config };
  const web = assessAquarium(options);
  assert.equal(web.parameters.find(p => p.parameter === 'ph').severity, 'warning');
  assert.deepEqual(web.recommendations, []);
  assert.deepEqual(mobileAssess(options), web);
});

test('approved recommendations and critical rules use the same user thresholds, scoped per aquarium', () => {
  const config = seedRuleConfig({ approved: true });
  const normal = evaluateAquariumReading(tank, reading(), config);
  assert.equal(normal.perParameter.find(p => p.parameter === 'temperatureC').status, 'normal');
  const other = evaluateAquariumReading({ ...tank, maxTemp: 24 }, reading(), config);
  assert.notEqual(other.perParameter.find(p => p.parameter === 'temperatureC').status, 'normal');
  const bad = evaluateAquariumReading(tank, reading({ temperatureC: 35 }), config);
  assert.equal(bad.perParameter.find(p => p.parameter === 'temperatureC').status, 'critical');
  assert.ok(bad.matchedRules.every(r => r.approvalStatus === 'approved'));
  assert.ok(bad.matchedRules.some(r => r.issueDetected.includes('28')));
});

test('invalid sensors and absent user bounds cannot be made valid by draft defaults', () => {
  const config = seedRuleConfig();
  const result = evaluateAquariumReading({ ...tank, minTdsPpm: undefined, maxTdsPpm: undefined }, reading({ phReadingValid: false }), config);
  assert.equal(result.perParameter.find(p => p.parameter === 'ph').status, 'unavailable');
  assert.equal(result.perParameter.find(p => p.parameter === 'tdsPpm').reason, 'threshold missing');
  assert.deepEqual(result.matchedRules, []);
  assert.equal(evaluateAquariumReading(tank, reading({ tdsPpm: 76 }), config)
    .perParameter.find(p => p.parameter === 'tdsPpm').status, 'warning');
});

test('old server summaries cannot override saved user limits or changed rule approval', () => {
  const config = seedRuleConfig({ approved: true });
  const key = assessmentConfigurationKey(getEffectiveThresholds(tank, config), config.rules);
  const summary = toConditionSummary(evaluateAquariumReading(tank, reading(), config), now, now, key);
  const options = { aquarium: tank, reading: reading(), source: 'live', now, ruleConfig: config,
    engineState: { condition: summary, cleaning: null, bioloadLevel: null } };
  assert.equal(assessAquarium(options).origin, 'server');
  const changed = { ...options, aquarium: { ...tank, maxTemp: 24 } };
  assert.equal(assessAquarium(changed).origin, 'client');
  assert.notEqual(assessAquarium(changed).parameters.find(p => p.parameter === 'temperature').severity, 'normal');
  assert.equal(assessAquarium({ ...options, ruleConfig: seedRuleConfig() }).origin, 'client');
  const legacy = { ...options, engineState: { ...options.engineState, condition: { ...summary, configurationKey: undefined } } };
  assert.equal(assessAquarium(legacy).origin, 'client');
  assert.deepEqual(mobileAssess(changed), assessAquarium(changed));
});
