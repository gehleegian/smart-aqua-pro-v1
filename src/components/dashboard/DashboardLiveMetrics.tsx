import { Beaker, Radio, Waves } from 'lucide-react';
import type { DashboardAquarium } from '../../types/dashboard';
import { getDeviceTelemetryStatusText } from '../../types/device';

type DashboardLiveMetricsProps = {
  tank: DashboardAquarium;
};

export function DashboardLiveMetrics({ tank }: DashboardLiveMetricsProps) {
  const phValue = typeof tank.ph === 'number' ? tank.ph.toFixed(2) : '--';
  const turbidityValue = typeof tank.turbidity === 'number' ? `${Math.round(tank.turbidity)}` : '--';
  const powerValue =
    tank.telemetryState === 'live'
      ? 'Online'
      : tank.telemetryState === 'offline'
        ? 'Offline'
        : 'Waiting';

  const phLabel =
    typeof tank.ph === 'number'
      ? tank.ph >= 6.5 && tank.ph <= 7.8
        ? 'Balanced'
        : tank.ph < 6.5
          ? 'Low'
          : 'High'
      : getDeviceTelemetryStatusText(tank.telemetryState);

  const turbidityLabel =
    typeof tank.turbidity === 'number'
      ? tank.turbidity <= 300
        ? 'Clear'
        : tank.turbidity <= 700
          ? 'Moderate'
          : 'Cloudy'
      : getDeviceTelemetryStatusText(tank.telemetryState);

  return (
    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
      <MetricTile
        icon={Beaker}
        title="pH Level"
        value={phValue}
        label={phLabel}
        iconBg="bg-violet-500/20"
        iconColor="text-violet-300"
      />
      <MetricTile
        icon={Waves}
        title="Turbidity"
        value={turbidityValue}
        label={turbidityLabel}
        iconBg="bg-sky-500/20"
        iconColor="text-sky-300"
      />
      <MetricTile
        icon={Radio}
        title="Power Status"
        value={powerValue}
        label={getDeviceTelemetryStatusText(tank.telemetryState)}
        iconBg={
          tank.telemetryState === 'live'
            ? 'bg-emerald-500/20'
            : tank.telemetryState === 'offline'
              ? 'bg-red-500/20'
              : 'bg-amber-500/20'
        }
        iconColor={
          tank.telemetryState === 'live'
            ? 'text-emerald-300'
            : tank.telemetryState === 'offline'
              ? 'text-red-300'
              : 'text-amber-300'
        }
      />
    </div>
  );
}

type MetricTileProps = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  value: string;
  label: string;
  iconBg: string;
  iconColor: string;
};

function MetricTile({
  icon: Icon,
  title,
  value,
  label,
  iconBg,
  iconColor,
}: MetricTileProps) {
  return (
    <div className="rounded-lg border border-slate-700/50 bg-slate-800/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-1 text-2xl font-bold text-white">{value}</p>
          <p className="mt-1 text-xs text-slate-500">{label}</p>
        </div>
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className={`h-5 w-5 ${iconColor}`} />
        </div>
      </div>
    </div>
  );
}
