import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  COMMAND_ACK_TIMEOUT_MS,
  REQUIRE_SENSOR_VALIDITY_FLAGS,
  TELEMETRY_STALE_MS,
  evaluateTelemetryValidity,
  getCommandStatus,
  getTelemetryFreshness,
} from '../../src/utils/monitoringAssessmentCore.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { createSimulatedContractPayload } from '../../src/utils/monitoringSimulator.ts';

const rules = JSON.parse(readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8'));
const telemetryRules = rules.rules.devices.$aquariumId.telemetry;
const ALLOWED_FIELDS = Object.keys(telemetryRules).filter((key) => !key.startsWith('.') && key !== '$other');
const REQUIRED_FIELDS = ['temperatureC', 'waterLevelPercent', 'updatedAt', 'online'];

// Exact live Aquarium 1 payload shape observed 2026-11-06 (values only).
const LIVE_FIRMWARE = Object.freeze({
  equipmentStatus: 'Unknown', filterState: 'Inactive', online: true, ph: 8.116076,
  powerStatus: 'Unknown', tdsReadingValid: false, temperatureC: 26.5,
  temperatureReadingValid: true, updatedAt: 1793978486622, waterLevelPercent: 15.72354, waterPresent: true,
});

const profile = {
  id: 'aq', name: 'A', species: ['Goldfish'], ownerId: 'o', ownerName: 'O', temp: 22, level: 90, quality: 90,
  feeder: 'Inactive', light: 'Off', filter: 'Active', minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5,
  minLevel: 70, minQuality: 80, hasFiltrationSystem: true,
};

test('contract constants match the agreed decisions', () => {
  assert.equal(TELEMETRY_STALE_MS, 60_000);
  assert.equal(COMMAND_ACK_TIMEOUT_MS, 30_000);
  assert.equal(REQUIRE_SENSOR_VALIDITY_FLAGS, false, 'flip only at the scheduled firmware switchover');
});

test('freshness: 60 s window (3 missed 15 s sends); the live ~7.5 s firmware cadence stays live', () => {
  const now = 1793980261525;
  assert.equal(getTelemetryFreshness({ updatedAt: now - 7_500, online: true }, now), 'live');
  assert.equal(getTelemetryFreshness({ updatedAt: now - 60_000, online: true }, now), 'live');
  assert.equal(getTelemetryFreshness({ updatedAt: now - 60_001, online: true }, now), 'offline');
});

test('every simulator scenario emits only rule-allowed telemetry fields', () => {
  for (const scenario of ['normal', 'warning', 'critical']) {
    const payload = createSimulatedContractPayload(profile, scenario, 1793980261525);
    for (const key of Object.keys(payload)) assert.ok(ALLOWED_FIELDS.includes(key), `${scenario}: ${key}`);
    for (const key of REQUIRED_FIELDS) assert.ok(key in payload, `${scenario}: missing ${key}`);
    assert.equal(payload.phReadingValid, true);
    assert.equal(payload.turbidityReadingValid, true);
  }
});

test('live firmware payload: temperature and pH valid (legacy flags), TDS invalid, turbidity missing', () => {
  const validity = evaluateTelemetryValidity(LIVE_FIRMWARE);
  assert.equal(validity.temperature.status, 'valid');
  assert.equal(validity.ph.status, 'valid');
  assert.equal(validity.tds.status, 'invalid');
  assert.equal(validity.turbidity.status, 'missing');
  assert.equal(validity.waterLevel.status, 'valid');
  assert.equal(validity.allValid, false);
});

test('after switchover (flags required) a missing phReadingValid is a sensor fault', () => {
  const validity = evaluateTelemetryValidity(LIVE_FIRMWARE, { requireFlags: true });
  assert.equal(validity.ph.status, 'invalid');
  assert.match(validity.ph.reason, /phReadingValid is missing/);
  const updated = evaluateTelemetryValidity({ ...LIVE_FIRMWARE, phReadingValid: true }, { requireFlags: true });
  assert.equal(updated.ph.status, 'valid');
});

test('explicit false flags and impossible values are sensor faults', () => {
  for (const [sensor, patch] of [
    ['ph', { ph: 7, phReadingValid: false }], ['ph', { ph: 0 }], ['ph', { ph: 14.2 }],
    ['turbidity', { turbidity: 3, turbidityReadingValid: false }], ['turbidity', { turbidity: -1 }],
    ['temperature', { temperatureC: 85 }], ['temperature', { temperatureC: -127 }],
    ['temperature', { temperatureReadingValid: false }],
    ['tds', { tdsPpm: 0, tdsReadingValid: true }],
    ['waterLevel', { waterLevelPercent: 0 }],
  ]) {
    assert.equal(evaluateTelemetryValidity({ ...LIVE_FIRMWARE, ...patch })[sensor].status, 'invalid', JSON.stringify(patch));
  }
});

test('snapshot exposes validity and hides invalid values from display paths', () => {
  const now = 1793978486622;
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry({ ...LIVE_FIRMWARE, ph: 0 }), now);
  assert.equal(snapshot.hasFreshPhTelemetry, false);
  assert.equal(snapshot.ph, null);
  assert.equal(snapshot.validity.ph.status, 'invalid');
  assert.equal(snapshot.hasFreshPurityTelemetry, false);
});

test('command status: pending, done, failed, mismatched ack, and no response after 30 s', () => {
  const command = { commandId: 'feed_now-1', requestedAt: 1_000_000 };
  assert.equal(getCommandStatus(null, null, 1_000_000), 'none');
  assert.equal(getCommandStatus(command, null, 1_000_000 + 1), 'pending');
  assert.equal(getCommandStatus(command, null, 1_000_000 + 30_000), 'pending');
  assert.equal(getCommandStatus(command, null, 1_000_000 + 30_001), 'no_response');
  assert.equal(getCommandStatus(command, { commandId: 'feed_now-1', status: 'done' }, 1_000_500), 'done');
  assert.equal(getCommandStatus(command, { commandId: 'feed_now-1', status: 'failed' }, 1_090_000), 'failed');
  assert.equal(getCommandStatus(command, { commandId: 'feed_now-0', status: 'done' }, 1_000_500), 'pending');
  assert.equal(getCommandStatus(command, { commandId: 'feed_now-0', status: 'done' }, 1_031_000), 'no_response');
});

test('history rows: invalid values show "Sensor error" and never classify as water conditions', async () => {
  const { loadTsModule } = await import('../helpers/loadTsModule.mjs');
  const { formatHistoryValue, getRowStatus, buildSummaryItems } = await loadTsModule(
    new URL('../../src/utils/dataLogsHelpers.ts', import.meta.url)
  );
  const entry = (patch = {}) => ({
    temperatureC: 22, temperatureReadingValid: true, waterLevelPercent: 90, waterPresent: true,
    tdsPpm: 220, tdsPercent: 90, tdsReadingValid: true, ph: 7, online: true,
    recordedAt: '2026-05-20T10:00:00', recordedAtEpoch: 1779242400000, ...patch,
  });
  // Old May test data: zero temperature and pH.
  const zero = entry({ temperatureC: 0, ph: 0 });
  assert.equal(formatHistoryValue(zero, 'ph', () => '0.0'), 'Sensor error');
  assert.equal(formatHistoryValue(zero, 'temperature', () => '0.0'), 'Sensor error');
  assert.equal(getRowStatus(zero, profile), 'sensor error');
  assert.equal(getRowStatus(entry(), profile), 'normal');
  assert.equal(getRowStatus(entry({ temperatureC: 26.5 }), profile), 'critical');
  assert.equal(formatHistoryValue(entry({ turbidity: undefined }), 'turbidity', () => 'x'), '--');
  if (typeof buildSummaryItems === 'function') {
    const items = buildSummaryItems([zero]);
    assert.equal(items.find((item) => item.label === 'Average pH').value, '--');
  }
});
