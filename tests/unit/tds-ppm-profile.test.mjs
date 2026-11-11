// Offline configuration/assessment fixtures only; never write live telemetry.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildAquariumUpdatePayload, createEmptyAquariumForm, populateAquariumForm,
  validateAquariumForm, buildSpeciesThresholdPreset } from '../../src/utils/aquariumManagementHelpers.ts';
import { readAquariumOverrides } from '../../src/utils/monitoringAssessmentCore.ts';
import { evaluateAquariumReading, getEffectiveThresholds } from '../../src/utils/conditionAssessment.ts';
import { parseClaimInput } from '../../src/server/claimValidation.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';
import { assessAquarium as mobileAssess } from '../../../smart-aqua-mobile/src/utils/condition-assessment.ts';

const profile = { name: 'Tank', species: ['Goldfish'], tankType: 'Freshwater',
  tankLengthCm: 50, tankWidthCm: 30, tankHeightCm: 25, workingWaterVolumeLiters: 20,
  hasFiltrationSystem: true, fishCount: 1, fishWeightsG: [20],
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70,
  minTdsPpm: 150, maxTdsPpm: 250 };
const form = () => ({ ...createEmptyAquariumForm(), ...Object.fromEntries(Object.entries(profile)
  .map(([key, value]) => [key, key === 'hasFiltrationSystem' ? 'yes' : key === 'fishWeightsG' ? ['20'] : String(value)])),
  minQuality: '69' });
const config = seedRuleConfig({ approved: true });
const now = 1794000000000;
const reading = tdsPpm => ({ temperatureC: 22, temperatureReadingValid: true, ph: 7, phReadingValid: true,
  waterLevelPercent: 90, waterLevelReadingValid: true, waterPresent: true, tdsPpm, tdsReadingValid: true,
  updatedAt: now, online: true });
const tdsResult = (tank, ppm, rules = config) => evaluateAquariumReading(tank, reading(ppm), rules)
  .perParameter.find(item => item.parameter === 'tdsPpm');

test('ppm form values persist and round-trip without converting legacy 69 percent', () => {
  const fields = form();
  assert.equal(validateAquariumForm(fields), '');
  const saved = buildAquariumUpdatePayload(fields);
  assert.equal(saved.minTdsPpm, 150);
  assert.equal(saved.maxTdsPpm, 250);
  assert.equal(saved.minQuality, 69);
  assert.equal(populateAquariumForm(saved).minTdsPpm, '150');
  assert.equal(populateAquariumForm(saved).maxTdsPpm, '250');
  const legacy = populateAquariumForm({ ...profile, minTdsPpm: undefined, maxTdsPpm: undefined, minQuality: 69 });
  assert.equal(legacy.minTdsPpm, '');
  assert.equal(legacy.maxTdsPpm, '');
  assert.equal(Object.hasOwn(buildAquariumUpdatePayload({ ...fields, minQuality: '' }), 'minQuality'), false);
  const defaults = buildSpeciesThresholdPreset({ ranges: { tdsPpm: { min: 123, max: 287 } } });
  assert.equal(defaults.minTdsPpm, '123');
  assert.equal(defaults.maxTdsPpm, '287');
});

test('ppm form and server claim validation reject incomplete, non-finite and unordered limits', () => {
  for (const [min, max] of [[-1, 250], [250, 150], [150, 150], [NaN, 250], [150, Infinity]]) {
    assert.notEqual(validateAquariumForm({ ...form(), minTdsPpm: String(min), maxTdsPpm: String(max) }), '');
    assert.throws(() => parseClaimInput({ deviceId: 'SAQ-AAAA-BBBB', profile: { ...profile, minTdsPpm: min, maxTdsPpm: max } }));
  }
  for (const [minTdsPpm, maxTdsPpm] of [['', '250'], ['150', ''], ['', '']])
    assert.notEqual(validateAquariumForm({ ...form(), minTdsPpm, maxTdsPpm }), '');
  assert.deepEqual(parseClaimInput({ deviceId: 'SAQ-AAAA-BBBB', profile }).profile, profile);
  const partial = { ...profile };
  delete partial.maxTdsPpm;
  assert.throws(() => parseClaimInput({ deviceId: 'SAQ-AAAA-BBBB', profile: partial }));
});

test('approved assessments use custom ppm limits for real low/normal/high changes in web and mobile', () => {
  for (const [ppm, normal] of [[120, false], [200, true], [280, false]]) {
    const result = tdsResult(profile, ppm);
    assert.deepEqual(getEffectiveThresholds(profile, config).values.tdsPpm, { min: 150, max: 250 });
    assert.equal(result.status === 'normal', normal);
    const mobile = mobileAssess({ aquarium: profile, reading: reading(ppm), source: 'live', now, ruleConfig: config });
    const mobileTds = mobile.parameters.find(item => item.parameter === 'tds');
    assert.equal(mobileTds.severity === 'normal', normal);
  }
  assert.deepEqual(readAquariumOverrides({ ...profile, thresholdOverrides: { tdsPpm: { min: 180, max: 240 } } }).tdsPpm,
    { min: 180, max: 240 });
  assert.deepEqual(readAquariumOverrides({ ...profile, thresholdOverrides: { ph: { min: 6, max: 8 } } }).tdsPpm,
    { min: 150, max: 250 });
});

test('custom ppm settings do not mistake calibration-check bounds for sensor faults', () => {
  assert.equal(tdsResult(profile, 200, seedRuleConfig()).status, 'normal');
  assert.equal(tdsResult({ ...profile, minTdsPpm: 0, maxTdsPpm: 1000 }, 76).status, 'normal');
  const withoutPpm = { ...profile, minTdsPpm: undefined, maxTdsPpm: undefined, minQuality: 69 };
  assert.deepEqual(getEffectiveThresholds(withoutPpm, config).values.tdsPpm, config.speciesById.goldfish.ranges.tdsPpm);
});

test('web/server/mobile retain identical shared threshold logic and backend consumes the same ppm override', () => {
  const web = readFileSync(new URL('../../src/utils/monitoringAssessmentCore.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  for (const path of ['../../functions/src/shared/monitoringAssessmentCore.ts', '../../../smart-aqua-mobile/src/utils/monitoringAssessmentCore.ts'])
    assert.equal(readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll('\r\n', '\n'), web);
  const server = readFileSync(new URL('../../functions/src/telemetryIngest.ts', import.meta.url), 'utf8');
  assert.match(server, /resolveLiveAquariumThresholds\(aquarium, configuredSpecies\)/);
  assert.match(server, /assessmentConfigurationKey\(thresholds, config.rules\)/);
});
