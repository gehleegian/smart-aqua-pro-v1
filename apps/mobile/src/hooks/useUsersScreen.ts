import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import type { UserData, UserRole } from '@smartaqua/shared';
import { auth } from '../services/firebase';
import { deleteAquariumsByOwner } from '../services/aquariumService';
import { getAllUsers, deleteUserDocument, updateUserRole } from '../services/userService';

type RoleFilter = 'all' | UserRole;

function getFriendlyError(error: unknown) {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return 'Failed to update users.';
}

function confirmAsync(title: string, message: string, confirmText: string) {
  return new Promise<boolean>((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function useUsersScreen() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('all');
  const [savingId, setSavingId] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in admin found.');
        setUsers([]);
        return;
      }

      const fetchedUsers = await getAllUsers();
      setUsers(fetchedUsers);
    } catch (loadError) {
      console.error(loadError);
      setError(getFriendlyError(loadError));
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const onlineUsers = useMemo(() => users.filter((user) => user.status === 'online'), [users]);
  const adminUsers = useMemo(() => users.filter((user) => user.role === 'Admin'), [users]);
  const offlineUsers = useMemo(() => users.filter((user) => user.status === 'offline'), [users]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const name = user.name.toLowerCase();
      const email = user.email.toLowerCase();
      const matchesSearch = query
        ? name.includes(query) || email.includes(query)
        : true;
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [roleFilter, searchQuery, users]);

  const handleRoleChange = useCallback(
    async (user: UserData, newRole: UserRole) => {
      if (!user.id || user.role === newRole) {
        return;
      }

      if (user.role === 'Admin') {
        return;
      }

      const confirmed = await confirmAsync(
        'Change role',
        `Change ${user.name} to ${newRole}?`,
        'Update'
      );

      if (!confirmed) {
        return;
      }

      try {
        setSavingId(user.id);
        setError('');
        setSuccess('');

        await updateUserRole(user.id, newRole);

        setUsers((prev) =>
          prev.map((item) => (item.id === user.id ? { ...item, role: newRole } : item))
        );

        setSuccess(`Updated ${user.name} to ${newRole}.`);
      } catch (updateError) {
        console.error(updateError);
        setError(getFriendlyError(updateError));
      } finally {
        setSavingId('');
      }
    },
    []
  );

  const handleDeleteUser = useCallback(async (user: UserData) => {
    if (!user.id) {
      return;
    }

    const currentUserId = auth.currentUser?.uid || '';

    if (!currentUserId) {
      setError('No logged-in admin found.');
      return;
    }

    if (currentUserId === user.id) {
      setError('You cannot delete your own admin account here.');
      return;
    }

    if (user.role === 'Admin') {
      setError('Admin accounts cannot be deleted from mobile user management.');
      return;
    }

    const confirmed = await confirmAsync(
      'Delete user',
      `Delete ${user.name} and all of their aquariums?`,
      'Delete'
    );

    if (!confirmed) {
      return;
    }

    try {
      setDeletingId(user.id);
      setError('');
      setSuccess('');

      await deleteAquariumsByOwner(user.id);
      await deleteUserDocument(user.id);

      setUsers((prev) => prev.filter((item) => item.id !== user.id));
      setSuccess(`${user.name} was deleted.`);
    } catch (deleteError) {
      console.error(deleteError);
      setError(getFriendlyError(deleteError));
    } finally {
      setDeletingId('');
    }
  }, []);

  return {
    users,
    filteredUsers,
    onlineUsers,
    adminUsers,
    offlineUsers,
    loading,
    searchQuery,
    roleFilter,
    savingId,
    deletingId,
    error,
    success,
    actions: {
      refresh: loadUsers,
      setSearchQuery,
      setRoleFilter,
      changeRole: handleRoleChange,
      deleteUser: handleDeleteUser,
    },
  };
}
