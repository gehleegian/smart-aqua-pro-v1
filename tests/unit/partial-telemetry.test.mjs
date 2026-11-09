import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizeTelemetry } from '../../src/utils/deviceTelemetryParser.ts';
import { getDeviceTelemetryState, getFreshTelemetrySnapshot } from '../../src/types/device.ts';
import { evaluateAquariumReading } from '../../src/utils/conditionAssessment.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { mapTelemetry } from '../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts';
import { getFreshTelemetrySnapshot as mobileSnapshot } from '../../../smart-aqua-mobile/src/utils/device-telemetry.ts';

const now = 1794000000000;
// Contract fixtures only: never uploaded or substituted for physical readings.
const partial = {
  temperatureReadingValid: false, waterLevelPercent: 80, waterPresent: true,
  ph: 7.2, turbidityState: 'Clear', powerStatus: 'Online',
  filterState: 'Active', lightState: 'On', online: true, updatedAt: now,
};

test('a failed temperature pair leaves other sensor readings and connection live on web/mobile', () => {
  const web = normalizeTelemetry(partial);
  assert.deepEqual(web, mapTelemetry(partial));
  assert.equal(web.temperatureC, undefined);
  assert.equal(getDeviceTelemetryState(web, now), 'live');
  for (const snapshot of [getFreshTelemetrySnapshot(web, now), mobileSnapshot(mapTelemetry(partial), now)]) {
    assert.equal(snapshot.hasFreshTemperatureTelemetry, false);
    assert.equal(snapshot.validity.temperature.status, 'invalid');
    assert.ok(Number.isNaN(snapshot.temperatureC));
    assert.equal(snapshot.hasFreshPhTelemetry, true);
    assert.equal(snapshot.ph, 7.2);
    assert.equal(snapshot.turbidityState, 'Clear');
    assert.equal(snapshot.hasFreshPowerTelemetry, true);
    assert.equal(snapshot.hasFreshWaterLevelTelemetry, true);
    assert.equal(snapshot.filterState, 'Active');
  }
});

test('multiple sensor faults do not suppress power, pH, or connection freshness', () => {
  const raw = { ...partial, waterLevelPercent: undefined, waterPresent: undefined, waterLevelReadingValid: false };
  for (const snapshot of [getFreshTelemetrySnapshot(normalizeTelemetry(raw), now), mobileSnapshot(mapTelemetry(raw), now)]) {
    assert.equal(snapshot.hasFreshWaterLevelTelemetry, false);
    assert.equal(snapshot.hasFreshTemperatureTelemetry, false);
    assert.equal(snapshot.hasFreshPhTelemetry, true);
    assert.equal(snapshot.powerStatus, 'Online');
  }
  assert.equal(getFreshTelemetrySnapshot(normalizeTelemetry(raw), now + 60001), null);
});

test('missing or malformed temperature without an explicit failure remains rejected; recovery restores it', () => {
  for (const parse of [normalizeTelemetry, mapTelemetry]) {
    for (const temperatureC of [undefined, null, NaN, Infinity, '22']) {
      assert.equal(parse({ ...partial, temperatureC, temperatureReadingValid: undefined }), null);
      assert.equal(parse({ ...partial, temperatureC, temperatureReadingValid: true }), null);
    }
    const recovered = getFreshTelemetrySnapshot(parse({ ...partial, temperatureC: 23, temperatureReadingValid: true }), now);
    assert.equal(recovered.temperatureC, 23);
    assert.equal(recovered.hasFreshTemperatureTelemetry, true);
  }
});

test('failed temperature is a sensor fault, never a hot/cold water finding', () => {
  const result = evaluateAquariumReading({ species: ['Goldfish'], minTemp: 20, maxTemp: 24 }, partial, seedRuleConfig());
  assert.equal(result.perParameter.find(p => p.parameter === 'temperatureC').status, 'unavailable');
  assert.ok(result.matchedRules.filter(r => r.parameter === 'temperatureC').every(r => r.ruleId === 'sensor_fault'));
});

test('firmware publishes sensor health instead of withholding every snapshot', () => {
  const source = readFileSync(new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Telemetry withheld/);
  assert.match(source, /telemetry\["temperatureReadingValid"\] = temperaturesValid/);
  assert.match(source, /if \(temperaturesValid\) telemetry\["temperatureC"\]/);
  assert.match(source, /telemetry\["waterLevelReadingValid"\] = levelValid/);
  assert.match(source, /telemetry\["updatedAt"\]\["\.sv"\] = "timestamp"/);
});

test('live history preserves working readings while marking temperature as a sensor error', async () => {
  const { loadTsModule } = await import('../helpers/loadTsModule.mjs');
  const { buildLiveEntry } = await loadTsModule(new URL('../../src/utils/dataLogsHelpers.ts', import.meta.url));
  const entry = buildLiveEntry({ telemetry: normalizeTelemetry(partial) });
  assert.ok(Number.isNaN(entry.temperatureC));
  assert.equal(entry.temperatureReadingValid, false);
  assert.equal(entry.ph, 7.2);
});
