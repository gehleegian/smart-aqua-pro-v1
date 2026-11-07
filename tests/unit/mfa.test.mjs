// Sprint 5: TOTP MFA gating and flows with a fake Firebase SDK (the Auth
// emulator cannot run TOTP). Real TOTP is verified after deploy: docs/access-model.md §MFA.
// Run: npm run test:mfa
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createMfaFlows,
  hasTotpFactor,
  isMfaFeatureEnabled,
  MfaFlowError,
  mfaRequirement,
  normalizeTotpCode,
} from '../../src/utils/mfa.ts';
import { createMockMfaSdk, MOCK_TOTP_CODE } from '../../src/utils/mfaMock.ts';

const TOTP = { uid: 'f1', factorId: 'totp', displayName: 'Phone' };

test('MFA-01 the feature flag is off unless exactly "true"', () => {
  assert.equal(isMfaFeatureEnabled(undefined), false);
  assert.equal(isMfaFeatureEnabled('1'), false);
  assert.equal(isMfaFeatureEnabled('true'), true);
});

test('MFA-02 required for platform admins, optional for owners and caretakers, nothing when off', () => {
  assert.equal(mfaRequirement({ enabled: false, platformRole: 'Admin', factors: [] }), 'disabled');
  assert.equal(mfaRequirement({ enabled: true, platformRole: 'Admin', factors: [] }), 'required_missing');
  assert.equal(mfaRequirement({ enabled: true, platformRole: 'Admin', factors: [{ uid: 'p', factorId: 'phone' }] }), 'required_missing', 'SMS does not count');
  assert.equal(mfaRequirement({ enabled: true, platformRole: 'Admin', factors: [TOTP] }), 'required_enrolled');
  assert.equal(mfaRequirement({ enabled: true, platformRole: 'User', factors: [] }), 'optional');
  assert.equal(hasTotpFactor([TOTP]), true);
});

test('MFA-03 codes: 6 digits, spaces and dashes allowed', () => {
  assert.equal(normalizeTotpCode('123 456'), '123456');
  assert.equal(normalizeTotpCode('123-456'), '123456');
  assert.equal(normalizeTotpCode('12345'), null);
  assert.equal(normalizeTotpCode('12345a'), null);
});

function fakeSdk() {
  const calls = [];
  const factors = [];
  const sdk = {
    getSession: async (user) => { calls.push(['session', user.uid]); return 'session-1'; },
    generateSecret: async (session) => {
      calls.push(['secret', session]);
      return { secretKey: 'SECRET', generateQrCodeUrl: (account, issuer) => `otpauth://totp/${issuer}:${account}?secret=SECRET` };
    },
    assertionForEnrollment: (secret, code) => ({ kind: 'enroll', secret: secret.secretKey, code }),
    enroll: async (user, assertion, displayName) => {
      calls.push(['enroll', assertion, displayName]);
      if (assertion.code !== '654321') throw Object.assign(new Error('bad'), { code: 'auth/invalid-verification-code' });
      factors.push({ uid: 'f1', factorId: 'totp', displayName });
    },
    assertionForSignIn: (enrollmentId, code) => ({ kind: 'signin', enrollmentId, code }),
    getResolver: (error) => error.resolver,
    enrolledFactors: () => [...factors],
    unenroll: async (_user, uid) => { factors.splice(factors.findIndex((factor) => factor.uid === uid), 1); },
  };
  return { sdk, calls };
}

test('MFA-04 enrollment: secret + otpauth URL for the QR, then the code enrolls a TOTP factor', async () => {
  const { sdk, calls } = fakeSdk();
  const flows = createMfaFlows(sdk);
  const user = { uid: 'admin-p' };
  const started = await flows.startEnrollment(user, 'admin@example.test');
  assert.equal(started.otpauthUrl, 'otpauth://totp/SmartAqua Pro:admin@example.test?secret=SECRET');
  await assert.rejects(flows.finishEnrollment(user, started.secret, '12'), (error) => error instanceof MfaFlowError && /6-digit/.test(error.message));
  assert.equal(calls.filter(([kind]) => kind === 'enroll').length, 0, 'a malformed code never reaches Firebase');
  await assert.rejects(flows.finishEnrollment(user, started.secret, '111111'), (error) => error instanceof MfaFlowError && error.code === 'auth/invalid-verification-code' && /not right/.test(error.message));
  const factors = await flows.finishEnrollment(user, started.secret, '654 321', '  My phone ');
  assert.deepEqual(factors, [{ uid: 'f1', factorId: 'totp', displayName: 'My phone' }]);
  assert.deepEqual(await flows.unenroll(user, 'f1'), []);
});

test('MFA-05 sign-in challenge: a TOTP hint is answered with the code; other errors pass through', async () => {
  const { sdk } = fakeSdk();
  const flows = createMfaFlows(sdk);
  const resolved = [];
  const resolver = { hints: [{ uid: 'phone-1', factorId: 'phone' }, { uid: 'totp-1', factorId: 'totp' }], resolveSignIn: async (assertion) => { resolved.push(assertion); return { user: { uid: 'admin-p' } }; } };
  const challenge = flows.startChallenge({ code: 'auth/multi-factor-auth-required', resolver });
  assert.equal(challenge.hint.uid, 'totp-1');
  const credential = await flows.resolveChallenge(challenge, '123 456');
  assert.equal(credential.user.uid, 'admin-p');
  assert.deepEqual(resolved, [{ kind: 'signin', enrollmentId: 'totp-1', code: '123456' }]);

  const wrongPassword = { code: 'auth/invalid-credential' };
  assert.throws(() => flows.startChallenge(wrongPassword), (error) => error === wrongPassword);
  assert.throws(() => flows.startChallenge({ code: 'auth/multi-factor-auth-required', resolver: { hints: [{ uid: 'p', factorId: 'phone' }] } }), /does not support/);
  const failing = { hints: [{ uid: 'totp-1', factorId: 'totp' }], resolveSignIn: async () => { throw Object.assign(new Error('x'), { code: 'auth/invalid-verification-code' }); } };
  await assert.rejects(flows.resolveChallenge({ resolver: failing, hint: failing.hints[0] }, '000000'), (error) => error instanceof MfaFlowError && error.code === 'auth/invalid-verification-code');
});

test('MFA-06 the emulator mock enrolls only with its fixed code and keeps factors per user', async () => {
  const store = new Map();
  const sdk = createMockMfaSdk({ getItem: (key) => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) });
  const flows = createMfaFlows(sdk);
  const admin = { uid: 'admin-p' };
  const started = await flows.startEnrollment(admin, 'admin@example.test');
  assert.match(started.otpauthUrl, /^otpauth:\/\/totp\/SmartAqua%20Pro:admin%40example\.test\?secret=/);
  await assert.rejects(flows.finishEnrollment(admin, started.secret, '000000'), MfaFlowError);
  const factors = await flows.finishEnrollment(admin, started.secret, MOCK_TOTP_CODE);
  assert.equal(mfaRequirement({ enabled: true, platformRole: 'Admin', factors }), 'required_enrolled');
  assert.deepEqual(sdk.enrolledFactors({ uid: 'someone-else' }), []);
});
