import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getDeviceTelemetryState, getFreshTelemetrySnapshot, setDeviceTelemetryClockOffsetMs } from '../../src/types/device.ts';
import { mapTelemetry } from '../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts';
import { getDeviceTelemetryState as mobileState, getFreshTelemetrySnapshot as mobileSnapshot,
  setDeviceTelemetryClockOffsetMs as mobileOffset } from '../../../smart-aqua-mobile/src/utils/device-telemetry.ts';
import { formatWaterLevel, TELEMETRY_STALE_MS } from '../../src/utils/monitoringAssessmentCore.ts';

test('freshness uses receive time rather than an earlier UI tick', () => {
  const receivedAt = Date.now();
  const telemetry = normalizeTelemetry({ temperatureC: 26, waterLevelPercent: 91.63751,
    updatedAt: receivedAt - 100, online: true, turbidityState: 'Cloudy' });
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt - 2000), null);
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt)?.turbidityState, 'Cloudy');
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt + TELEMETRY_STALE_MS + 1000), null);
  for (const name of ['useMonitoringController', 'useDashboardController']) {
    const source = readFileSync(new URL(`../../src/hooks/${name}.ts`, import.meta.url), 'utf8');
    assert.match(source, /\(shadow\) => \{[\s\S]*?setTelemetryNow\(Date.now\(\)\);\s*setDeviceShadows/);
  }
  const mobileHook = readFileSync(new URL('../../../smart-aqua-mobile/src/hooks/use-mobile-data.ts', import.meta.url), 'utf8');
  assert.match(mobileHook, /\(value\) => \{\s*setTelemetryReceivedAt\(Date.now\(\)\);\s*setTelemetry/);
});

test('millisecond-ahead readings remain visible on arrival and subsequent ticks in both apps', () => {
  const now = 1794000000000;
  // Regression fixtures for the 3-8 ms server-offset error observed read-only.
  for (const aheadMs of [1, 3, 4, 5, 6, 8, 1000]) {
    const raw = Object.freeze({ temperatureC: 26, waterLevelPercent: 90,
      updatedAt: now + aheadMs, online: true, turbidityState: 'Clear' });
    const web = Object.freeze(normalizeTelemetry(raw));
    const mobile = Object.freeze(mapTelemetry(raw));
    for (const tick of [now, now + 1000, now + 5000]) {
      assert.equal(getDeviceTelemetryState(web, tick), 'live');
      assert.equal(mobileState(mobile, tick), 'live');
      assert.equal(getFreshTelemetrySnapshot(web, tick)?.turbidityState, 'Clear');
      assert.equal(mobileSnapshot(mobile, tick)?.turbidityState, 'Clear');
    }
    assert.equal(web.updatedAt, now + aheadMs, 'do not rewrite the measured timestamp');
    assert.equal(mobile.updatedAt, now + aheadMs);
  }
});

test('clock-skew allowance neither hides real outages nor accepts malformed/far-future readings', () => {
  const now = 1794000000000;
  const reading = { temperatureC: 26, waterLevelPercent: 90, updatedAt: now, online: true };
  for (const state of [getDeviceTelemetryState, mobileState]) {
    for (const aheadMs of [1001, 60_000, 86_400_000])
      assert.equal(state({ ...reading, updatedAt: now + aheadMs }, now), 'unavailable');
    for (const updatedAt of [undefined, null, NaN, Infinity, '1794000000000', 1000])
      assert.equal(state({ ...reading, updatedAt }, now), 'unavailable');
    assert.equal(state({ ...reading, updatedAt: now - 60_000 }, now), 'live');
    assert.equal(state({ ...reading, updatedAt: now - 60_001 }, now), 'offline');
    assert.equal(state({ ...reading, online: false, updatedAt: now + 8 }, now), 'offline');
  }
  try {
    // An offset estimate can be a little behind even with a correct reading.
    setDeviceTelemetryClockOffsetMs(-8);
    mobileOffset(-8);
    assert.equal(getDeviceTelemetryState(reading, now), 'live');
    assert.equal(mobileState(reading, now), 'live');
    assert.equal(getDeviceTelemetryState({ ...reading, updatedAt: now - 60_009 }, now), 'offline');
    assert.equal(mobileState({ ...reading, updatedAt: now - 60_009 }, now), 'offline');
  } finally {
    setDeviceTelemetryClockOffsetMs(0);
    mobileOffset(0);
  }
});

test('clock-skew allowance does not override explicit sensor faults', () => {
  const now = 1794000000000;
  const raw = { temperatureReadingValid: false, waterLevelReadingValid: false,
    ph: 7.2, phReadingValid: false, updatedAt: now + 8, online: true };
  for (const snapshot of [getFreshTelemetrySnapshot(normalizeTelemetry(raw), now),
    mobileSnapshot(mapTelemetry(raw), now)]) {
    assert.ok(snapshot);
    assert.equal(snapshot.hasFreshTemperatureTelemetry, false);
    assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
    assert.equal(snapshot.hasFreshPhTelemetry, false);
  }
});

test('categorical turbidity stays separate from numeric NTU in both parsers', () => {
  for (const turbidityState of ['Clear', 'Cloudy', 'Unknown', 'invalid', 20]) {
    const input = { temperatureC: 26, waterLevelPercent: 90, updatedAt: Date.now(), online: true, turbidityState };
    const expected = ['Clear', 'Cloudy', 'Unknown'].includes(turbidityState) ? turbidityState : undefined;
    assert.equal(normalizeTelemetry(input).turbidityState, expected);
    assert.equal(mapTelemetry(input).turbidityState, expected);
    assert.equal(normalizeTelemetry(input).turbidity, undefined);
    assert.equal(mapTelemetry(input).turbidity, undefined);
  }
  const stale = { temperatureC: 26, waterLevelPercent: 90, updatedAt: Date.now() - TELEMETRY_STALE_MS - 1000, online: true, turbidityState: 'Clear' };
  assert.equal(getFreshTelemetrySnapshot(normalizeTelemetry(stale)), null);
});

test('water level displays at most one decimal without changing stored readings', () => {
  assert.equal(formatWaterLevel(91.63751), '91.6%');
  assert.equal(formatWaterLevel(100), '100%');
  assert.equal(formatWaterLevel(0), '0%');
  assert.equal(formatWaterLevel(NaN), '--');
  assert.equal(formatWaterLevel(91, false), '--');
});
