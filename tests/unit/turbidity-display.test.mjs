import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from '../helpers/loadTsModule.mjs';
import { evaluateTelemetryValidity } from '../../src/utils/monitoringAssessmentCore.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';

const { getTurbidityDisplay } = await loadTsModule(new URL('../../src/utils/sensorDisplay.ts', import.meta.url));

test('Clear/Cloudy display without NTU with the requested subtitle', () => {
  for (const state of ['Clear', 'Cloudy']) {
    const validity = evaluateTelemetryValidity({ turbidityState: state });
    assert.deepEqual(getTurbidityDisplay(validity, true, state), {
      value: state, status: 'Live telemetry', isError: false,
    });
  }
});

test('category-only mode hides numeric NTU and invalid inputs cannot be masked', () => {
  for (const ntu of [0, 2.4, 25]) {
    const validity = evaluateTelemetryValidity({ turbidity: ntu, turbidityReadingValid: true });
    assert.deepEqual(getTurbidityDisplay(validity, true, 'Clear'), { value: 'Clear', status: 'Live telemetry', isError: false });
  }
  for (const ntu of [NaN, Infinity, -1, '2.4', undefined]) {
    const validity = evaluateTelemetryValidity({ turbidity: ntu });
    assert.equal(getTurbidityDisplay(validity, true, 'Cloudy').value, ntu === undefined ? 'Cloudy' : 'Sensor error');
  }
  const failed = evaluateTelemetryValidity({ turbidity: 25, turbidityReadingValid: false });
  assert.equal(getTurbidityDisplay(failed, true, 'Cloudy').value, 'Sensor error');
});

test('stale/offline readings do not retain a Clear/Cloudy or numeric live value', () => {
  const validity = evaluateTelemetryValidity({ turbidity: 2 });
  assert.deepEqual(getTurbidityDisplay(validity, false, 'Clear'), {
    value: '--', status: 'Waiting for telemetry', isError: false,
  });
  assert.equal(getTurbidityDisplay(validity, true, 'invalid').value, '--');
});

test('dashboard carries fresh categorical telemetry, not stored NTU values or stale categories', async () => {
  const { mergeDashboardAquariums, getStatsForTank } = await loadTsModule(new URL('../../src/utils/dashboardHelpers.ts', import.meta.url));
  const now = 1794000000000;
  const aquarium = { id: 'a', name: 'A', species: ['Goldfish'], temp: 24, level: 80, quality: 80, turbidity: 123,
    ownerId: 'o', ownerName: 'Owner', feeder: 'Inactive', light: 'Off', filter: 'Inactive' };
  const shadow = { telemetry: normalizeTelemetry({ temperatureC: 24, waterLevelPercent: 80,
    updatedAt: now, online: true, turbidityState: 'Clear' }), control: null, latestCommand: null };
  const [fresh] = mergeDashboardAquariums([aquarium], { a: shadow }, now);
  assert.equal(fresh.turbidityState, 'Clear');
  const stat = getStatsForTank(fresh).find(s => s.title === 'Turbidity');
  assert.equal(stat.value, 'Clear');
  assert.equal(stat.change, 'Live telemetry');
  const [stale] = mergeDashboardAquariums([aquarium], { a: shadow }, now + 60001);
  assert.equal(stale.turbidityState, undefined);
  assert.equal(getStatsForTank(stale).find(s => s.title === 'Turbidity').value, '--');
});
