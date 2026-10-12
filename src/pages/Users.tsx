import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Fish, RefreshCw, Search, Shield, UserRound } from 'lucide-react';
import Badge from '../components/ui/Badge';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { getAquariumDirectoryEntries } from '../services/aquariumService';
import { getAllUsers } from '../services/userService';
import type { AquariumDirectoryEntry } from '../types/aquarium';
import type { UserData, UserRole } from '../types/user';

type UserDirectoryItem = UserData & { id: string };

function formatDate(value?: string) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date);
}

function formatVolume(aquarium: AquariumDirectoryEntry) {
  const volume = aquarium.workingWaterVolumeLiters ?? aquarium.tankSizeLiters;
  return typeof volume === 'number' ? `${volume} L` : 'Not recorded';
}

export default function Users() {
  const [users, setUsers] = useState<UserDirectoryItem[]>([]);
  const [aquariums, setAquariums] = useState<AquariumDirectoryEntry[]>([]);
  const [expandedUserId, setExpandedUserId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDirectory = async () => {
    try {
      setLoading(true);
      setError('');

      const [userRecords, aquariumRecords] = await Promise.all([
        getAllUsers(),
        getAquariumDirectoryEntries(),
      ]);

      setUsers(
        userRecords.filter((user): user is UserDirectoryItem => Boolean(user.id))
      );
      setAquariums(aquariumRecords);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load the user and aquarium directory.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadDirectory();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  const aquariumsByOwner = useMemo(() => {
    const groups = new Map<string, AquariumDirectoryEntry[]>();

    for (const aquarium of aquariums) {
      const ownerAquariums = groups.get(aquarium.ownerId) || [];
      ownerAquariums.push(aquarium);
      groups.set(aquarium.ownerId, ownerAquariums);
    }

    return groups;
  }, [aquariums]);

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return users.filter((user) => {
      const ownerAquariums = aquariumsByOwner.get(user.id) || [];
      const matchesSearch =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query) ||
        ownerAquariums.some((aquarium) =>
          aquarium.name.toLowerCase().includes(query)
        );
      const matchesRole = roleFilter === 'all' || user.role === roleFilter;

      return matchesSearch && matchesRole;
    });
  }, [aquariumsByOwner, roleFilter, searchQuery, users]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">User and Aquarium Directory</h2>
        <p className="mt-1 text-sm text-slate-400">
          Read-only account and aquarium ownership information. Sensor readings and aquarium controls are not shown.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/15">
                <Shield className="h-5 w-5 text-violet-300" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Administrator</h3>
                <p className="text-sm text-slate-400">Views system membership and aquarium ownership records.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-500/15">
                <UserRound className="h-5 w-5 text-teal-200" />
              </div>
              <div>
                <h3 className="font-semibold text-white">User/Caretaker</h3>
                <p className="text-sm text-slate-400">Manages and monitors only their own aquariums.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-white">Registered Accounts</h3>

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Search user or aquarium..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="w-64 rounded-lg border border-slate-600/50 bg-slate-900/35 py-2 pl-10 pr-4 text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-300/30"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(event) => setRoleFilter(event.target.value as 'all' | UserRole)}
                className="rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-teal-300/30"
              >
                <option value="all">All Roles</option>
                <option value="Admin">Admin</option>
                <option value="User">User/Caretaker</option>
              </select>

              <button
                type="button"
                onClick={() => void loadDirectory()}
                className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-600"
              >
                <RefreshCw className="h-4 w-4" />
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

          {loading ? (
            <div className="py-8 text-center text-slate-400">Loading directory...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-8 text-center text-slate-400">No matching accounts found.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Account</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Role</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Account status</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Registered</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Aquariums</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Details</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredUsers.map((user) => {
                    const ownerAquariums = aquariumsByOwner.get(user.id) || [];
                    const isExpanded = expandedUserId === user.id;

                    return (
                      <Fragment key={user.id}>
                        <tr className="border-b border-slate-700/50">
                          <td className="px-4 py-3">
                            <p className="text-sm font-medium text-white">{user.name || 'Unnamed user'}</p>
                            <p className="text-xs text-slate-400">{user.email}</p>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={user.role === 'Admin' ? 'danger' : 'info'}>
                              {user.role === 'User' ? 'User/Caretaker' : 'Admin'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={user.accountStatus === 'inactive' ? 'default' : 'success'}>
                              {user.accountStatus === 'inactive' ? 'Inactive' : 'Active'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-300">{formatDate(user.createdAt)}</td>
                          <td className="px-4 py-3 text-sm text-slate-300">{ownerAquariums.length}</td>
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              onClick={() => setExpandedUserId(isExpanded ? '' : user.id)}
                              className="flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-900/35 px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-700/60 hover:text-white"
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                              View aquariums
                            </button>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${user.id}-aquariums`} className="border-b border-slate-700/50 bg-slate-950/20">
                            <td colSpan={6} className="px-6 py-4">
                              {ownerAquariums.length === 0 ? (
                                <p className="text-sm text-slate-400">This account has no registered aquariums.</p>
                              ) : (
                                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                  {ownerAquariums.map((aquarium) => (
                                    <div
                                      key={aquarium.id}
                                      className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4"
                                    >
                                      <div className="flex items-start gap-3">
                                        <Fish className="mt-0.5 h-5 w-5 flex-shrink-0 text-sky-300" />
                                        <div className="min-w-0">
                                          <p className="font-medium text-white">{aquarium.name}</p>
                                          <p className="mt-1 text-xs text-slate-400">ID: {aquarium.id}</p>
                                        </div>
                                      </div>
                                      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
                                        <div>
                                          <dt className="text-slate-500">Tank type</dt>
                                          <dd className="mt-1 text-slate-300">{aquarium.tankType || 'Not recorded'}</dd>
                                        </div>
                                        <div>
                                          <dt className="text-slate-500">Volume</dt>
                                          <dd className="mt-1 text-slate-300">{formatVolume(aquarium)}</dd>
                                        </div>
                                        <div>
                                          <dt className="text-slate-500">Fish type</dt>
                                          <dd className="mt-1 text-slate-300">{aquarium.species.join(', ') || 'Not recorded'}</dd>
                                        </div>
                                        <div>
                                          <dt className="text-slate-500">Fish count</dt>
                                          <dd className="mt-1 text-slate-300">{aquarium.fishCount ?? 'Not recorded'}</dd>
                                        </div>
                                        <div>
                                          <dt className="text-slate-500">Registered</dt>
                                          <dd className="mt-1 text-slate-300">{formatDate(aquarium.createdAt)}</dd>
                                        </div>
                                      </dl>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
