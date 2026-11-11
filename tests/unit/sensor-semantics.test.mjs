import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateAquarium, evaluateTelemetryValidity, resolveThresholds, toConditionAssessment } from '../../src/utils/monitoringAssessmentCore.ts';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const limits = resolveThresholds(null, { tdsPpm: { min: 100, max: 400 }, turbidity: { max: 5 } });
const item = (result, parameter) => result.perParameter.find(row => row.parameter === parameter);

test('positive TDS uses owner limits, not a meter-comparison validity range', () => {
  for (const [tdsPpm, expected] of [[76, 'warning'], [315, 'normal'], [500, 'warning']]) {
    const result = evaluateAquarium({ tdsPpm, tdsReadingValid: true }, limits, []);
    assert.equal(item(result, 'tdsPpm').status, expected);
    assert.deepEqual(result.faults, []);
  }
  for (const patch of [{ tdsPpm: 0 }, { tdsPpm: -1 }, { tdsPpm: NaN }, { tdsPpm: 500, tdsReadingValid: false }]) {
    assert.equal(evaluateTelemetryValidity(patch).tds.status, 'invalid');
  }
});

test('category-only turbidity is reported without inventing NTU or a numeric classification', () => {
  for (const turbidityState of ['Clear', 'Cloudy']) {
    const raw = { turbidityState };
    assert.equal(evaluateTelemetryValidity(raw).turbidity.status, 'valid');
    const result = evaluateAquarium(raw, limits, []);
    assert.deepEqual(result.faults, []);
    assert.equal(item(result, 'turbidity').value, turbidityState);
    assert.equal(item(result, 'turbidity').unit, undefined);
    assert.equal(item(result, 'turbidity').status, turbidityState === 'Clear' ? 'normal' : 'warning');
    assert.doesNotMatch(toConditionAssessment(result, { source: 'live', assessedAt: 0, origin: 'client' })
      .parameters.find(row => row.parameter === 'turbidity').message, /NTU/);
  }
  assert.equal(evaluateTelemetryValidity({ turbidityState: 'Unknown' }).turbidity.status, 'missing');
  for (const patch of [{ turbidityReadingValid: false }, { turbidity: -1 }, { turbidity: NaN }]) {
    assert.equal(evaluateTelemetryValidity({ turbidityState: 'Clear', ...patch }).turbidity.status, 'invalid');
  }
});

test('explicit category takes precedence; numeric-only telemetry retains configured numeric limits', () => {
  const result = evaluateAquarium({ turbidity: 7, turbidityState: 'Clear', turbidityReadingValid: true }, limits, []);
  assert.equal(item(result, 'turbidity').status, 'normal');
  assert.equal(item(result, 'turbidity').value, 'Clear');
  assert.equal(item(result, 'turbidity').unit, undefined);
  assert.equal(item(evaluateAquarium({ turbidity: 7 }, limits, []), 'turbidity').status, 'warning');
  assert.equal(item(evaluateAquarium({ turbidity: 7, turbidityState: 'Unknown' }, limits, []), 'turbidity').status, 'unavailable');
});

test('web and mobile retain numeric/category separation in fresh snapshots', async () => {
  const { getFreshTelemetrySnapshot: web } = await loadTsModule(new URL('../../src/types/device.ts', import.meta.url));
  const { getFreshTelemetrySnapshot: mobile } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/device-telemetry.ts', import.meta.url));
  const now = 1794000000000;
  const raw = { temperatureC: 25, waterLevelPercent: 100, turbidityState: 'Clear', updatedAt: now, online: true };
  for (const snapshot of [web(raw, now), mobile(raw, now)]) {
    assert.equal(snapshot.turbidity, null);
    assert.equal(snapshot.hasFreshTurbidityTelemetry, false);
    assert.equal(snapshot.turbidityState, 'Clear');
  }
});

test('normalization cannot hide malformed numeric turbidity behind a valid category', async () => {
  const { normalizeTelemetry } = await loadTsModule(new URL('../../src/utils/deviceTelemetryParser.ts', import.meta.url));
  const { mapTelemetry } = await loadTsModule(new URL('../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts', import.meta.url));
  for (const parser of [normalizeTelemetry, mapTelemetry]) {
    for (const turbidity of [NaN, Infinity, '3', {}, false]) {
      const raw = parser({ temperatureC: 25, waterLevelPercent: 100, turbidityState: 'Clear',
        turbidity, turbidityReadingValid: true, updatedAt: 1794000000000 });
      assert.equal(evaluateTelemetryValidity(raw).turbidity.status, 'invalid');
    }
  }
});
