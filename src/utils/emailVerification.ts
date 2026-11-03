type FirebaseAuthUserLike = {
  emailVerified: boolean;
};

export type EmailAccessState =
  | 'signed-out'
  | 'verification-required'
  | 'access-allowed';

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
