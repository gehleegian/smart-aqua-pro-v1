import type { ReactNode } from 'react';
import type {
  DashboardSummaryCard,
  DashboardTankStat,
  OwnerGroup,
} from '../../types/dashboard';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AdminDashboardViewProps {
  liveDataWarning: ReactNode;
  summaryCards: DashboardSummaryCard[];
  ownerGroups: OwnerGroup[];
  ownersNeedingAttention: OwnerGroup[];
  ownersMostTanks: OwnerGroup[];
  selectedOwnerId: string;
  selectedOwnerGroup: OwnerGroup | null;
  selectedTankId: string;
  stats: DashboardTankStat[];
  adminAlerts: string[];
  adminActivities: string[];
  onSelectOwner: (ownerId: string) => void;
  onSelectTank: (tankId: string) => void;
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

function StatsGrid({ stats }: { stats: DashboardTankStat[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => {
        const Icon = stat.icon;

        return (
          <div key={stat.title} className="rounded-lg border border-slate-600/25 bg-slate-900/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">{stat.title}</p>
                <p className="mt-1 text-xl font-semibold text-white">{stat.value}</p>
              </div>
              <Icon className="h-5 w-5 text-teal-200" />
            </div>
            <p className={stat.trend === 'good' ? 'mt-2 text-xs text-emerald-400' : 'mt-2 text-xs text-amber-400'}>
              {stat.change}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function AdminDashboardView({
  liveDataWarning,
  summaryCards,
  ownerGroups,
  ownersNeedingAttention,
  ownersMostTanks,
  selectedOwnerId,
  selectedOwnerGroup,
  selectedTankId,
  stats,
  adminAlerts,
  adminActivities,
  onSelectOwner,
  onSelectTank,
}: AdminDashboardViewProps) {
  return (
    <div className="space-y-6">
      {liveDataWarning}
      <SummaryGrid cards={summaryCards} />

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Owners</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ownerGroups.map((group) => (
                <button
                  key={group.ownerId}
                  type="button"
                  onClick={() => onSelectOwner(group.ownerId)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedOwnerId === group.ownerId ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/20' : 'bg-slate-900/35 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  <span className="block font-medium">{group.ownerName}</span>
                  <span className="text-xs opacity-80">{group.aquariums.length} aquariums</span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">
              {selectedOwnerGroup?.ownerName || 'Aquarium Overview'}
            </h3>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex flex-wrap gap-2">
              {(selectedOwnerGroup?.aquariums || []).map((aquarium) => (
                <button
                  key={aquarium.id}
                  type="button"
                  onClick={() => onSelectTank(aquarium.id)}
                  className={`rounded-lg px-3 py-2 text-sm ${
                    selectedTankId === aquarium.id ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/20' : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {aquarium.name}
                </button>
              ))}
            </div>
            <StatsGrid stats={stats} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <InfoList title="Needs Attention" items={ownersNeedingAttention.map((owner) => owner.ownerName)} />
        <InfoList title="Most Tanks" items={ownersMostTanks.map((owner) => `${owner.ownerName}: ${owner.aquariums.length}`)} />
        <InfoList title="Alerts" items={adminAlerts} />
      </div>
      <InfoList title="Activity" items={adminActivities} />
    </div>
  );
}

function InfoList({ title, items }: { title: string; items: string[] }) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">{title}</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400">No items yet.</p>
          ) : (
            items.map((item) => (
              <p key={item} className="rounded-lg border border-slate-600/20 bg-slate-900/30 px-3 py-2 text-sm text-slate-300">
                {item}
              </p>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
