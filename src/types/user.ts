export type UserRole = 'Admin' | 'User';

export interface UserData {
  id?: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  status?: 'online' | 'offline';
}