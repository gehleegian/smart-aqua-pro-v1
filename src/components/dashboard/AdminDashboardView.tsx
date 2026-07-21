import type { ReactNode } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { DashboardSummaryCard } from './DashboardSummaryCard';
import { DashboardTankStatCard } from './DashboardTankStatCard';
import { DashboardLiveMetrics } from './DashboardLiveMetrics';
import { getDeviceTelemetryStatusText } from '../../types/device';
import type {
  DashboardSummaryCard as DashboardSummaryCardData,
  DashboardTankStat,
  OwnerGroup,
} from '../../types/dashboard';

type AdminDashboardViewProps = {
  liveDataWarning: ReactNode;
  summaryCards: DashboardSummaryCardData[];
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
};

function DashboardMessageList(props: {
  title: string;
  icon: typeof AlertTriangle;
  iconClassName: string;
  items: string[];
}) {
  const Icon = props.icon;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">{props.title}</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {props.items.map((item, index) => (
            <div key={`${props.title}-${index}`} className="flex items-start gap-3">
              <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${props.iconClassName}`} />
              <p className="text-sm text-slate-300">{item}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
  const selectedTank =
    selectedOwnerGroup?.aquariums.find((tank) => tank.id === selectedTankId) ??
    selectedOwnerGroup?.aquariums[0] ??
    null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
        <p className="mt-1 text-sm text-slate-400">
          System-wide management overview for users, aquariums, and owner activity.
        </p>
      </div>

      {liveDataWarning}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <DashboardSummaryCard key={card.title} card={card} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Owners With Most Aquariums</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ownersMostTanks.map((group) => (
                <div
                  key={group.ownerId}
                  className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3"
                >
                  <span className="text-slate-300">{group.ownerName}</span>
                  <Badge variant="info">{group.aquariums.length} tanks</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Owners Needing Attention</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {ownersNeedingAttention.length === 0 ? (
                <p className="text-slate-400">No owners need attention right now.</p>
              ) : (
                ownersNeedingAttention.map((group) => (
                  <div
                    key={group.ownerId}
                    className="flex items-center justify-between rounded-lg bg-slate-800/50 px-4 py-3"
                  >
                    <span className="text-slate-300">{group.ownerName}</span>
                    <Badge variant="warning">{group.warningCount} warning</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Owner Selection</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {ownerGroups.map((group) => (
                <button
                  key={group.ownerId}
                  onClick={() => onSelectOwner(group.ownerId)}
                  className={`w-full rounded-lg px-4 py-3 text-left transition-all ${
                    selectedOwnerId === group.ownerId
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span>{group.ownerName}</span>
                    <span className="text-xs">{group.aquariums.length} tanks</span>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedOwnerGroup && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-semibold text-white">
                {selectedOwnerGroup.ownerName}&apos;s Aquariums
              </h3>
              <p className="mt-1 text-sm text-slate-400">
                Select a tank below to inspect its latest values.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {selectedOwnerGroup.aquariums.map((tank) => (
                <button
                  key={tank.id}
                  onClick={() => onSelectTank(tank.id)}
                  className={`rounded-lg px-3 py-2 text-sm transition-all ${
                    selectedTankId === tank.id
                      ? 'bg-cyan-600 text-white'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {tank.name}
                </button>
              ))}
            </div>
          </div>

          {stats.length > 0 && (
            <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <DashboardTankStatCard key={stat.title} stat={stat} />
            ))}
          </div>

          {selectedTank ? <DashboardLiveMetrics tank={selectedTank} /> : null}

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">
                    Selected Owner Aquarium Overview
                  </h3>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {selectedOwnerGroup.aquariums.map((tank) => (
                      <div
                        key={tank.id}
                        className={`rounded-lg p-4 transition-all ${
                          selectedTankId === tank.id
                            ? 'bg-cyan-500/10 ring-2 ring-cyan-500/40'
                            : 'bg-slate-800/50'
                        }`}
                      >
                        <div className="mb-3 flex items-center justify-between">
                          <h4 className="font-medium text-white">{tank.name}</h4>
                          <Badge variant={tank.status === 'healthy' ? 'success' : 'warning'}>
                            {tank.status}
                          </Badge>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div>
                            <p className="text-xs text-slate-500">Temp</p>
                            <p className="text-sm font-semibold text-white">
                              {tank.hasFreshTelemetry ? `${tank.temp}\u00B0C` : '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Level</p>
                            <p className="text-sm font-semibold text-white">
                              {tank.hasFreshTelemetry ? `${tank.level}%` : '--'}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-slate-500">Purity (TDS)</p>
                            <p className="text-sm font-semibold text-white">
                              {tank.hasFreshPurityTelemetry
                                ? typeof tank.tdsPpm === 'number'
                                  ? `${Math.round(tank.tdsPpm)} ppm`
                                  : `${tank.quality}%`
                                : '--'}
                            </p>
                        </div>
                      </div>

                        {!tank.hasFreshTelemetry ? (
                          <p className="mt-3 text-xs text-amber-300">
                            {getDeviceTelemetryStatusText(tank.telemetryState)}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardMessageList
          title="System Alerts"
          icon={AlertTriangle}
          iconClassName="text-amber-400"
          items={adminAlerts}
        />
        <DashboardMessageList
          title="System Activity"
          icon={Clock}
          iconClassName="text-cyan-400"
          items={adminActivities}
        />
      </div>
    </div>
  );
}
