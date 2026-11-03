import { isAuthRateLimitError } from './authRateLimit';

// Wrong-password and unknown-account share one message so the login form does
// not reveal which email addresses have accounts.
const INVALID_CREDENTIALS_MESSAGE = 'Invalid email or password.';

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  'auth/invalid-credential': INVALID_CREDENTIALS_MESSAGE,
  'auth/user-not-found': INVALID_CREDENTIALS_MESSAGE,
  'auth/wrong-password': INVALID_CREDENTIALS_MESSAGE,
  'auth/invalid-email': 'Invalid email address.',
  'auth/weak-password': 'Password is too weak.',
  'auth/email-already-in-use': 'An account with this email already exists. Please sign in.',
  'auth/too-many-requests': 'Too many attempts. Please wait a few minutes and try again.',
  'auth/user-disabled': 'This account has been disabled. Please contact your administrator.',
  'auth/network-request-failed': 'Network error. Check your connection and try again.',
  'auth/operation-not-allowed':
    'This sign-in method is not enabled. Please contact your administrator.',
  'permission-denied':
    'Your account does not have permission to do this. Please contact your administrator.',
  unavailable: 'The service is temporarily unavailable. Please try again shortly.',
};

export function getAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return '';
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

export function getAuthErrorMessage(error: unknown, fallback: string): string {
  if (isAuthRateLimitError(error)) {
    return error.message;
  }

  const code = getAuthErrorCode(error);

  if (AUTH_ERROR_MESSAGES[code]) {
    return AUTH_ERROR_MESSAGES[code];
  }

  return code ? `${fallback} (${code})` : `${fallback} Please try again.`;
}
