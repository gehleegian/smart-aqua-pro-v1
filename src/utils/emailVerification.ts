type FirebaseAuthUserLike = {
  emailVerified: boolean;
};

export type EmailAccessState =
  | 'signed-out'
  | 'verification-required'
  | 'access-allowed';

/**
 * Some deployed projects may not yet have the self-read policy rule. Treat a
 * denied policy lookup as the secure default (verification required), never
 * as an exemption. Other failures remain errors so transient outages are not
 * misreported as an email-verification problem.
 */
export function isEmailPolicyReadDenied(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const code = (error as { code?: unknown }).code;
  return code === 'permission-denied' || code === 'firestore/permission-denied';
}

export function getEmailAccessState(
  user: FirebaseAuthUserLike | null | undefined,
  emailVerificationRequired: boolean
): EmailAccessState {
  if (!user) return 'signed-out';
  return !emailVerificationRequired || user.emailVerified
    ? 'access-allowed'
    : 'verification-required';
}

export async function resolveEmailAccessState(
  user: FirebaseAuthUserLike | null | undefined,
  loadEmailVerificationRequired: () => Promise<boolean>
): Promise<EmailAccessState> {
  if (!user) return 'signed-out';

  // Firebase verification is independently sufficient. Avoid a policy read
  // that is needed only for unverified legacy accounts.
  if (user.emailVerified) return 'access-allowed';

  return getEmailAccessState(
    user,
    await loadEmailVerificationRequired()
  );
}
