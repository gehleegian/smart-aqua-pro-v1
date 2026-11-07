import {
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type TotpSecret,
  type User,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '../firebase';
import { createMfaFlows, isMfaFeatureEnabled, type EnrolledFactor, type MfaSdk } from '../utils/mfa';
import { createMockMfaSdk } from '../utils/mfaMock';

// Binds the TOTP flows (src/utils/mfa.ts) to the Firebase Auth SDK. Needs
// Identity Platform with TOTP enabled on the project; the Auth emulator does
// not support TOTP, so this path is verified only after deploy (docs/access-model.md §MFA).

// Emulator-only mock (src/utils/mfaMock.ts): both flags, never in a deployed build.
export const mfaMockMode = process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true'
  && process.env.NEXT_PUBLIC_MFA_TOTP_MOCK === 'true';
export const mfaEnabled = mfaMockMode || isMfaFeatureEnabled(process.env.NEXT_PUBLIC_MFA_TOTP_ENABLED);

function factorsOf(user: User): EnrolledFactor[] {
  return multiFactor(user).enrolledFactors.map((factor) => ({
    uid: factor.uid,
    factorId: factor.factorId,
    displayName: factor.displayName ?? null,
    enrollmentTime: factor.enrollmentTime,
  }));
}

const firebaseSdk: MfaSdk<User, UserCredential> = {
  getSession: (user) => multiFactor(user).getSession(),
  generateSecret: (session) => TotpMultiFactorGenerator.generateSecret(session as Parameters<typeof TotpMultiFactorGenerator.generateSecret>[0]),
  assertionForEnrollment: (secret, code) => TotpMultiFactorGenerator.assertionForEnrollment(secret as TotpSecret, code),
  enroll: (user, assertion, displayName) => multiFactor(user).enroll(assertion as ReturnType<typeof TotpMultiFactorGenerator.assertionForEnrollment>, displayName),
  assertionForSignIn: (enrollmentId, code) => TotpMultiFactorGenerator.assertionForSignIn(enrollmentId, code),
  getResolver: (error) => getMultiFactorResolver(auth, error as MultiFactorError) as unknown as ReturnType<MfaSdk<User, UserCredential>['getResolver']>,
  enrolledFactors: factorsOf,
  unenroll: (user, factorUid) => multiFactor(user).unenroll(factorUid),
};

const memoryStore = new Map<string, string>();
const mockStore = {
  getItem: (key: string) => {
    try { return window.sessionStorage.getItem(key); } catch { return memoryStore.get(key) ?? null; }
  },
  setItem: (key: string, value: string) => {
    try { window.sessionStorage.setItem(key, value); } catch { memoryStore.set(key, value); }
  },
};
const sdk = mfaMockMode ? (createMockMfaSdk<User>(mockStore) as unknown as MfaSdk<User, UserCredential>) : firebaseSdk;

export const mfaFlows = createMfaFlows(sdk);

export function currentUserFactors(): EnrolledFactor[] {
  return auth.currentUser ? sdk.enrolledFactors(auth.currentUser) : [];
}
