// Sprint 5: platform administrators must sign in with a TOTP second factor
// once REQUIRE_PLATFORM_ADMIN_MFA is true (docs/access-model.md, MFA section).
// Firebase puts the second factor used at sign-in in the ID token as
// firebase.sign_in_second_factor ('totp' for an authenticator app).
export type TokenLike = { platformAdmin?: unknown; firebase?: { sign_in_second_factor?: unknown } };

export function adminMfaSatisfied(token: TokenLike, required: boolean) {
  if (!required || token.platformAdmin !== true) return true;
  return token.firebase?.sign_in_second_factor === 'totp';
}

export const ADMIN_MFA_MESSAGE = 'Platform administrators must sign in with two-step verification (authenticator app).';
