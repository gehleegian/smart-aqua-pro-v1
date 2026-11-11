import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { evaluateAquarium, evaluateTelemetryValidity, formatTurbidityVoltage, readTurbidityVoltage, resolveThresholds } from '../../src/utils/monitoringAssessmentCore.ts';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const { normalizeTelemetry } = await loadTsModule(new URL('../../src/utils/deviceTelemetryParser.ts', import.meta.url));
const { mapTelemetry } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts', import.meta.url));
const { getFreshTelemetrySnapshot } = await loadTsModule(new URL('../../src/types/device.ts', import.meta.url));
const { getFreshTelemetrySnapshot: mobileSnapshot } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/device-telemetry.ts', import.meta.url));
const { getTurbidityDisplay } = await loadTsModule(new URL('../../src/utils/sensorDisplay.ts', import.meta.url));
const { sensorValues } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/sensor-presentation.ts', import.meta.url));
const now = 1794000000000;
const raw = patch => ({ temperatureC: 25, waterLevelPercent: 100, turbidityState: 'Clear',
  turbidityVoltage: 0.967, online: true, updatedAt: now, ...patch });

test('voltage is a bounded optional electrical diagnostic, including zero, never NTU', () => {
  for (const value of [0, 0.967, 3.3]) assert.equal(readTurbidityVoltage(value), value);
  assert.equal(formatTurbidityVoltage(0.967), '0.967 V (ADC)');
  for (const value of [undefined, null, '1', false, NaN, Infinity, -0.01, 3.31, {}, []]) {
    assert.equal(readTurbidityVoltage(value), undefined);
    assert.equal(formatTurbidityVoltage(value), null);
    for (const parser of [normalizeTelemetry, mapTelemetry]) {
      assert.equal(parser(raw({ turbidityVoltage: value })).turbidityVoltage, undefined);
    }
  }
  for (const parser of [normalizeTelemetry, mapTelemetry]) {
    const parsed = parser(raw());
    assert.equal(parsed.turbidityVoltage, 0.967);
    assert.equal(parsed.turbidity, undefined);
    assert.deepEqual(evaluateTelemetryValidity(parsed), evaluateTelemetryValidity(parser(raw({ turbidityVoltage: undefined }))));
  }
});

test('both clients retain legacy voltage compatibility but show categories only', () => {
  for (const turbidityState of ['Clear', 'Cloudy', 'Unknown']) {
    const parsed = normalizeTelemetry(raw({ turbidityState }));
    for (const snapshot of [getFreshTelemetrySnapshot(parsed, now), mobileSnapshot(mapTelemetry(raw({ turbidityState })), now)]) {
      assert.equal(snapshot.turbidityVoltage, 0.967);
      assert.equal(snapshot.turbidityState, turbidityState);
      assert.equal(snapshot.hasFreshTurbidityTelemetry, false);
      assert.equal(snapshot.turbidity, null);
    }
    const display = getTurbidityDisplay(evaluateTelemetryValidity(parsed), true, turbidityState);
    assert.equal(display.value, turbidityState);
    assert.equal(display.status, turbidityState === 'Unknown' ? 'Turbidity classification unavailable' : 'Live telemetry');
    assert.doesNotMatch(display.status, /NTU|V \(ADC\)/);
    const mobile = sensorValues({}, parsed);
    assert.equal(mobile.turbidity, turbidityState);
    assert.equal(mobile.turbidityDetail, display.status);
  }
  assert.equal(getFreshTelemetrySnapshot(normalizeTelemetry(raw()), now + 60001), null);
  assert.equal(mobileSnapshot(mapTelemetry(raw()), now + 60001), null);
  assert.deepEqual(getTurbidityDisplay(evaluateTelemetryValidity(raw()), false, 'Clear'),
    { value: '--', status: 'Waiting for telemetry', isError: false });
});

test('voltage does not generate recommendations, convert to NTU, or mask an explicit sensor fault', () => {
  const thresholds = resolveThresholds(null, { turbidity: { max: 5 } });
  const base = raw({ turbidityReadingValid: false });
  const result = evaluateAquarium(base, thresholds, []);
  assert.equal(result.perParameter.find(row => row.parameter === 'turbidity').status, 'unavailable');
  const display = getTurbidityDisplay(evaluateTelemetryValidity(base), true, 'Clear');
  assert.equal(display.value, 'Sensor error');
  assert.match(display.status, /turbidityReadingValid is false/);
  assert.doesNotMatch(display.status, /V \(ADC\)/);
  for (const turbidityVoltage of [0, 0.967, 3.3]) {
    assert.deepEqual(evaluateAquarium(raw({ turbidityVoltage }), thresholds, []),
      evaluateAquarium(raw({ turbidityVoltage: undefined }), thresholds, []));
  }
});

test('dashboard consumes only current reported voltage, never stored profile values', async () => {
  const { mergeDashboardAquariums, getStatsForTank } = await loadTsModule(new URL('../../src/utils/dashboardHelpers.ts', import.meta.url));
  const aquarium = { id: 'a', name: 'A', species: ['Goldfish'], temp: 25, level: 100, quality: 80,
    ownerId: 'o', ownerName: 'Owner', feeder: 'Inactive', light: 'Off', filter: 'Inactive', turbidityVoltage: 2.5 };
  const shadow = telemetry => ({ a: { telemetry, control: null, latestCommand: null } });
  const [fresh] = mergeDashboardAquariums([aquarium], shadow(normalizeTelemetry(raw())), now);
  assert.equal(getStatsForTank(fresh).find(stat => stat.title === 'Turbidity').change, 'Live telemetry');
  const [legacy] = mergeDashboardAquariums([aquarium], shadow(normalizeTelemetry(raw({ turbidityVoltage: undefined }))), now);
  assert.equal(legacy.turbidityVoltage, undefined);
  const [stale] = mergeDashboardAquariums([aquarium], shadow(normalizeTelemetry(raw())), now + 60001);
  assert.equal(stale.turbidityVoltage, undefined);
});

test('actual and repository Aquarium 1 restore the earlier category-only upload; Aquarium 2 is unchanged', () => {
  for (const path of ['../../firmware/Aquarium1Device/Aquarium1Device.ino', '../../../Aquarium1Device/Aquarium1Device.ino']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /telemetry\["turbidityVoltage"\]/);
    assert.match(source, /telemetry\["turbidityState"\]/);
    assert.match(source, /turbV >= 0\.15f && turbV < 3\.0f/);
  }
  assert.doesNotMatch(readFileSync(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8'), /turbidityVoltage/);
});
