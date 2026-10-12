import { Fish, UserRound } from 'lucide-react';
import type { AquariumDirectoryEntry } from '../../types/aquarium';
import type { DashboardSummaryCard } from '../../types/dashboard';
import type { UserData } from '../../types/user';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AdminDashboardViewProps {
  summaryCards: DashboardSummaryCard[];
  users: UserData[];
  aquariums: AquariumDirectoryEntry[];
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

function SummaryGrid({ cards }: { cards: DashboardSummaryCard[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.title}>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">{card.title}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{card.value}</p>
                </div>
                <div className={`rounded-lg p-3 ${card.iconWrapperClassName}`}>
                  <Icon className={`h-5 w-5 ${card.iconClassName}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function AdminDashboardView({
  summaryCards,
  users,
  aquariums,
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
        <p className="mt-1 text-sm text-slate-400">
          Registration and aquarium ownership records only. Live readings and device controls are not available to administrators.
        </p>
      </div>

      <SummaryGrid cards={summaryCards} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Recent Registrations</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentUsers.length === 0 ? (
                <p className="text-sm text-slate-400">No registered accounts yet.</p>
              ) : (
                recentUsers.map((user) => (
                  <div
                    key={user.id || user.email}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-600/25 bg-slate-900/30 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserRound className="h-5 w-5 flex-shrink-0 text-teal-200" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{user.name || 'Unnamed user'}</p>
                        <p className="truncate text-xs text-slate-400">{user.email}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-300">{user.role}</p>
                      <p className="text-xs text-slate-500">{formatDate(user.createdAt)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Aquarium Ownership</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {aquariums.length === 0 ? (
                <p className="text-sm text-slate-400">No aquarium profiles are registered.</p>
              ) : (
                aquariums.slice(0, 5).map((aquarium) => (
                  <div
                    key={aquarium.id}
                    className="flex items-center justify-between gap-4 rounded-lg border border-slate-600/25 bg-slate-900/30 px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Fish className="h-5 w-5 flex-shrink-0 text-sky-300" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-white">{aquarium.name}</p>
                        <p className="truncate text-xs text-slate-400">Owner: {aquarium.ownerName}</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-500">{aquarium.tankType || 'Tank type not recorded'}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Users Without Registered Aquariums</h3>
        </CardHeader>
        <CardContent>
          {caretakersWithoutAquariums.length === 0 ? (
            <p className="text-sm text-slate-400">Every User/Caretaker account has at least one aquarium.</p>
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
