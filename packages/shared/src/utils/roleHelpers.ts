import type { UserRole } from '../types/user';

export function normalizeRole(role?: string): UserRole {
  const value = (role || '').trim().toLowerCase();

  if (value === 'admin') {
    return 'Admin';
  }

  return 'User';
}
