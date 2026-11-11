import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeTelemetry,
  selectNewestTelemetrySnapshot,
} from '../../src/utils/deviceTelemetryParser.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const now = 1794000000000;

const liveTelemetry = {
  temperatureC: 22,
  temperatureReadingValid: true,
  waterLevelPercent: 90,
  waterPresent: true,
  filterState: 'Active',
  lightState: 'On',
  equipmentStatus: 'Normal',
  online: true,
  updatedAt: now,
};

test('live snapshot preserves device-reported light, filter, and equipment states', () => {
  const snapshot = getFreshTelemetrySnapshot(normalizeTelemetry(liveTelemetry), now);
  assert.equal(snapshot?.filterState, 'Active');
  assert.equal(snapshot?.lightState, 'On');
  assert.equal(snapshot?.equipmentStatus, 'Normal');
});

test('dashboard equipment feedback never presents stored feeder or output states as live feedback', async () => {
  const { getEquipmentFeedback } = await loadTsModule(
    new URL('../../src/utils/dashboardHelpers.ts', import.meta.url)
  );
  const tank = {
    telemetryState: 'live',
    feeder: 'Active',
    filter: 'Inactive',
    light: 'Off',
    reportedFilterState: 'Active',
    reportedLightState: 'On',
    reportedEquipmentStatus: 'Normal',
  };

  assert.deepEqual(getEquipmentFeedback(tank), [
    { label: 'Filter', state: 'Active' },
    { label: 'Light', state: 'On' },
    { label: 'Feeder', state: 'Not reported' },
    { label: 'Equipment diagnostic', state: 'Normal' },
  ]);

  assert.deepEqual(getEquipmentFeedback({ ...tank, telemetryState: 'offline' }), [
    { label: 'Filter', state: 'Unknown' },
    { label: 'Light', state: 'Unknown' },
    { label: 'Feeder', state: 'Unknown' },
    { label: 'Equipment diagnostic', state: 'Unknown' },
  ]);
});

test('realtime subscription keeps the newest accepted snapshot when RTDB receives a backward write', () => {
  const current = normalizeTelemetry(liveTelemetry);
  assert.ok(current);

  const older = normalizeTelemetry({
    ...liveTelemetry,
    temperatureC: 30,
    updatedAt: now - 1_000,
  });
  const newer = normalizeTelemetry({
    ...liveTelemetry,
    temperatureC: 23,
    updatedAt: now + 1_000,
  });

  assert.equal(selectNewestTelemetrySnapshot(current, older), current);
  assert.equal(selectNewestTelemetrySnapshot(current, current), current);
  assert.equal(selectNewestTelemetrySnapshot(current, newer), newer);
  assert.equal(selectNewestTelemetrySnapshot(current, null), null);
});

test('web keeps valid sensors live when the temperature pair reports a fault', () => {
  const telemetry = normalizeTelemetry({
    temperatureReadingValid: false,
    waterLevelPercent: 80,
    waterPresent: true,
    ph: 7.2,
    turbidityState: 'Clear',
    powerStatus: 'Online',
    filterState: 'Active',
    lightState: 'On',
    online: true,
    updatedAt: now,
  });
  const snapshot = getFreshTelemetrySnapshot(telemetry, now);

  assert.ok(snapshot);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, false);
  assert.equal(snapshot.validity.temperature.status, 'invalid');
  assert.equal(snapshot.hasFreshPhTelemetry, true);
  assert.equal(snapshot.ph, 7.2);
  assert.equal(snapshot.turbidityState, 'Clear');
  assert.equal(snapshot.hasFreshPowerTelemetry, true);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, true);
});

test('web keeps connection, pH, and power live when temperature and water-level sensors fault', () => {
  const telemetry = normalizeTelemetry({
    temperatureReadingValid: false,
    waterLevelReadingValid: false,
    ph: 7.2,
    powerStatus: 'Online',
    online: true,
    updatedAt: now,
  });
  const snapshot = getFreshTelemetrySnapshot(telemetry, now);

  assert.ok(snapshot);
  assert.equal(snapshot.hasFreshTemperatureTelemetry, false);
  assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
  assert.equal(snapshot.hasFreshPhTelemetry, true);
  assert.equal(snapshot.powerStatus, 'Online');
  assert.equal(getFreshTelemetrySnapshot(telemetry, now + 60_001), null);
});
