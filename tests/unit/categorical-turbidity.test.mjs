import assert from 'node:assert/strict';
import test from 'node:test';
import { assessAquarium, evaluateAquariumReading } from '../../src/utils/conditionAssessment.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const { assessTelemetry } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/monitoring-assessment.ts', import.meta.url));
const tank = { id: 'a', species: ['Goldfish'], minTemp: 20, maxTemp: 28, minPh: 6.5, maxPh: 10.5,
  minTdsPpm: 100, maxTdsPpm: 400, minLevel: 70, hasFiltrationSystem: true };
const now = 1794000000000;
const reading = patch => ({ temperatureC: 25, ph: 7, tdsPpm: 200, tdsReadingValid: true,
  waterLevelPercent: 100, waterPresent: true, updatedAt: now, online: true,
  filterState: 'Active', turbidityState: 'Clear', ...patch });
// Test-only configuration: retain the existing actions, metadata and extra checks.
// No live configuration or seed approval is modified by these tests.
function categoricalConfig(approved = true) {
  const config = seedRuleConfig({ approved });
  config.rules = config.rules.map(rule => rule.parameter === 'turbidity' && rule.severity === 'warning'
    ? { ...rule, condition: { op: 'eq', value: 'Cloudy' } } : rule);
  return config;
}

test('configured categorical rules assess Clear normally and Cloudy using existing filter-specific advice', () => {
  const config = categoricalConfig();
  const clear = evaluateAquariumReading(tank, reading(), config);
  const clearResult = clear.perParameter.find(item => item.parameter === 'turbidity');
  assert.equal(clearResult.status, 'normal');
  assert.equal(clearResult.value, 'Clear');
  assert.equal(clearResult.unit, undefined);
  assert.equal(clear.matchedRules.some(rule => rule.parameter === 'turbidity'), false);
  for (const [filterState, expected] of [['Active', 'turbidity_warning_filter_on'], ['Inactive', 'turbidity_warning_filter_off'], [undefined, 'turbidity_warning']]) {
    const result = evaluateAquariumReading(tank, reading({ turbidityState: 'Cloudy', filterState }), config);
    const turbidity = result.perParameter.find(item => item.parameter === 'turbidity');
    assert.equal(turbidity.status, 'warning');
    assert.equal(turbidity.ruleId, expected);
    assert.equal(turbidity.value, 'Cloudy');
    assert.equal(turbidity.unit, undefined);
    const rule = result.matchedRules.find(item => item.ruleId === expected);
    assert.equal(rule.action, config.rules.find(item => item.ruleId === expected).action);
    assert.doesNotMatch(rule.issueDetected, /NTU/);
  }
});

test('Unknown, explicit sensor errors and absent active categorical rules never invent water recommendations', () => {
  const config = categoricalConfig();
  for (const patch of [{ turbidityState: 'Unknown' }, { turbidityReadingValid: false }]) {
    const result = evaluateAquariumReading(tank, reading(patch), config);
    assert.equal(result.perParameter.find(item => item.parameter === 'turbidity').status, 'unavailable');
    assert.equal(result.matchedRules.some(rule => rule.parameter === 'turbidity' && rule.ruleId !== 'sensor_fault'), false);
  }
  for (const config of [seedRuleConfig({ approved: true }), categoricalConfig(false)]) {
    const result = evaluateAquariumReading(tank, reading({ turbidityState: 'Cloudy' }), config);
    assert.equal(result.perParameter.find(item => item.parameter === 'turbidity').status, 'warning');
    assert.match(result.perParameter.find(item => item.parameter === 'turbidity').reason, /no rule matches/);
    assert.equal(result.matchedRules.some(item => item.parameter === 'turbidity'), false);
  }
});

test('web/mobile categorical assessments agree and stale readings do not produce recommendations', () => {
  const config = categoricalConfig();
  for (const turbidityState of ['Clear', 'Cloudy', 'Unknown']) {
    const raw = reading({ turbidityState });
    const web = assessAquarium({ aquarium: tank, reading: raw, source: 'live', now, ruleConfig: config });
    const mobile = assessTelemetry(tank, raw, 'live', now, config);
    assert.deepEqual(mobile, web);
  }
  const stale = assessAquarium({ aquarium: tank, reading: reading({ turbidityState: 'Cloudy' }), source: 'unavailable', now, ruleConfig: config });
  assert.equal(stale.overallSeverity, 'unavailable');
  assert.deepEqual(stale.recommendations, []);
});

test('confirmed categories do not depend on configured severity or numeric limits', () => {
  const config = categoricalConfig();
  config.rules = config.rules.map(rule => rule.parameter === 'turbidity'
    ? { ...rule, severity: 'critical', condition: { op: 'eq', value: 'Cloudy' } } : rule);
  for (const [turbidityState, expected] of [['Clear', 'normal'], ['Cloudy', 'warning'], ['Unknown', 'unavailable']]) {
    const result = evaluateAquariumReading(tank, reading({ turbidityState, turbidity: 100 }), config);
    const parameter = result.perParameter.find(item => item.parameter === 'turbidity');
    assert.equal(parameter.status, expected);
    assert.equal(parameter.value, turbidityState);
    assert.equal(parameter.unit, undefined);
    assert.equal(result.matchedRules.some(rule => rule.parameter === 'turbidity'), false);
  }
});

test('unrelated drafts do not block approved categorical filter advice on web or mobile', () => {
  const config = categoricalConfig();
  config.rules = config.rules.map(rule => rule.ruleId === 'tds_high_warning'
    ? { ...rule, status: 'draft' } : rule);
  const raw = reading({ turbidityState: 'Cloudy' });
  const web = assessAquarium({ aquarium: tank, reading: raw, source: 'live', now, ruleConfig: config });
  const mobile = assessTelemetry(tank, raw, 'live', now, config);
  assert.deepEqual(mobile, web);
  assert.ok(web.matchedRules.some(rule => rule.ruleId === 'turbidity_warning_filter_on'));
  assert.equal(web.matchedRules.some(rule => rule.approvalStatus !== 'approved'), false);
  assert.equal(web.draft, true);
});
