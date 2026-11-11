import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  buildAquariumCreatePayload,
  buildAquariumUpdatePayload,
  CANONICAL_AQUARIUM_TYPE,
  CANONICAL_FISH_SPECIES,
  createEmptyAquariumForm,
  getFormBioloadCalculation,
  buildSpeciesThresholdPreset,
  populateAquariumForm,
  validateAquariumForm,
} from '../../src/utils/aquariumManagementHelpers.ts';
import {
  calculateAquariumBioload,
  formatBiomass,
  formatEstimatedBioload,
  parseFishWeights,
  readFishWeights,
  resizeFishWeights,
} from '../../src/utils/aquariumProfileCalculations.ts';

function completeForm(overrides = {}) {
  return {
    ...createEmptyAquariumForm(),
    name: 'Living Room Aquarium',
    tankLengthCm: '60',
    tankWidthCm: '30',
    tankHeightCm: '35',
    workingWaterVolumeLiters: '50',
    hasFiltrationSystem: 'yes',
    fishCount: '2',
    fishWeightsG: ['120', '180'],
    minTemp: '20',
    maxTemp: '25',
    minPh: '6.5',
    maxPh: '7.5',
    minLevel: '70',
    minQuality: '80',
    minTdsPpm: '100',
    maxTdsPpm: '300',
    ...overrides,
  };
}

test('profile limits come only from the stored species config (no hard-coded preset)', () => {
  const blank = createEmptyAquariumForm();
  assert.equal(blank.tankType, CANONICAL_AQUARIUM_TYPE);
  assert.equal(blank.species, CANONICAL_FISH_SPECIES);
  for (const field of ['minTemp', 'maxTemp', 'minPh', 'maxPh', 'minLevel', 'minQuality', 'minTdsPpm', 'maxTdsPpm']) {
    assert.equal(blank[field], '', `${field} has no built-in default`);
  }
  assert.equal(blank.hasFiltrationSystem, '');
  assert.deepEqual(blank.fishWeightsG, []);

  const species = {
    ranges: { temperatureC: { min: 19, max: 23 }, ph: { min: 6.6, max: 7.4 } },
    minWaterLevelPercent: 72,
  };
  const form = createEmptyAquariumForm(species);
  assert.deepEqual(
    [form.minTemp, form.maxTemp, form.minPh, form.maxPh, form.minLevel],
    ['19', '23', '6.6', '7.4', '72']
  );
  assert.deepEqual(buildSpeciesThresholdPreset({ ranges: {} }), { minTemp: '', maxTemp: '', minPh: '', maxPh: '', minLevel: '', minTdsPpm: '', maxTdsPpm: '' });
});

test('complete canonical profile validates and builds a persistent create payload', () => {
  const form = completeForm();
  assert.equal(validateAquariumForm(form), '');

  const payload = buildAquariumCreatePayload({
    formData: form,
    ownerId: 'owner-a',
    ownerName: 'Owner A',
  });

  assert.equal(payload.tankType, 'Freshwater');
  assert.deepEqual(payload.species, ['Goldfish']);
  assert.equal(payload.tankLengthCm, 60);
  assert.equal(payload.tankWidthCm, 30);
  assert.equal(payload.tankHeightCm, 35);
  assert.equal(payload.workingWaterVolumeLiters, 50);
  assert.equal(payload.hasFiltrationSystem, true);
  assert.equal(payload.minPh, 6.5);
  assert.equal(payload.maxPh, 7.5);
  assert.equal(payload.fishCount, 2);
  assert.deepEqual(payload.fishWeightsG, [120, 180]);
  assert.equal(Object.hasOwn(payload, 'bioload'), false);
  assert.equal(Object.hasOwn(payload, 'estimatedBioloadGL'), false);
});

test('fish quantity must be a positive whole number with one positive weight per fish', () => {
  assert.match(validateAquariumForm(completeForm({ fishCount: '2.5' })), /whole number/);
  assert.match(validateAquariumForm(completeForm({ fishCount: '-1' })), /whole number/);
  assert.match(validateAquariumForm(completeForm({ fishCount: '0', fishWeightsG: [] })), /greater than zero/);
  assert.match(validateAquariumForm(completeForm({ fishWeightsG: ['120'] })), /one valid weight/);
  assert.match(validateAquariumForm(completeForm({ fishWeightsG: ['120', '0'] })), /one valid weight/);
  assert.match(validateAquariumForm(completeForm({ fishWeightsG: ['120', '-1'] })), /one valid weight/);
  assert.match(validateAquariumForm(completeForm({ fishWeightsG: ['120', 'fish'] })), /one valid weight/);
});

test('structural profile fields reject missing or non-positive values', () => {
  assert.match(validateAquariumForm(completeForm({ tankLengthCm: '0' })), /greater than zero/);
  assert.match(validateAquariumForm(completeForm({ workingWaterVolumeLiters: '-1' })), /greater than zero/);
});

test('pH thresholds require a valid ordered range between 0 and 14', () => {
  assert.match(validateAquariumForm(completeForm({ minPh: '-1' })), /between 0 and 14/);
  assert.match(validateAquariumForm(completeForm({ maxPh: '15' })), /between 0 and 14/);
  assert.match(
    validateAquariumForm(completeForm({ minPh: '8', maxPh: '7' })),
    /cannot exceed/
  );
});

test('filtration-system presence is required and persists an explicit No choice', () => {
  assert.match(
    validateAquariumForm(completeForm({ hasFiltrationSystem: '' })),
    /filtration system is installed/
  );
  const payload = buildAquariumCreatePayload({
    formData: completeForm({ hasFiltrationSystem: 'no' }),
    ownerId: 'owner-a',
    ownerName: 'Owner A',
  });
  assert.equal(payload.hasFiltrationSystem, false);
});

test('legacy records remain readable without fabricated profile values', () => {
  const legacyAquarium = {
    id: 'legacy-aquarium',
    name: 'Legacy Aquarium',
    species: ['Goldfish'],
    bioload: 'medium',
    temp: 21,
    level: 90,
    quality: 85,
    feeder: 'Active',
    light: 'On',
    filter: 'Active',
    minTemp: 20,
    maxTemp: 25,
    minLevel: 70,
    minQuality: 80,
    ownerId: 'owner-a',
    ownerName: 'Owner A',
  };

  const form = populateAquariumForm(legacyAquarium);
  assert.equal(form.tankLengthCm, '');
  assert.equal(form.workingWaterVolumeLiters, '');
  assert.equal(form.fishCount, '');
  assert.equal(form.hasFiltrationSystem, '');
  assert.deepEqual(form.fishWeightsG, []);
  assert.equal(getFormBioloadCalculation(form), null);
});

test('legacy filtration descriptions are read as installed without exposing technical details', () => {
  const form = populateAquariumForm({
    id: 'legacy-filter',
    name: 'Legacy Filter Aquarium',
    species: ['Goldfish'],
    filtrationSetup: 'Internal filter',
    feeder: 'Inactive',
    light: 'Off',
    filter: 'Inactive',
    ownerId: 'owner-a',
    ownerName: 'Owner A',
  });
  assert.equal(form.hasFiltrationSystem, 'yes');
});

test('profile update persists quantity and structure but never accepts client-derived bioload', () => {
  const payload = buildAquariumUpdatePayload(completeForm({ fishCount: '4', fishWeightsG: ['100', '110', '120', '130'] }));
  assert.equal(payload.fishCount, 4);
  assert.deepEqual(payload.fishWeightsG, [100, 110, 120, 130]);
  assert.equal(payload.workingWaterVolumeLiters, 50);
  assert.equal(payload.hasFiltrationSystem, true);
  assert.equal(payload.minPh, 6.5);
  assert.equal(payload.maxPh, 7.5);
  assert.equal(Object.hasOwn(payload, 'bioload'), false);
  assert.equal(Object.hasOwn(payload, 'totalFishBiomassG'), false);
  assert.equal(Object.hasOwn(payload, 'estimatedBioloadGL'), false);
});

test('biomass is the sum of individual Goldfish weights', () => {
  assert.deepEqual(calculateAquariumBioload([120, 180], 50), {
    totalFishBiomassG: 300,
    estimatedBioloadGL: 6,
  });
});

test('one Goldfish produces a valid biomass and bioload result', () => {
  assert.deepEqual(calculateAquariumBioload([65], 60), {
    totalFishBiomassG: 65,
    estimatedBioloadGL: 65 / 60,
  });
});

test('legacy filtration metadata does not affect estimated bioload', () => {
  const formA = completeForm({ hasFiltrationSystem: 'yes' });
  const formB = completeForm({ hasFiltrationSystem: 'no' });
  assert.deepEqual(getFormBioloadCalculation(formA), getFormBioloadCalculation(formB));
  assert.deepEqual(getFormBioloadCalculation(formA), {
    totalFishBiomassG: 300,
    estimatedBioloadGL: 6,
  });
});

test('filtration status is not an input to the bioload calculation', () => {
  const running = { filter: 'Active', result: calculateAquariumBioload([120, 180], 50) };
  const stopped = { filter: 'Inactive', result: calculateAquariumBioload([120, 180], 50) };
  assert.notEqual(running.filter, stopped.filter);
  assert.deepEqual(running.result, stopped.result);
});

test('editing one fish weight immediately changes biomass and estimated bioload', () => {
  const before = getFormBioloadCalculation(completeForm());
  const after = getFormBioloadCalculation(
    completeForm({ fishWeightsG: ['150', '180'] })
  );
  assert.equal(before?.totalFishBiomassG, 300);
  assert.equal(after?.totalFishBiomassG, 330);
  assert.equal(after?.estimatedBioloadGL, 6.6);
});

test('changing operational volume recalculates estimated bioload but not biomass', () => {
  const before = getFormBioloadCalculation(completeForm());
  const after = getFormBioloadCalculation(
    completeForm({ workingWaterVolumeLiters: '100' })
  );
  assert.equal(before?.totalFishBiomassG, after?.totalFishBiomassG);
  assert.equal(before?.estimatedBioloadGL, 6);
  assert.equal(after?.estimatedBioloadGL, 3);
});

test('persisted source values can be reloaded and deterministically recalculated', () => {
  const weights = readFishWeights([120, 180], 2);
  assert.deepEqual(weights, [120, 180]);
  assert.deepEqual(calculateAquariumBioload(weights ?? [], 50), {
    totalFishBiomassG: 300,
    estimatedBioloadGL: 6,
  });
});

test('decimal weights and decimal results are preserved without category thresholds', () => {
  const calculation = calculateAquariumBioload([12.5, 7.75], 8);
  assert.deepEqual(calculation, {
    totalFishBiomassG: 20.25,
    estimatedBioloadGL: 2.53125,
  });
  assert.equal(formatBiomass(calculation?.totalFishBiomassG), '20.25 g');
  assert.equal(formatEstimatedBioload(calculation?.estimatedBioloadGL), '2.53 g/L');
});

test('invalid or incomplete source values produce a safe not-configured result', () => {
  assert.equal(calculateAquariumBioload([], 50), null);
  assert.equal(calculateAquariumBioload([100], 0), null);
  assert.equal(calculateAquariumBioload([100, -1], 50), null);
  assert.equal(parseFishWeights(['100', ''], 2), null);
  assert.equal(readFishWeights([100], 2), undefined);
  assert.equal(formatBiomass(undefined), 'Not Configured');
  assert.equal(formatEstimatedBioload(undefined), 'Not Configured');
});

test('zero, negative, malformed, and infinite operational volumes are rejected', () => {
  for (const workingWaterVolumeLiters of ['0', '-1', 'water', 'Infinity']) {
    assert.match(
      validateAquariumForm(completeForm({ workingWaterVolumeLiters })),
      /greater than zero/
    );
  }
});

test('different selected aquarium profiles keep independent bioload values', () => {
  const aquariumA = calculateAquariumBioload([65, 72, 68], 60);
  const aquariumB = calculateAquariumBioload([40, 45], 50);
  assert.equal(aquariumA?.estimatedBioloadGL, 205 / 60);
  assert.equal(aquariumB?.estimatedBioloadGL, 1.7);
  assert.notEqual(aquariumA?.estimatedBioloadGL, aquariumB?.estimatedBioloadGL);
});

test('Monitoring labels bioload as profile-derived and RTDB device code does not provide it', () => {
  const monitoringView = readFileSync(
    'src/components/monitoring/AquariumDetailsView.tsx',
    'utf8'
  );
  const deviceService = readFileSync('src/services/deviceService.ts', 'utf8');
  const databaseRules = readFileSync('database.rules.json', 'utf8');

  assert.match(monitoringView, /estimatedBioloadGL/);
  assert.match(monitoringView, /Profile derived/);
  assert.doesNotMatch(deviceService, /estimatedBioloadGL/);
  assert.doesNotMatch(databaseRules, /estimatedBioloadGL/);
});

test('fish weight fields resize predictably when quantity changes', () => {
  assert.deepEqual(resizeFishWeights(['100', '120'], 4), ['100', '120', '', '']);
  assert.deepEqual(resizeFishWeights(['100', '120', '140'], 2), ['100', '120']);
  assert.deepEqual(resizeFishWeights(['100'], 0), []);
});
