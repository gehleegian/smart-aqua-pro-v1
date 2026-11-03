import { Fish, UserRound } from 'lucide-react';
import type { AquariumDirectoryEntry } from '../../types/aquarium';
import type { DashboardSummaryCard } from '../../types/dashboard';
import type { UserData } from '../../types/user';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { SummaryGrid } from './SummaryGrid';

interface AdminDashboardViewProps {
  summaryCards: DashboardSummaryCard[];
  users: UserData[];
  aquariums: AquariumDirectoryEntry[];
  onNavigate: (page: string) => void;
}

function formatDate(value?: string) {
  if (!value) {
    return 'Not recorded';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Not recorded'
    : new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(date);
}

export function AdminDashboardView({
  summaryCards,
  users,
  aquariums,
  onNavigate,
}: AdminDashboardViewProps) {
  const aquariumCountByOwner = new Map<string, number>();

  for (const aquarium of aquariums) {
    aquariumCountByOwner.set(
      aquarium.ownerId,
      (aquariumCountByOwner.get(aquarium.ownerId) || 0) + 1
    );
  }

  const caretakersWithoutAquariums = users.filter(
    (user) => user.role === 'User' && !aquariumCountByOwner.get(user.id || '')
  );
  const recentUsers = [...users]
    .sort((left, right) => {
      const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
      const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
      return rightTime - leftTime;
    })
    .slice(0, 5);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-white">System Membership Overview</h2>
        <p className="mt-1 text-sm text-slate-300">
          Registration and aquarium ownership records only. Live readings and device controls are not available to administrators.
        </p>
      </div>

      <SummaryGrid cards={summaryCards} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex items-center justify-between gap-4">
            <h3 className="text-base font-semibold text-white">Recent Registrations</h3>
            <button
              type="button"
              onClick={() => onNavigate('users')}
              className="rounded text-sm font-medium text-teal-200 transition-colors hover:text-teal-100"
            >
              View all
            </button>
          </CardHeader>
          <div>
            <div className="divide-y divide-slate-600/25">
              {recentUsers.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-300">No registered accounts yet.</p>
              ) : (
                recentUsers.map((user) => (
                  <div
                    key={user.id || user.email}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserRound className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{user.name || 'Unnamed user'}</p>
                        <p className="truncate text-xs text-slate-300">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-300">{user.role}</p>
                      <p className="text-xs text-slate-300">{formatDate(user.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-base font-semibold text-white">Aquarium Ownership</h3>
          </CardHeader>
          <div>
            <div className="divide-y divide-slate-600/25">
              {aquariums.length === 0 ? (
                <p className="px-6 py-4 text-sm text-slate-300">No aquarium profiles are registered.</p>
              ) : (
                aquariums.slice(0, 5).map((aquarium) => (
                  <div
                    key={aquarium.id}
                    className="flex items-center justify-between gap-4 px-6 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Fish className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{aquarium.name}</p>
                        <p className="truncate text-xs text-slate-300">Owner: {aquarium.ownerName}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-300">{aquarium.tankType || 'Tank type not recorded'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-base font-semibold text-white">Users Without Registered Aquariums</h3>
        </CardHeader>
        <CardContent>
          {caretakersWithoutAquariums.length === 0 ? (
            <p className="text-sm text-slate-300">Every User/Caretaker account has at least one aquarium.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {caretakersWithoutAquariums.map((user) => (
                <span
                  key={user.id || user.email}
                  className="rounded-full border border-slate-600/35 bg-slate-900/35 px-3 py-1.5 text-sm text-slate-300"
                >
                  {user.name || user.email}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
