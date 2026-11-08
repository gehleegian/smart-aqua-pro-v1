// Sprint 5: the platform-admin MFA gate used by every callable. No emulator.
// Run: npm run test:mfa
import assert from 'node:assert/strict';
import test from 'node:test';
import { adminMfaSatisfied } from '../src/mfaPolicy.js';

test('MFA-SERVER-01 off by default: nobody is refused', () => {
  assert.equal(adminMfaSatisfied({ platformAdmin: true }, false), true);
});

test('MFA-SERVER-02 required: a platform admin needs a TOTP second factor in the token', () => {
  assert.equal(adminMfaSatisfied({ platformAdmin: true }, true), false);
  assert.equal(adminMfaSatisfied({ platformAdmin: true, firebase: { sign_in_second_factor: 'phone' } }, true), false);
  assert.equal(adminMfaSatisfied({ platformAdmin: true, firebase: { sign_in_second_factor: 'totp' } }, true), true);
});

test('MFA-SERVER-03 owners and caretakers are never forced (optional for them)', () => {
  assert.equal(adminMfaSatisfied({}, true), true);
  assert.equal(adminMfaSatisfied({ platformAdmin: false }, true), true);
  assert.equal(adminMfaSatisfied({ platformAdmin: 'true' }, true), true, 'only the boolean claim counts as admin');
});
