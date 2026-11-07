// Sprint 5: TOTP multi-factor authentication (authenticator app), no SMS.
// Pure logic only (no Firebase imports) so the gating and the flows are unit
// tested with mocks (tests/unit/mfa.test.mjs). The Firebase SDK calls are
// injected by src/services/mfaService.ts.
//
// Policy (docs/access-model.md, MFA section):
//   - platform admins: REQUIRED once the feature is on;
//   - owners and caretakers: optional.
// The feature flag NEXT_PUBLIC_MFA_TOTP_ENABLED stays off until Identity
// Platform is enabled with TOTP on the live project (docs/migration-live.md §8):
// the Auth emulator cannot run TOTP, so nothing here can be exercised there.

export const TOTP_FACTOR_ID = 'totp';
export const TOTP_ISSUER = 'SmartAqua Pro';

export type EnrolledFactor = { uid: string; factorId: string; displayName?: string | null; enrollmentTime?: string };

export type MfaRequirement =
  /** Feature flag off: nothing is shown or enforced. */
  | 'disabled'
  /** Platform admin without a TOTP factor: must enroll before using the app. */
  | 'required_missing'
  /** Platform admin with a TOTP factor. */
  | 'required_enrolled'
  /** Owner / caretaker: may enroll in Settings. */
  | 'optional';

export function isMfaFeatureEnabled(flag: string | undefined) {
  return flag === 'true';
}

export function hasTotpFactor(factors: readonly EnrolledFactor[]) {
  return factors.some((factor) => factor.factorId === TOTP_FACTOR_ID);
}

export function mfaRequirement(input: { enabled: boolean; platformRole: 'Admin' | 'User' | string | undefined; factors: readonly EnrolledFactor[] }): MfaRequirement {
  if (!input.enabled) return 'disabled';
  if (input.platformRole === 'Admin') return hasTotpFactor(input.factors) ? 'required_enrolled' : 'required_missing';
  return 'optional';
}

/** Accepts "123 456" or "123-456"; returns the 6 digits, or null. */
export function normalizeTotpCode(input: string) {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{6}$/.test(digits) ? digits : null;
}

export function mfaErrorMessage(code: string) {
  switch (code) {
    case 'auth/invalid-verification-code':
    case 'auth/invalid-totp-code':
      return 'That code is not right. Check the time on your phone and enter the current 6-digit code.';
    case 'auth/requires-recent-login':
      return 'For your security, sign out, sign in again, and then set up two-step verification.';
    case 'auth/totp-challenge-timeout':
    case 'auth/code-expired':
      return 'The sign-in step timed out. Start signing in again.';
    case 'auth/operation-not-allowed':
    case 'auth/admin-restricted-operation':
      return 'Two-step verification is not enabled for this project yet (Identity Platform with TOTP).';
    case 'auth/unverified-email':
      return 'Verify your email address before setting up two-step verification.';
    case 'auth/maximum-second-factor-count-exceeded':
      return 'You already have the maximum number of second factors. Remove one first.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a few minutes and try again.';
    default:
      return 'Two-step verification failed. Please try again.';
  }
}

export function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error && typeof (error as { code: unknown }).code === 'string'
    ? (error as { code: string }).code
    : '';
}

export function isMfaRequiredError(error: unknown) {
  return errorCode(error) === 'auth/multi-factor-auth-required';
}

// ---------------------------------------------------------------------------
// Flows with injected SDK calls
// ---------------------------------------------------------------------------
export type TotpSecretLike = { secretKey: string; generateQrCodeUrl(accountName?: string, issuer?: string): string };
export type MfaHint = { uid: string; factorId: string; displayName?: string | null };
export type MfaResolverLike<Credential> = { hints: MfaHint[]; resolveSignIn(assertion: unknown): Promise<Credential> };

export type MfaSdk<User, Credential> = {
  getSession(user: User): Promise<unknown>;
  generateSecret(session: unknown): Promise<TotpSecretLike>;
  assertionForEnrollment(secret: TotpSecretLike, code: string): unknown;
  enroll(user: User, assertion: unknown, displayName: string): Promise<void>;
  assertionForSignIn(enrollmentId: string, code: string): unknown;
  getResolver(error: unknown): MfaResolverLike<Credential>;
  enrolledFactors(user: User): EnrolledFactor[];
  unenroll(user: User, factorUid: string): Promise<void>;
};

export class MfaFlowError extends Error {
  readonly code: string;
  constructor(code: string, message = mfaErrorMessage(code)) {
    super(message);
    this.name = 'MfaFlowError';
    this.code = code;
  }
}

async function guarded<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof MfaFlowError) throw error;
    throw new MfaFlowError(errorCode(error) || 'unknown');
  }
}

export function createMfaFlows<User, Credential>(sdk: MfaSdk<User, Credential>) {
  return {
    /** Step 1 of enrollment: a new secret and the otpauth:// URL for the QR code. */
    startEnrollment(user: User, accountName: string) {
      return guarded(async () => {
        const secret = await sdk.generateSecret(await sdk.getSession(user));
        return { secret, otpauthUrl: secret.generateQrCodeUrl(accountName, TOTP_ISSUER), secretKey: secret.secretKey };
      });
    },
    /** Step 2: the user types the code shown by the app. */
    finishEnrollment(user: User, secret: TotpSecretLike, codeInput: string, displayName = 'Authenticator app') {
      return guarded(async () => {
        const code = normalizeTotpCode(codeInput);
        if (!code) throw new MfaFlowError('auth/invalid-verification-code', 'Enter the 6-digit code from your authenticator app.');
        await sdk.enroll(user, sdk.assertionForEnrollment(secret, code), displayName.trim().slice(0, 40) || 'Authenticator app');
        return sdk.enrolledFactors(user);
      });
    },
    /** Sign-in challenge: the password step threw auth/multi-factor-auth-required. */
    startChallenge(error: unknown) {
      if (!isMfaRequiredError(error)) throw error;
      const resolver = sdk.getResolver(error);
      const hint = resolver.hints.find((item) => item.factorId === TOTP_FACTOR_ID);
      if (!hint) throw new MfaFlowError('unsupported-factor', 'This account uses a second factor this app does not support. Contact support.');
      return { resolver, hint };
    },
    resolveChallenge(challenge: { resolver: MfaResolverLike<Credential>; hint: MfaHint }, codeInput: string) {
      return guarded(async () => {
        const code = normalizeTotpCode(codeInput);
        if (!code) throw new MfaFlowError('auth/invalid-verification-code', 'Enter the 6-digit code from your authenticator app.');
        return challenge.resolver.resolveSignIn(sdk.assertionForSignIn(challenge.hint.uid, code));
      });
    },
    unenroll(user: User, factorUid: string) {
      return guarded(async () => {
        await sdk.unenroll(user, factorUid);
        return sdk.enrolledFactors(user);
      });
    },
  };
}
