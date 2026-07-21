import { auth, db } from './firebase';
import { createAuthService } from '@smartaqua/shared';

const authService = createAuthService({ auth, db });

export const registerUser = authService.registerUser;
export const loginUser = authService.loginUser;
export const logoutUser = authService.logoutUser;
