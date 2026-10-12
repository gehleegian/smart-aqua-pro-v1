import type { ReactNode } from 'react';
import type {
  DashboardAquarium,
  DashboardSummaryCard,
  DashboardTankStat,
} from '../../types/dashboard';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface UserDashboardViewProps {
  liveDataWarning: ReactNode;
  summaryCards: DashboardSummaryCard[];
  aquariums: DashboardAquarium[];
  selectedTankId: string;
  stats: DashboardTankStat[];
  userAlerts: string[];
  userActivities: string[];
  onSelectTank: (tankId: string) => void;
}

export function UserDashboardView({
  liveDataWarning,
  summaryCards,
  aquariums,
  selectedTankId,
  stats,
  userAlerts,
  userActivities,
  onSelectTank,
}: UserDashboardViewProps) {
  return (
    <div className="space-y-6">
      {liveDataWarning}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => {
          const Icon = card.icon;

          return (
            <Card key={card.title}>
              <CardContent>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm text-slate-400">{card.title}</p>
                    <p className="mt-1 text-xl font-semibold text-white">{card.value}</p>
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

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">My Aquariums</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {aquariums.map((aquarium) => (
                <button
                  key={aquarium.id}
                  type="button"
                  onClick={() => onSelectTank(aquarium.id)}
                  className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                    selectedTankId === aquarium.id ? 'bg-teal-600 text-white shadow-sm shadow-teal-950/20' : 'bg-slate-900/35 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {aquarium.name}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Current Readings</h3>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <InfoList title="Alerts" items={userAlerts} />
        <InfoList title="Activity" items={userActivities} />
      </div>
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
          {items.map((item) => (
            <p key={item} className="rounded-lg border border-slate-600/20 bg-slate-900/30 px-3 py-2 text-sm text-slate-300">
              {item}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
