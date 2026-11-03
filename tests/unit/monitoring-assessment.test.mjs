import assert from 'node:assert/strict';
import test from 'node:test';

import { assessAquariumCondition } from '../../src/utils/monitoringAssessment.ts';
import { createSimulatedTelemetry } from '../../src/utils/monitoringSimulator.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';

const profile = {
  id: 'aquarium-a',
  name: 'Indoor Goldfish Aquarium',
  species: ['Goldfish'],
  temp: 22,
  level: 90,
  quality: 90,
  feeder: 'Inactive',
  light: 'Off',
  filter: 'Active',
  minTemp: 20,
  maxTemp: 24,
  minPh: 6.5,
  maxPh: 7.5,
  minLevel: 70,
  minQuality: 80,
  ownerId: 'owner-a',
  ownerName: 'Owner A',
  hasFiltrationSystem: true,
};

function assessScenario(scenario) {
  const now = 1792627200000;
  const telemetry = createSimulatedTelemetry(profile, scenario, now);
  const snapshot = getFreshTelemetrySnapshot(telemetry, now);
  assert.ok(snapshot);

  return assessAquariumCondition({
    profile,
    source: 'simulated',
    assessedAt: now,
    telemetry: {
      temperatureC: snapshot.temperatureC,
      temperatureValid: snapshot.hasFreshTemperatureTelemetry,
      waterLevelPercent: snapshot.waterLevelPercent,
      waterLevelValid: snapshot.waterPresent,
      tdsPpm: snapshot.tdsPpm,
      tdsPurityPercent: snapshot.tdsPercent,
      tdsValid: snapshot.hasFreshPurityTelemetry,
      ph: snapshot.ph,
      phValid: snapshot.hasFreshPhTelemetry,
      turbidity: snapshot.turbidity,
      turbidityValid: snapshot.hasFreshTurbidityTelemetry,
      filterState: snapshot.filterState,
      equipmentStatus: snapshot.equipmentStatus,
      powerStatus: snapshot.powerStatus,
    },
  });
}

test('normal simulator scenario produces a normal profile-based assessment', () => {
  const result = assessScenario('normal');
  assert.equal(result.source, 'simulated');
  assert.equal(result.ruleVersion, 'indoor-goldfish-v2');
  assert.equal(result.overallSeverity, 'normal');
  assert.equal(result.recommendations.length, 0);
  assert.equal(result.parameters.length, 8);
});

test('warning simulator scenario produces maintenance recommendations', () => {
  const result = assessScenario('warning');
  assert.equal(result.overallSeverity, 'warning');
  assert.ok(result.recommendations.length > 0);
  assert.ok(result.parameters.some((item) => item.severity === 'warning'));
});

test('critical simulator scenario detects power and water-quality risks', () => {
  const result = assessScenario('critical');
  assert.equal(result.overallSeverity, 'critical');
  assert.equal(result.parameters.find((item) => item.parameter === 'power')?.severity, 'critical');
  assert.equal(result.parameters.find((item) => item.parameter === 'waterLevel')?.severity, 'critical');
});

test('missing telemetry is explicitly unavailable rather than healthy', () => {
  const result = assessAquariumCondition({
    profile,
    source: 'unavailable',
    telemetry: null,
    assessedAt: 1792627200000,
  });
  assert.equal(result.overallSeverity, 'unavailable');
  assert.ok(result.parameters.every((item) => item.severity === 'unavailable'));
});

const validTelemetry = {
  temperatureC: 22, temperatureValid: true,
  waterLevelPercent: 90, waterLevelValid: true,
  tdsPpm: 220, tdsPurityPercent: 90, tdsValid: true,
  ph: 7, phValid: true, turbidity: 2, turbidityValid: true,
  filterState: 'Active', equipmentStatus: 'Normal', powerStatus: 'Online',
};
const now = 1792627200000;
function evaluate(overrides = {}, profileOverrides = {}, source = 'live') {
  return assessAquariumCondition({
    profile: { ...profile, ...profileOverrides },
    telemetry: { ...validTelemetry, ...overrides }, source, assessedAt: now,
  });
}
function parameter(result, name) {
  return result.parameters.find((entry) => entry.parameter === name);
}


for (const [name, field, cases] of [
  ['temperature', 'temperatureC', [[18, 'critical'], [18.01, 'warning'], [19.99, 'warning'], [20, 'normal'], [24, 'normal'], [24.01, 'warning'], [25.99, 'warning'], [26, 'critical']]],
  ['ph', 'ph', [[6, 'critical'], [6.01, 'warning'], [6.5, 'normal'], [7.5, 'normal'], [7.99, 'warning'], [8, 'critical']]],
  ['waterLevel', 'waterLevelPercent', [[0, 'critical'], [60, 'critical'], [60.01, 'warning'], [69.99, 'warning'], [70, 'normal'], [100, 'normal']]],
  ['tds', 'tdsPurityPercent', [[70, 'critical'], [70.01, 'warning'], [79.99, 'warning'], [80, 'normal'], [100, 'normal']]],
  ['turbidity', 'turbidity', [[0, 'normal'], [5, 'normal'], [5.01, 'warning'], [10, 'warning'], [10.01, 'critical']]],
]) {
  for (const [value, expected] of cases) {
    test(`${name} boundary ${value} is ${expected}`, () => {
      const entry = parameter(evaluate({ [field]: value }), name);
      assert.equal(entry.severity, expected);
      if (expected === 'normal') {
        assert.equal(entry.recommendation, undefined);
      } else {
        assert.equal(entry.recommendationPriority, expected === 'critical' ? 'immediate' : 'review');
        assert.equal(entry.recommendationRuleId, `indoor-goldfish-v2:${name}:${expected}`);
      }
    });
  }
  for (const value of [null, undefined, NaN, Infinity, -Infinity, '22']) {
    test(`${name} rejects malformed value ${String(value)}`, () => {
      const result = evaluate({ [field]: value });
      assert.equal(parameter(result, name).severity, 'unavailable');
      assert.equal(parameter(result, name).recommendation, undefined);
      assert.equal(result.recommendations.length, 0);
    });
  }
}

test('impossible ranges and explicit invalid flags cannot produce maintenance advice', () => {
  for (const [name, patch] of [
    ['ph', { ph: -1 }], ['ph', { ph: 15 }],
    ['waterLevel', { waterLevelPercent: -1 }], ['waterLevel', { waterLevelPercent: 101 }],
    ['tds', { tdsPurityPercent: -1 }], ['tds', { tdsPurityPercent: 101 }],
    ['turbidity', { turbidity: -1 }],
    ['temperature', { temperatureC: 30, temperatureValid: false }],
    ['ph', { ph: 8, phValid: false }],
    ['waterLevel', { waterLevelPercent: 0, waterLevelValid: false }],
    ['tds', { tdsPurityPercent: 0, tdsValid: false }],
    ['turbidity', { turbidity: 20, turbidityValid: false }],
  ]) {
    const entry = parameter(evaluate(patch), name);
    assert.equal(entry.severity, 'unavailable');
    assert.equal(entry.recommendation, undefined);
  }
});

test('missing, inverted, and malformed settings do not silently use defaults', () => {
  for (const [name, patch] of [
    ['temperature', { minTemp: undefined }], ['temperature', { minTemp: 25, maxTemp: 20 }],
    ['temperature', { minTemp: NaN }], ['temperature', { minTemp: 24, maxTemp: 24 }],
    ['ph', { minPh: undefined }], ['ph', { minPh: -1 }], ['ph', { maxPh: 15 }],
    ['ph', { minPh: 8, maxPh: 7 }], ['waterLevel', { minLevel: 101 }],
    ['waterLevel', { minLevel: undefined }], ['tds', { minQuality: -1 }],
    ['tds', { minQuality: undefined }],
  ]) {
    assert.equal(parameter(evaluate({}, patch), name).severity, 'unavailable');
    assert.equal(parameter(evaluate({}, patch), name).recommendation, undefined);
  }
});

test('custom settings and aquarium assessments stay isolated', () => {
  assert.equal(parameter(evaluate({ temperatureC: 26 }, { minTemp: 25, maxTemp: 27 }), 'temperature').severity, 'normal');
  assert.equal(parameter(evaluate({ temperatureC: 26 }), 'temperature').severity, 'critical');
  assert.equal(parameter(evaluate({ ph: 8 }, { minPh: 7, maxPh: 8 }), 'ph').severity, 'normal');
  assert.equal(parameter(evaluate({ waterLevelPercent: 60 }, { minLevel: 50 }), 'waterLevel').severity, 'normal');
  assert.equal(parameter(evaluate({ tdsPurityPercent: 60 }, { minQuality: 50 }), 'tds').severity, 'normal');
});

test('critical recommendations precede warnings, with distinct urgency and traceability', () => {
  const result = evaluate({ temperatureC: 25, powerStatus: 'Offline' });
  assert.equal(result.overallSeverity, 'critical');
  assert.match(result.recommendations[0], /^Critical/);
  assert.match(result.recommendations[1], /^Warning/);
  assert.notEqual(parameter(evaluate({ temperatureC: 25 }), 'temperature').recommendation,
    parameter(evaluate({ temperatureC: 26 }), 'temperature').recommendation);
  assert.ok(result.ruleNotes.some((note) => note.includes('provisional')));
});

test('unknown status values and unavailable sources never become water-condition alerts', () => {
  const result = evaluate({ filterState: 'broken', equipmentStatus: 'broken', powerStatus: 'broken' });
  for (const name of ['filtration', 'equipment', 'power']) {
    assert.equal(parameter(result, name).severity, 'unavailable');
  }
  const unavailable = evaluate({ temperatureC: 40, powerStatus: 'Offline' }, {}, 'unavailable');
  assert.equal(unavailable.overallSeverity, 'unavailable');
  assert.equal(unavailable.recommendations.length, 0);
  assert.ok(unavailable.parameters.every((entry) => entry.severity === 'unavailable'));
});

test('filtration and equipment evaluate only their reported status', () => {
  assert.equal(parameter(evaluate({ filterState: 'Inactive' }), 'filtration').severity, 'warning');
  assert.equal(parameter(evaluate({ filterState: 'Inactive' }, { hasFiltrationSystem: false }), 'filtration').recommendation, undefined);
  assert.match(parameter(evaluate(), 'filtration').message, /does not establish filtration effectiveness/);
  assert.equal(parameter(evaluate({ equipmentStatus: 'Warning' }), 'equipment').severity, 'warning');
  assert.equal(parameter(evaluate({ equipmentStatus: 'Fault' }), 'equipment').severity, 'critical');
});
