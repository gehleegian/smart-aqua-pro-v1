import type { ReactNode } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import { DashboardSummaryCard } from './DashboardSummaryCard';
import { DashboardTankStatCard } from './DashboardTankStatCard';
import { DashboardLiveMetrics } from './DashboardLiveMetrics';
import { getDeviceTelemetryStatusText } from '../../types/device';
import type {
  DashboardAquarium,
  DashboardSummaryCard as DashboardSummaryCardData,
  DashboardTankStat,
} from '../../types/dashboard';

type UserDashboardViewProps = {
  liveDataWarning: ReactNode;
  summaryCards: DashboardSummaryCardData[];
  aquariums: DashboardAquarium[];
  selectedTankId: string;
  stats: DashboardTankStat[];
  userAlerts: string[];
  userActivities: string[];
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
  const selectedTank = aquariums.find((tank) => tank.id === selectedTankId) ?? aquariums[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">My Dashboard</h2>
        <p className="mt-1 text-sm text-slate-400">
          Personal overview of your aquariums and current monitoring status.
        </p>
      </div>

      {liveDataWarning}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <DashboardSummaryCard key={card.title} card={card} />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">My Aquariums</h3>
          <p className="mt-1 text-sm text-slate-400">
            Select one of your aquariums to view its latest values.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {aquariums.map((tank) => (
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
              <h3 className="text-lg font-semibold text-white">Selected Aquarium Overview</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {aquariums.map((tank) => (
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardMessageList
          title="My Alerts"
          icon={AlertTriangle}
          iconClassName="text-amber-400"
          items={userAlerts}
        />
        <DashboardMessageList
          title="My Recent Activity"
          icon={Clock}
          iconClassName="text-cyan-400"
          items={userActivities}
        />
      </div>
    </div>
  );
}
