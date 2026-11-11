import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from '../helpers/loadTsModule.mjs';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';

const { mapDashboardAquariums, mergeDashboardAquariums } = await loadTsModule(
  new URL('../../src/utils/dashboardHelpers.ts', import.meta.url)
);
const { buildAlertCandidates } = await loadTsModule(
  new URL('../../src/utils/alertsHelpers.ts', import.meta.url)
);

const now = 1792627200000;
const profile = {
  id: 'aq-1', name: 'Tank A', species: ['Goldfish'], ownerId: 'owner-a', ownerName: 'Owner A',
  // Stored profile values that used to raise alerts on their own.
  temp: 0, level: 0, quality: 0, tdsPpm: 900,
  feeder: 'Inactive', light: 'Off', filter: 'Active',
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80,
  hasFiltrationSystem: true,
};

function telemetry(patch = {}) {
  return {
    temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true,
    tdsPpm: 220, tdsPercent: 90, tdsReadingValid: true, ph: 7, filterState: 'Active',
    equipmentStatus: 'Normal', powerStatus: 'Online', online: true, updatedAt: now, ...patch,
  };
}

function alertsFor(shadowTelemetry, at = now, config = seedRuleConfig()) {
  const shadows = shadowTelemetry === undefined
    ? {}
    : { 'aq-1': { telemetry: shadowTelemetry, control: null, latestCommand: null } };
  return buildAlertCandidates(mergeDashboardAquariums(mapDashboardAquariums([profile]), shadows, at, config));
}

const WATER_CATEGORIES = new Set(['temperature', 'ph', 'tds', 'turbidity', 'water_level', 'water_quality']);
const waterAlerts = (alerts) => alerts.filter((a) => WATER_CATEGORIES.has(a.category));

test('stored profile/default values never raise alerts when no telemetry exists', () => {
  assert.deepEqual(alertsFor(undefined), []);
});

test('stale telemetry raises only a system alert, never water-condition alerts', () => {
  const alerts = alertsFor(telemetry({ temperatureC: 40, ph: 3, updatedAt: now - 120_000 }));
  assert.deepEqual(waterAlerts(alerts), []);
  assert.deepEqual(alerts.map((a) => a.category), ['system']);
});

test('normal live telemetry raises no alerts', () => {
  assert.deepEqual(alertsFor(telemetry()), []);
});

test('zero, sentinel, and flagged-invalid readings never raise water-condition alerts', () => {
  for (const patch of [
    { ph: 0 }, { ph: 15 }, { ph: -1 },
    { temperatureC: 0 }, { temperatureC: 85 }, { temperatureC: -127 },
    { temperatureReadingValid: false, temperatureC: 40 },
    { tdsPpm: 0, tdsPercent: 0 }, { tdsPpm: undefined, tdsPercent: 0 },
    { tdsReadingValid: false, tdsPpm: 2000, tdsPercent: 0 },
    { waterLevelPercent: 0 }, { waterLevelPercent: 0, waterPresent: undefined },
    { waterLevelPercent: 150 },
  ]) {
    assert.deepEqual(waterAlerts(alertsFor(telemetry(patch))), [], JSON.stringify(patch));
  }
});

test('a confirmed empty tank (0% with waterPresent=false) is still a real critical alert', () => {
  const reading = telemetry({ waterLevelPercent: 0, waterPresent: false });
  assert.deepEqual(waterAlerts(alertsFor(reading)).map(a => [a.category, a.type]), [['water_level', 'warning']],
    'saved minimum level raises a warning without activating a draft critical/recommendation rule');
  const alerts = waterAlerts(alertsFor(reading, now, seedRuleConfig({ approved: true })));
  assert.deepEqual(alerts.map((a) => [a.category, a.type]), [['water_level', 'critical']]);
});

test('valid out-of-range live readings raise alerts from the shared assessment', () => {
  const approved = seedRuleConfig({ approved: true });
  const alerts = alertsFor(telemetry({ temperatureC: 26.5, ph: 8.12, waterLevelPercent: 15.7 }), now, approved);
  const byCategory = Object.fromEntries(alerts.map((a) => [a.category, a.type]));
  assert.equal(byCategory.temperature, 'critical');
  // The test-approved rule treats pH as critical only beyond 8.25; 8.12 is a warning.
  assert.equal(byCategory.ph, 'warning');
  assert.equal(byCategory.water_level, 'critical');
  const critical = alertsFor(telemetry({ ph: 8.3 }), now, approved);
  assert.equal(Object.fromEntries(critical.map((a) => [a.category, a.type])).ph, 'critical');
});
