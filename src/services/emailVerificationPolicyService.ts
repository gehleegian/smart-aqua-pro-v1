import type { User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { resolveEmailAccessState } from '../utils/emailVerification';

export const VERIFICATION_POLICY_UNAVAILABLE_MESSAGE =
  'Your credentials were accepted, but SmartAqua Pro could not load the trusted email-verification policy. Please contact the system administrator.';

export class VerificationPolicyUnavailableError extends Error {
  readonly code = 'verification-policy/unavailable';

  constructor() {
    super(VERIFICATION_POLICY_UNAVAILABLE_MESSAGE);
    this.name = 'VerificationPolicyUnavailableError';
  }
}

export function isVerificationPolicyUnavailableError(error: unknown) {
  return (
    error instanceof VerificationPolicyUnavailableError ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'verification-policy/unavailable')
  );
}

export async function getEmailVerificationRequired(uid: string) {
  const snapshot = await getDoc(doc(db, 'authorization_user_policies', uid));
  return snapshot.exists() && snapshot.data().emailVerificationRequired === false
    ? false
    : true;
}

export async function getCurrentEmailAccessState(user: User) {
  try {
    return await resolveEmailAccessState(user, () =>
      getEmailVerificationRequired(user.uid)
    );
  } catch {
    throw new VerificationPolicyUnavailableError();
  }
}

export async function assertCurrentEmailAccess(user: User) {
  if ((await getCurrentEmailAccessState(user)) !== 'access-allowed') {
    throw new Error('Please verify your email before accessing SmartAqua Pro.');
  }
}
