import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { assessAquariumCondition } from '../../src/utils/monitoringAssessment.ts';
import { getFreshTelemetrySnapshot, getDeviceTelemetryState, setDeviceTelemetryClockOffsetMs } from '../../src/types/device.ts';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { formatWaterLevel } from '../../src/utils/monitoringAssessmentCore.ts';
import ts from 'typescript';

// The mobile app lives in a sibling checkout (../smart-aqua-mobile). When it is
// not present, parity tests are skipped instead of failing at import time.
const mobileRoot = new URL('../../../smart-aqua-mobile/', import.meta.url);
const hasMobile = existsSync(new URL('src/utils/monitoringAssessmentCore.ts', mobileRoot));
const mobileSkip = hasMobile ? false : 'smart-aqua-mobile checkout not found at ../smart-aqua-mobile';
let assessTelemetry, getTelemetryDisplay, mapTelemetry;
if (hasMobile) {
  ({ assessTelemetry, getTelemetryDisplay } = await import(new URL('src/utils/monitoring-assessment.ts', mobileRoot).href));
  ({ mapTelemetry } = await import(new URL('src/utils/device-telemetry-parser.ts', mobileRoot).href));
}
const mobileTest = (name, fn) => test(name, { skip: mobileSkip }, fn);

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

const now = 1792627200000;

mobileTest('web and mobile rule sources are identical', () => {
  const web = readFileSync(new URL('../../src/utils/monitoringAssessmentCore.ts', import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../../../smart-aqua-mobile/src/utils/monitoringAssessmentCore.ts', import.meta.url), 'utf8');
  assert.equal(web.replaceAll('\r\n', '\n'), mobile.replaceAll('\r\n', '\n'));
});


function deviceFrom(patch = {}) {
  return {
    temperatureC: 22, waterLevelPercent: 90, tdsPpm: 220, tdsPercent: 90,
    temperatureReadingValid: true, tdsReadingValid: true, waterPresent: true,
    ph: 7, turbidity: 2, filterState: 'Active', equipmentStatus: 'Normal',
    powerStatus: 'Online', online: true, updatedAt: now, ...patch,
  };
}
function webFrom(device) {
  const snapshot = getFreshTelemetrySnapshot(device, now);
  return assessAquariumCondition({
    profile, source: snapshot ? 'live' : 'unavailable', assessedAt: now,
    telemetry: snapshot ? {
      temperatureC: snapshot.temperatureC, temperatureValid: snapshot.hasFreshTemperatureTelemetry,
      waterLevelPercent: snapshot.waterLevelPercent, waterLevelValid: true,
      tdsPpm: snapshot.tdsPpm, tdsPurityPercent: snapshot.tdsPercent, tdsValid: snapshot.hasFreshPurityTelemetry,
      ph: snapshot.ph, phValid: snapshot.hasFreshPhTelemetry,
      turbidity: snapshot.turbidity, turbidityValid: snapshot.hasFreshTurbidityTelemetry,
      filterState: snapshot.filterState, equipmentStatus: snapshot.equipmentStatus, powerStatus: snapshot.powerStatus,
    } : null,
  });
}
mobileTest('web and mobile adapters produce identical assessments', () => {
  for (const patch of [
    {}, { temperatureC: 25 }, { temperatureC: 26 }, { ph: 8 },
    { waterLevelPercent: 101 }, { waterLevelPercent: -1 }, { tdsPercent: 120 },
    { waterPresent: false, waterLevelPercent: 0 },
    { temperatureReadingValid: false }, { tdsReadingValid: false },
    { updatedAt: now - 30_000 }, { updatedAt: now - 30_001 },
    { online: false }, { updatedAt: undefined }, { updatedAt: NaN },
    { powerStatus: 'Power Interruption' }, { temperatureC: NaN }, { waterLevelPercent: undefined },
  ]) {
    const device = deviceFrom(patch);
    const web = webFrom(device);
    const mobile = assessTelemetry(profile, device, 'live', now);
    assert.deepEqual(mobile, web, JSON.stringify(patch));
  }
});

mobileTest('mobile explicit unavailable source suppresses retained stale readings', () => {
  const result = assessTelemetry(profile, deviceFrom({ temperatureC: 40 }), 'unavailable', now);
  assert.equal(result.overallSeverity, 'unavailable');
  assert.equal(result.recommendations.length, 0);
});

mobileTest('production Firebase parsers reject malformed numbers before assessment', () => {
  for (const value of [null, undefined, '', ' ', '22', false, true, [], {}, NaN, Infinity]) {
    for (const [field, parameter] of [['ph', 'ph'], ['turbidity', 'turbidity'], ['tdsPercent', 'tds']]) {
      const raw = deviceFrom({ [field]: value });
      const web = webFrom(normalizeTelemetry(raw));
      const mobile = assessTelemetry(profile, mapTelemetry(raw), 'live', now);
      assert.equal(web.parameters.find((p) => p.parameter === parameter).severity, 'unavailable');
      assert.equal(mobile.parameters.find((p) => p.parameter === parameter).severity, 'unavailable');
      assert.equal(web.recommendations.length, 0);
      assert.deepEqual(mobile, web);
    }
    for (const field of ['temperatureC', 'waterLevelPercent', 'updatedAt']) {
      const raw = deviceFrom({ [field]: value });
      const web = webFrom(normalizeTelemetry(raw));
      const mobile = assessTelemetry(profile, mapTelemetry(raw), 'live', now);
      assert.equal(web.overallSeverity, 'unavailable');
      assert.equal(web.recommendations.length, 0);
      assert.deepEqual(mobile, web);
    }
  }
});

mobileTest('real zero measurements remain valid numbers rather than missing values', () => {
  const raw = deviceFrom({ ph: 0, waterLevelPercent: 0, turbidity: 0, tdsPpm: 0 });
  assert.equal(normalizeTelemetry(raw).ph, 0);
  assert.equal(mapTelemetry(raw).waterLevelPercent, 0);
  assert.equal(webFrom(normalizeTelemetry(raw)).overallSeverity, 'critical');
  assert.deepEqual(assessTelemetry(profile, mapTelemetry(raw), 'live', now), webFrom(normalizeTelemetry(raw)));
});

mobileTest('production power parsing accepts the same aliases on web and mobile', () => {
  for (const [value, expected] of [
    ['power_interruption', 'Power Interruption'], [' POWER INTERRUPTION ', 'Power Interruption'],
    ['Power Interruption', 'Power Interruption'], ['online', 'Online'], [' OFFLINE ', 'Offline'],
    ['unknown', 'Unknown'], ['invalid', undefined], [null, undefined], [false, undefined],
  ]) {
    const raw = deviceFrom({ powerStatus: value });
    assert.equal(normalizeTelemetry(raw).powerStatus, expected);
    assert.equal(mapTelemetry(raw).powerStatus, expected);
    assert.deepEqual(assessTelemetry(profile, mapTelemetry(raw), 'live', now), webFrom(normalizeTelemetry(raw)));
  }
});

test('water-level display hides invalid and unavailable values while preserving zero', () => {
  for (const value of [-1, 101, 150, NaN, Infinity, null, undefined, '', '50', false]) {
    assert.equal(formatWaterLevel(value), '--');
  }
  assert.equal(formatWaterLevel(0), '0%');
  assert.equal(formatWaterLevel(100), '100%');
  assert.equal(formatWaterLevel(70.5), '70.5%');
  assert.equal(formatWaterLevel(70, false), '--');
  const result = webFrom(normalizeTelemetry(deviceFrom({ waterLevelPercent: 150 })));
  assert.equal(result.parameters.find((p) => p.parameter === 'waterLevel').severity, 'unavailable');
  assert.equal(result.recommendations.length, 0);
});

mobileTest('future timestamps are unavailable in both apps, including just beyond now', () => {
  for (const delta of [1, 1000, 86_400_000]) {
    const telemetry = deviceFrom({ updatedAt: now + delta });
    assert.equal(getDeviceTelemetryState(telemetry, now), 'unavailable');
    assert.equal(getFreshTelemetrySnapshot(telemetry, now), null);
    const mobile = assessTelemetry(profile, telemetry, 'live', now);
    assert.equal(mobile.source, 'unavailable');
    assert.equal(mobile.recommendations.length, 0);
    assert.deepEqual(mobile, webFrom(telemetry));
    assert.equal(getTelemetryDisplay(telemetry, null, now).telemetry, null);
  }
});

mobileTest('freshness respects exact stale boundary and server clock correction', () => {
  for (const [age, expected] of [[0, 'live'], [30_000, 'live'], [30_001, 'offline']]) {
    const telemetry = deviceFrom({ updatedAt: now - age });
    assert.equal(getDeviceTelemetryState(telemetry, now), expected);
    assert.equal(getTelemetryDisplay(telemetry, null, now).state, expected);
  }
  try {
    setDeviceTelemetryClockOffsetMs(60_000);
    assert.equal(getDeviceTelemetryState(deviceFrom({ updatedAt: now + 60_000 }), now), 'live');
    assert.equal(getDeviceTelemetryState(deviceFrom({ updatedAt: now + 60_001 }), now), 'unavailable');
  } finally {
    setDeviceTelemetryClockOffsetMs(0);
  }
});

mobileTest('mobile presentation distinguishes retained readings from current or invalid data', () => {
  const live = deviceFrom();
  const initial = getTelemetryDisplay(live, null, now);
  assert.equal(initial.isLastKnown, false);
  assert.equal(initial.source, 'live');
  const stale = getTelemetryDisplay(live, null, now + 30_001);
  assert.equal(stale.isLastKnown, true);
  assert.equal(stale.source, 'unavailable');
  assert.equal(stale.telemetry, live);
  assert.equal(getTelemetryDisplay(deviceFrom({ online: false }), null, now).isLastKnown, true);
  assert.equal(getTelemetryDisplay(undefined, null, now).telemetry, null);
  assert.equal(getTelemetryDisplay(deviceFrom({ updatedAt: NaN }), null, now).telemetry, null);
  const reconnected = getTelemetryDisplay(deviceFrom({ updatedAt: now + 31_000 }), null, now + 31_000);
  assert.equal(reconnected.source, 'live');
  assert.equal(reconnected.isLastKnown, false);
  assert.equal(getTelemetryDisplay(null, live, now + 90_000).source, 'simulated');
});

test('dashboard statistics contain no manufactured history and hide invalid temperatures', async () => {
  // Compile the actual module for Node; application bundlers resolve these
  // extensionless imports normally. No Firebase access or app initialization.
  const sourceUrl = new URL('../../src/utils/dashboardHelpers.ts', import.meta.url);
  const source = readFileSync(sourceUrl, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText.replace(/from ['"]([^'"]+)['"]/g, (_, specifier) => {
    const resolved = specifier.startsWith('.')
      ? new URL(specifier + '.ts', sourceUrl).href
      : import.meta.resolve(specifier);
    return 'from ' + JSON.stringify(resolved);
  });
  const { getStatsForTank } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
  const tank = {
    ...profile, status: 'healthy', hasFreshTelemetry: true, hasFreshTemperatureTelemetry: true,
    hasFreshPurityTelemetry: true, hasFreshPhTelemetry: true, hasFreshTurbidityTelemetry: true,
    hasFreshPowerTelemetry: true, telemetryState: 'live', assessment: webFrom(deviceFrom()),
  };
  for (const hasFreshTelemetry of [true, false]) {
    const stats = getStatsForTank({ ...tank, hasFreshTelemetry });
    assert.ok(stats.every((stat) => stat.sparkline.length === 0));
  }
  const stats = getStatsForTank({ ...tank, temp: 85, hasFreshTemperatureTelemetry: false });
  assert.equal(stats.find((stat) => stat.title === 'Temperature').value, '--');
});
