import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { mapTelemetry } from '../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts';
import { formatWaterLevel } from '../../src/utils/monitoringAssessmentCore.ts';

test('freshness uses receive time rather than an earlier UI tick', () => {
  const receivedAt = Date.now();
  const telemetry = normalizeTelemetry({ temperatureC: 26, waterLevelPercent: 91.63751,
    updatedAt: receivedAt - 100, online: true, turbidityState: 'Cloudy' });
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt - 2000), null);
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt)?.turbidityState, 'Cloudy');
  assert.equal(getFreshTelemetrySnapshot(telemetry, receivedAt + 31000), null);
  for (const name of ['useMonitoringController', 'useDashboardController']) {
    const source = readFileSync(new URL(`../../src/hooks/${name}.ts`, import.meta.url), 'utf8');
    assert.match(source, /\(shadow\) => \{[\s\S]*?setTelemetryNow\(Date.now\(\)\);\s*setDeviceShadows/);
  }
  const mobileHook = readFileSync(new URL('../../../smart-aqua-mobile/src/hooks/use-mobile-data.ts', import.meta.url), 'utf8');
  assert.match(mobileHook, /\(value\) => \{\s*setTelemetryReceivedAt\(Date.now\(\)\);\s*setTelemetry/);
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
  const stale = { temperatureC: 26, waterLevelPercent: 90, updatedAt: Date.now() - 31000, online: true, turbidityState: 'Clear' };
  assert.equal(getFreshTelemetrySnapshot(normalizeTelemetry(stale)), null);
});

test('water level displays at most one decimal without changing stored readings', () => {
  assert.equal(formatWaterLevel(91.63751), '91.6%');
  assert.equal(formatWaterLevel(100), '100%');
  assert.equal(formatWaterLevel(0), '0%');
  assert.equal(formatWaterLevel(NaN), '--');
  assert.equal(formatWaterLevel(91, false), '--');
});
