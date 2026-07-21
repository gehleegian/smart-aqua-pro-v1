import { auth, db } from '../firebase';
import type { UserData } from '../types/user';
import { registerAuthAttempt, resetAuthRateLimit } from '../utils/authRateLimit';
import { createAuthService } from '../../packages/shared/src/services/authService';

const authService = createAuthService({ auth, db });

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<void> {
  registerAuthAttempt('signup');

  await authService.registerUser(name, email, password);
  resetAuthRateLimit('signup');
}

export async function loginUser(
  email: string,
  password: string
): Promise<UserData | null> {
  registerAuthAttempt('login');

  const profile = await authService.loginUser(email, password);

  resetAuthRateLimit('login');

  return profile;
}
