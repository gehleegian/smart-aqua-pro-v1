export type UserRole = 'Admin' | 'User';
export type UserAccountStatus = 'active' | 'inactive';

export interface UserData {
  id?: string;
  name: string;
  fullName?: string;
  email: string;
  contactNumber?: string;
  role: UserRole;
  createdAt?: string;
  updatedAt?: string;
  accountStatus?: UserAccountStatus;
  status?: 'online' | 'offline';
}
