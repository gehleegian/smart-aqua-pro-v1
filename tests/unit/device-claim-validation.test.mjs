import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClaimInput } from '../../src/server/claimValidation.ts';
import { validateDeviceId } from '../../src/services/deviceClaimContracts.ts';

export const profile = { name: 'Aquarium 1', species: ['Goldfish'], tankType: 'Freshwater',
  tankLengthCm: 50, tankWidthCm: 25, tankHeightCm: 30, workingWaterVolumeLiters: 25,
  hasFiltrationSystem: true, fishCount: 2, fishWeightsG: [5, 6],
  minTemp: 20, maxTemp: 24, minPh: 6.5, maxPh: 7.5, minLevel: 70, minQuality: 80 };
const input = { deviceId: 'SAQ-AAAA-BBBB', profile };

test('accepts and normalizes an enclosure ID without a claim code', () => {
  const parsed = parseClaimInput({ ...input, deviceId: ' saq-aaaa-bbbb ' });
  assert.equal(parsed.deviceId, input.deviceId);
  assert.deepEqual(Object.keys(parsed).sort(), ['deviceId', 'profile']);
  assert.equal(validateDeviceId(input.deviceId), '');
});

test('rejects missing, malformed and path-like device IDs', () => {
  for (const deviceId of [undefined, null, 42, '', 'SAQ-1234', 'SAQ-AAAA-BBBB/child', '../admin', 'SAQ-AAAA-BBBB-extra']) {
    assert.throws(() => parseClaimInput({ ...input, deviceId }), error => error.status === 400);
  }
});

test('rejects unknown fields and client-supplied authority', () => {
  for (const field of ['ownerId', 'deviceUid', 'aquariumId', 'role', 'claimCode']) {
    assert.throws(() => parseClaimInput({ ...input, [field]: 'attacker' }));
    assert.throws(() => parseClaimInput({ ...input, profile: { ...profile, [field]: 'attacker' } }));
  }
});
test('validates every weight and rejects invalid numeric/threshold data', () => {
  for (const override of [{ fishWeightsG: [5, -1] }, { fishCount: 1001 }, { minTemp: Infinity },
    { minPh: 9, maxPh: 6 }, { name: ' ' }, { species: ['Other'] }, { minLevel: 101 },
    { tankHeightCm: 0 }, { tankWidthCm: '25' }]) {
    assert.throws(() => parseClaimInput({ ...input, profile: { ...profile, ...override } }));
  }
});
test('does not manufacture readings or equipment activity', () => {
  const parsed = parseClaimInput(input);
  for (const field of ['temp', 'level', 'quality', 'tdsPpm', 'ph', 'turbidity', 'light']) {
    assert.equal(field in parsed.profile, false);
  }
});
