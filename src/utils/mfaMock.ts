import type { EnrolledFactor, MfaSdk, TotpSecretLike } from './mfa';

// EMULATOR-ONLY stand-in for the TOTP SDK calls, so the enrollment screens and
// the platform-admin gate can be clicked through and Playwright-tested while
// the Auth emulator cannot run TOTP. Enabled only when BOTH
// NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true and NEXT_PUBLIC_MFA_TOTP_MOCK=true
// (src/services/mfaService.ts). It never talks to Firebase and proves nothing
// about real TOTP; that is verified after deploy (docs/access-model.md §MFA).
export const MOCK_TOTP_CODE = '123456';
export const MOCK_TOTP_SECRET = 'MOCKMOCKMOCKMOCK';

type KeyValueStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function createMockMfaSdk<User extends { uid: string }>(store: KeyValueStore): MfaSdk<User, never> {
  const key = (uid: string) => `smartAquaMockMfa:${uid}`;
  const read = (uid: string): EnrolledFactor[] => {
    try {
      return JSON.parse(store.getItem(key(uid)) ?? '[]') as EnrolledFactor[];
    } catch {
      return [];
    }
  };
  const fail = (code: string) => Object.assign(new Error(code), { code });
  return {
    getSession: async (user) => ({ uid: user.uid }),
    generateSecret: async (): Promise<TotpSecretLike> => ({
      secretKey: MOCK_TOTP_SECRET,
      generateQrCodeUrl: (accountName = 'user', issuer = 'SmartAqua Pro') =>
        `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${MOCK_TOTP_SECRET}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`,
    }),
    assertionForEnrollment: (_secret, code) => ({ code }),
    enroll: async (user, assertion, displayName) => {
      if ((assertion as { code: string }).code !== MOCK_TOTP_CODE) throw fail('auth/invalid-verification-code');
      const factors = read(user.uid).filter((factor) => factor.factorId !== 'totp');
      store.setItem(key(user.uid), JSON.stringify([...factors, { uid: `mock-${Date.now()}`, factorId: 'totp', displayName, enrollmentTime: new Date().toUTCString() }]));
    },
    assertionForSignIn: () => {
      throw fail('auth/operation-not-allowed');
    },
    getResolver: () => {
      throw fail('auth/operation-not-allowed');
    },
    enrolledFactors: (user) => read(user.uid),
    unenroll: async (user, factorUid) => {
      store.setItem(key(user.uid), JSON.stringify(read(user.uid).filter((factor) => factor.uid !== factorUid)));
    },
  };
}
