import assert from 'node:assert/strict';
import test from 'node:test';

import { assessAquarium, getEffectiveThresholds } from '../../src/utils/conditionAssessment.ts';
import { createSimulatedTelemetry } from '../../src/utils/monitoringSimulator.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import {
  CONDITION_SUMMARY_MAX_AGE_MS,
  evaluateAquarium,
  readAquariumOverrides,
  resolveThresholds,
  toConditionSummary,
} from '../../src/utils/monitoringAssessmentCore.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';

// Client-side condition assessment (Sprint 2): the browser uses the same rule
// engine and the Firestore rules, and prefers the server summary when fresh.

const now = 1792627200000;
const ruleConfig = seedRuleConfig({ approved: true });
const profile = {
  id: 'aquarium-a', name: 'Indoor Goldfish Aquarium', species: ['Goldfish'],
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80,
  ownerId: 'owner-a', ownerName: 'Owner A', hasFiltrationSystem: true,
};
const reading = (patch = {}) => ({
  temperatureC: 22, temperatureReadingValid: true, ph: 7, phReadingValid: true,
  tdsPpm: 250, tdsReadingValid: true, turbidity: 2, turbidityReadingValid: true,
  waterLevelPercent: 90, waterPresent: true, filterState: 'Active', equipmentStatus: 'Normal',
  powerStatus: 'Online', online: true, updatedAt: now, ...patch,
});
const assess = (patch = {}, options = {}) => assessAquarium({
  aquarium: profile, reading: reading(patch), source: 'live', now, ruleConfig, ...options,
});

for (const [scenario, expected] of [['normal', 'normal'], ['warning', 'warning'], ['critical', 'critical']]) {
  test(`simulator ${scenario} scenario is placed from the Firestore thresholds and classifies ${expected}`, () => {
    const thresholds = getEffectiveThresholds(profile, ruleConfig);
    const telemetry = createSimulatedTelemetry(thresholds, scenario, now, profile);
    assert.ok(getFreshTelemetrySnapshot(telemetry, now));
    const result = assessAquarium({ aquarium: profile, reading: telemetry, source: 'simulated', now, ruleConfig });
    assert.equal(result.overallSeverity, expected);
    assert.equal(result.origin, 'client');
    if (expected !== 'normal') assert.ok(result.recommendations.length > 0);
  });
}

test('simulator sends nothing for a parameter without a threshold', () => {
  const thresholds = resolveThresholds(null);
  assert.equal(createSimulatedTelemetry(thresholds, 'normal', now, profile), null, 'no temperature/level threshold: no valid payload');
});

test('missing telemetry is explicitly unavailable rather than healthy', () => {
  const result = assessAquarium({ aquarium: profile, reading: null, source: 'unavailable', now, ruleConfig });
  assert.equal(result.overallSeverity, 'unavailable');
  assert.equal(result.origin, 'none');
  assert.deepEqual(result.recommendations, []);
});

test('rules not loaded: unavailable with an explanation, never a guessed classification', () => {
  const result = assess({ temperatureC: 30 }, { ruleConfig: null });
  assert.equal(result.overallSeverity, 'unavailable');
  assert.match(result.ruleNotes.join(' '), /not loaded/);
});

test('draft thresholds and rules are preview-only and cannot activate a live assessment', () => {
  const draft = seedRuleConfig();
  const result = assessAquarium({ aquarium: profile, reading: reading({ temperatureC: 25 }), source: 'live', now, ruleConfig: draft });
  assert.equal(result.overallSeverity, 'unavailable');
  assert.equal(result.draft, true);
  assert.deepEqual(result.recommendations, []);
  assert.match(result.ruleNotes.join(' '), /approval/i);
});

test('a fresh server condition summary wins over the browser evaluation', () => {
  const serverResult = evaluateAquarium(reading({ temperatureC: 25 }), resolveThresholds(ruleConfig.speciesById.goldfish), ruleConfig.rules, {});
  const engineState = { condition: toConditionSummary(serverResult, now - 60_000, now - 60_000), cleaning: null, bioloadLevel: null };
  const fresh = assess({}, { engineState });
  assert.equal(fresh.origin, 'server');
  assert.equal(fresh.overallSeverity, 'warning');
  const stale = assess({}, { engineState: { ...engineState, condition: { ...engineState.condition, evaluatedAt: now - CONDITION_SUMMARY_MAX_AGE_MS - 1 } } });
  assert.equal(stale.origin, 'client');
  assert.equal(stale.overallSeverity, 'normal');
  const simulated = assess({}, { engineState, source: 'simulated' });
  assert.equal(simulated.origin, 'client', 'simulation never shows the server summary');
});

test('impossible values and explicit invalid flags are sensor faults with only the probe check', () => {
  const result = assess({ ph: 0, temperatureReadingValid: false, waterLevelPercent: 150 });
  assert.deepEqual(result.faults.map((fault) => fault.parameter).sort(), ['ph', 'temperatureC', 'waterLevelPercent']);
  assert.ok(result.matchedRules.every((rule) => rule.ruleId === 'sensor_fault'));
  assert.ok(result.recommendations.every((text) => /probe connection or calibration/.test(text)));
});

test('unapproved aquarium overrides remain preview-only and cannot change a live assessment', () => {
  const custom = { ...profile, maxTemp: 26 };
  assert.equal(getEffectiveThresholds(custom, ruleConfig).values.temperatureC.max, 26, 'editor preview keeps the profile value');
  assert.equal(assessAquarium({ aquarium: custom, reading: reading({ temperatureC: 25 }), source: 'live', now, ruleConfig }).overallSeverity, 'warning');
  assert.equal(assess({ temperatureC: 25 }).overallSeverity, 'warning', 'the other aquarium is unaffected');
  const admin = { ...custom, thresholdOverrides: { temperatureC: { max: 23 } } };
  assert.deepEqual(readAquariumOverrides(admin), { temperatureC: { max: 23 } });
  assert.equal(getEffectiveThresholds(admin, ruleConfig).values.temperatureC.max, 23, 'editor preview keeps the explicit override');
  assert.equal(assessAquarium({ aquarium: admin, reading: reading({ temperatureC: 23.5 }), source: 'live', now, ruleConfig }).overallSeverity, 'normal');
});

test('inverted or out-of-range profile limits are ignored, falling back to the species defaults', () => {
  assert.deepEqual(readAquariumOverrides({ minTemp: 30, maxTemp: 20, minPh: -1, maxPh: 20, minLevel: 0 }), {});
  const broken = { ...profile, minTemp: 30, maxTemp: 20 };
  assert.equal(assessAquarium({ aquarium: broken, reading: reading({ temperatureC: 25 }), source: 'live', now, ruleConfig }).overallSeverity, 'warning');
});

test('unknown power/equipment show "not monitored" and do not block NORMAL', () => {
  const result = assess({ powerStatus: 'Unknown', equipmentStatus: 'Unknown' });
  assert.equal(result.overallSeverity, 'normal');
  const power = result.parameters.find((item) => item.parameter === 'power');
  assert.equal(power.notMonitored, true);
  assert.equal(power.message, 'Not monitored: the device does not report this status yet.');
});

test('critical findings are listed before warnings, each traceable to a rule id', () => {
  const result = assess({ temperatureC: 26.5, ph: 8 });
  assert.deepEqual(result.matchedRules.map((rule) => [rule.ruleId, rule.severity]), [
    ['temp_high_critical', 'critical'],
    ['ph_high_warning', 'warning'],
  ]);
  for (const item of result.parameters.filter((entry) => entry.recommendation)) {
    assert.ok(item.recommendationRuleId);
  }
  assert.equal(result.draft, false);
  assert.equal(result.ruleVersion, 'rules:approved');
});

test('a confirmed empty tank (0% with waterPresent=false) is a real critical water level', () => {
  const result = assess({ waterLevelPercent: 0, waterPresent: false, temperatureReadingValid: undefined, temperatureC: 22 });
  assert.equal(result.parameters.find((item) => item.parameter === 'waterLevel').severity, 'critical');
});
