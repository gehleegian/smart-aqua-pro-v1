import { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { Search, Shield, User, RefreshCw, Trash2 } from 'lucide-react';
import { auth } from '../firebase';
import { getAllUsers, updateUserRole, deleteUserDocument } from '../services/userService';
import { deleteAquariumsByOwner } from '../services/aquariumService';
import type { UserRole } from '../types/user';

const roles = [
  {
    name: 'Admin',
    icon: Shield,
    color: 'text-red-400',
    bg: 'bg-red-500/20',
    permissions: [
      'Full system access',
      'User management',
      'All aquarium access',
      'System configuration',
      'Manage all records',
    ],
  },
  {
    name: 'User',
    icon: User,
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/20',
    permissions: [
      'View own dashboard',
      'Manage own aquariums',
      'View own monitoring data',
      'Receive own alerts',
      'Update own account settings',
    ],
  },
];

type UserItem = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string;
  status?: string;
};

export default function Users() {
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUsers = async () => {
    try {
      setLoading(true);
      setError('');

      const users = await getAllUsers();
      setUsersList(users as UserItem[]);
    } catch (err) {
      console.error(err);
      setError('Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (
    userId: string,
    newRole: UserRole,
    currentRole: UserRole
  ) => {
    if (newRole === currentRole) {
      return;
    }

    if (newRole === 'Admin') {
      const confirmed = window.confirm(
        'Are you sure you want to grant Admin access to this account? This user will have full system access.'
      );

      if (!confirmed) {
        return;
      }
    }

    try {
      setSavingId(userId);
      setError('');
      setSuccess('');

      await updateUserRole(userId, newRole);

      setUsersList((prev) =>
        prev.map((user) =>
          user.id === userId ? { ...user, role: newRole } : user
        )
      );

      setSuccess(`User role updated to ${newRole} successfully.`);
    } catch (err) {
      console.error(err);
      setError('Failed to update user role.');
    } finally {
      setSavingId('');
    }
  };

  const handleDeleteUser = async (
    userId: string,
    userName: string,
    userRole: UserRole
  ) => {
    const currentUser = auth.currentUser;

    if (!currentUser) {
      setError('No logged-in admin found.');
      return;
    }

    if (currentUser.uid === userId) {
      setError('You cannot delete your own admin account here.');
      return;
    }

    if (userRole === 'Admin') {
      setError('Admin accounts cannot be deleted from User Management.');
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to delete ${userName}'s account and all of their aquariums?`
    );

    if (!confirmed) return;

    try {
      setDeletingId(userId);
      setError('');
      setSuccess('');

      await deleteAquariumsByOwner(userId);
      await deleteUserDocument(userId);

      setUsersList((prev) => prev.filter((user) => user.id !== userId));
      setSuccess('User account and related aquariums deleted successfully.');
    } catch (err) {
      console.error(err);
      setError('Failed to delete user account.');
    } finally {
      setDeletingId('');
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filtered = usersList.filter((user) => {
    const matchesSearch =
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesRole = roleFilter === 'all' || user.role === roleFilter;

    return matchesSearch && matchesRole;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {roles.map((role) => {
          const Icon = role.icon;

          return (
            <Card key={role.name}>
              <CardContent className="p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 ${role.bg} rounded-lg flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${role.color}`} />
                  </div>
                  <h3 className="text-lg font-semibold text-white">{role.name}</h3>
                </div>

                <div className="space-y-1">
                  {role.permissions.map((perm) => (
                    <div key={perm} className="flex items-center gap-2 text-sm text-slate-400">
                      <div className="w-1.5 h-1.5 bg-slate-600 rounded-full" />
                      {perm}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <h3 className="text-lg font-semibold text-white">User Accounts</h3>

            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search users..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 w-56"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
                className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                <option value="all">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="User">User</option>
              </select>

              <button
                onClick={loadUsers}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {error && (
            <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-green-300">
              {success}
            </div>
          )}

          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading users...</div>
          ) : filtered.length === 0 ? (
            <div className="py-8 text-center text-slate-400">No users found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">User</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Email</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Role</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Change Role</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-slate-400">Delete</th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((user) => (
                    <tr key={user.id} className="border-b border-slate-700/50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
                            <span className="text-xs font-bold text-white">
                              {user.name
                                .split(' ')
                                .map((n) => n[0])
                                .join('')
                                .slice(0, 2)}
                            </span>
                          </div>
                          <span className="text-sm text-white font-medium">{user.name}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-sm text-slate-300">{user.email}</td>

                      <td className="py-3 px-4">
                        <Badge variant={user.role === 'Admin' ? 'danger' : 'info'}>
                          {user.role}
                        </Badge>
                      </td>

                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-2 h-2 rounded-full ${
                              user.status === 'online' ? 'bg-emerald-500' : 'bg-slate-600'
                            }`}
                          />
                          <span className="text-sm text-slate-400 capitalize">{user.status}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4">
                        <select
                          value={user.role}
                          onChange={(e) =>
                            handleRoleChange(user.id, e.target.value as UserRole, user.role)
                          }
                          disabled={savingId === user.id || deletingId === user.id || user.role === 'Admin'}
                          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500 disabled:opacity-60"
                        >
                          <option value="User">User</option>
                          <option value="Admin">Admin</option>
                        </select>
                      </td>

                      <td className="py-3 px-4">
                        {user.role === 'Admin' ? (
                          <span className="text-sm text-slate-500">Protected</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteUser(user.id, user.name, user.role)}
                            disabled={deletingId === user.id}
                            className="flex items-center gap-2 px-3 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-lg text-sm"
                          >
                            <Trash2 className="w-4 h-4" />
                            {deletingId === user.id ? 'Deleting...' : 'Delete'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}