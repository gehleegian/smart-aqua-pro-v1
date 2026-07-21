import { auth, db } from './firebase';
import { createUserService } from '@smartaqua/shared';

const userService = createUserService({ auth, db });

export const getCurrentUserProfile = userService.getCurrentUserProfile;
export const getAllUsers = userService.getAllUsers;
export const updateUserRole = userService.updateUserRole;
export const updateCurrentUserProfile = userService.updateCurrentUserProfile;
export const deleteUserDocument = userService.deleteUserDocument;
