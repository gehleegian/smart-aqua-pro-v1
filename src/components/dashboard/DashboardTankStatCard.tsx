import { Card, CardContent } from '../ui/Card';
import type { DashboardTankStat } from '../../types/dashboard';
import { MiniSparkline } from './MiniSparkline';

type DashboardTankStatCardProps = {
  stat: DashboardTankStat;
};

export function DashboardTankStatCard({ stat }: DashboardTankStatCardProps) {
  const Icon = stat.icon;

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-sm text-slate-400">{stat.title}</p>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
            <div className="mt-1 flex items-center gap-1">
              <span
                className={`text-xs ${
                  stat.trend === 'good' ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {stat.change}
              </span>
            </div>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-800">
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>

        <div className="mt-3">
          <MiniSparkline
            data={stat.sparkline}
            color={stat.trend === 'good' ? '#10b981' : '#f59e0b'}
          />
        </div>
      </CardContent>
    </Card>
  );
}
