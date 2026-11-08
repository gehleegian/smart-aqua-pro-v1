import assert from 'node:assert/strict';
import test from 'node:test';
import { parseClaimUri, validateManualClaim } from '../../src/utils/claimUri.ts';
import { claimUri, generateClaimCode, generateDeviceId, isValidClaimCode } from '../../functions/src/shared/claimCode.ts';

test('the label URI round-trips through the app parser', () => {
  for (let index = 0; index < 50; index += 1) {
    const deviceId = generateDeviceId();
    const claimCode = generateClaimCode();
    assert.ok(isValidClaimCode(claimCode));
    assert.doesNotMatch(claimCode, /[01OIL]/, 'no ambiguous characters');
    assert.deepEqual(parseClaimUri(claimUri(deviceId, claimCode)), { deviceId, claimCode });
  }
});

test('the parser rejects anything that is not a SmartAqua claim', () => {
  for (const raw of ['https://example.com', 'smartaqua://claim?d=SAQ-AAAA-1111', 'smartaqua://claim?d=bad&c=ABCD2345', 'smartaqua://claim?d=SAQ-AAAA-1111&c=ABCD0001', 'smartaqua://pay?d=SAQ-AAAA-1111&c=ABCD2345']) {
    assert.equal(parseClaimUri(raw), null, raw);
  }
  assert.deepEqual(parseClaimUri(' SMARTAQUA://claim?d=saq-aaaa-1111&c=abcd2345 '), { deviceId: 'SAQ-AAAA-1111', claimCode: 'ABCD2345' });
});

test('manual entry normalises case, spaces and dashes', () => {
  assert.deepEqual(validateManualClaim(' saq-aaaa-1111 ', 'abcd-2345'), { deviceId: 'SAQ-AAAA-1111', claimCode: 'ABCD2345' });
  assert.equal(typeof validateManualClaim('SAQ-AAAA', 'ABCD2345'), 'string');
  assert.equal(typeof validateManualClaim('SAQ-AAAA-1111', 'ABC'), 'string');
});
