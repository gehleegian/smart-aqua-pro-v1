// Missing or invalid sensor data must never crash a list or show a stored
// profile value as if it were a live reading.
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const { getMonitoringSummaryLine } = await loadTsModule(new URL('../../src/utils/monitoringHelpers.ts', import.meta.url));
const valid = { status: 'valid' };
const base = {
  hasFreshTelemetry: true, telemetryState: 'live', temp: 24.26, level: 90, tdsPpm: 210,
  hasFreshWaterLevelTelemetry: true,
  sensorValidity: { temperature: valid, waterLevel: valid, tds: valid, ph: valid, turbidity: { status: 'missing' }, allValid: true },
};

test('live, valid readings are shown', () => {
  assert.equal(getMonitoringSummaryLine(base), 'Temp 24.3 °C · Level 90% · TDS 210 ppm');
});

test('no telemetry says there is no data instead of showing values', () => {
  for (const telemetryState of ['offline', 'unavailable']) {
    const line = getMonitoringSummaryLine({ ...base, hasFreshTelemetry: false, telemetryState, temp: Number.NaN, sensorValidity: null });
    assert.match(line, /No current readings/);
    assert.doesNotMatch(line, /210|24\.3|NaN/);
  }
});

test('a faulty probe shows Sensor error, never NaN or the stored profile value', () => {
  const line = getMonitoringSummaryLine({ ...base, temp: Number.NaN, tdsPpm: 999,
    sensorValidity: { ...base.sensorValidity, temperature: { status: 'invalid', reason: 'temperatureReadingValid is false' },
      tds: { status: 'invalid', reason: 'negative TDS' }, allValid: false } });
  assert.equal(line, 'Temp Sensor error · Level 90% · TDS Sensor error');
});

test('a sensor the device does not send shows --', () => {
  const line = getMonitoringSummaryLine({ ...base, tdsPpm: null, sensorValidity: { ...base.sensorValidity, tds: { status: 'missing' } } });
  assert.equal(line, 'Temp 24.3 °C · Level 90% · TDS --');
});
