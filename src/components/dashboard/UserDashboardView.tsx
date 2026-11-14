import type { ReactNode } from 'react';
import { CheckCircle2, Filter, Info, Lightbulb, TriangleAlert, Utensils } from 'lucide-react';
import type {
  DashboardAquarium,
  DashboardSummaryCard,
  DashboardTankStat,
} from '../../types/dashboard';
import { getEquipmentFeedback } from '../../utils/dashboardHelpers';
import Badge from '../ui/Badge';
import { Card, CardHeader } from '../ui/Card';
import { SummaryGrid } from './SummaryGrid';
import { ConditionPanel } from '../condition/ConditionPanel';
import { DraftThresholdsBadge, OverallConditionBadge } from '../condition/ConditionBadges';
import { NextCleaningCard } from '../condition/NextCleaningCard';
import { RecommendationsPanel } from '../condition/RecommendationsPanel';
import { requestTankFocus } from '../../services/tankFocus';
import type { RuleConfig } from '../../utils/monitoringAssessmentCore';
import { isViewerRealtimeConnectionLost } from '../../types/device';

interface UserDashboardViewProps {
  liveDataWarning: ReactNode;
  summaryCards: DashboardSummaryCard[];
  aquariums: DashboardAquarium[];
  selectedTank: DashboardAquarium;
  stats: DashboardTankStat[];
  telemetryNow: number;
  userAlerts: string[];
  userActivities: string[];
  onNavigate: (page: string) => void;
  onSelectTank: (tankId: string) => void;
  rules?: RuleConfig[];
}

const SYSTEM_STATUS_TITLE = 'System Status';

const sectionLinkClassName =
  'rounded text-sm font-medium text-teal-300 transition-colors hover:text-teal-200';

function formatUpdatedAgo(updatedAt: number, now: number) {
  const seconds = Math.max(0, Math.round((now - updatedAt) / 1000));

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  const minutes = Math.round(seconds / 60);

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  const hours = Math.round(minutes / 60);

  return hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
}

// Ranges come from the effective thresholds in Firestore (species defaults +
// per-aquarium overrides); nothing is hard-coded here.
const READING_PARAMETER: Record<string, 'temperatureC' | 'waterLevelPercent' | 'tdsPpm' | 'ph' | 'turbidity'> = {
  Temperature: 'temperatureC',
  'Water Level': 'waterLevelPercent',
  'Water Purity (TDS)': 'tdsPpm',
  'pH Level': 'ph',
  Turbidity: 'turbidity',
};

/** The owner changed this range away from the species default. */
function isCustomRange(title: string, tank: DashboardAquarium) {
  const key = READING_PARAMETER[title];
  return Boolean(key && tank.customThresholds?.includes(key));
}

function getReadingRange(title: string, tank: DashboardAquarium) {
  const values = tank.thresholds?.values;
  const key = READING_PARAMETER[title];
  const range = key ? values?.[key] : undefined;
  if (!range) return '';
  const unit = { temperatureC: '°C', waterLevelPercent: '%', tdsPpm: ' ppm', ph: '', turbidity: ' NTU' }[key!];
  if (range.min !== undefined && range.max !== undefined) return `Range ${range.min}–${range.max}${unit}`;
  if (range.min !== undefined) return `Min ${range.min}${unit}`;
  return `Max ${range.max}${unit}`;
}

function DevicePill({ tank, now }: { tank: DashboardAquarium; now: number }) {
  const isLive = tank.telemetryState === 'live';
  const label = isLive
    ? 'Online'
    : tank.telemetryState === 'offline'
      ? 'Offline'
      : isViewerRealtimeConnectionLost()
        ? 'Connection lost'
        : 'No live data';

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs text-slate-300">
      <span
        aria-hidden="true"
        className={`h-2 w-2 rounded-full ${isLive ? 'bg-emerald-500' : 'bg-slate-500'}`}
      />
      <span className="font-medium text-slate-200">{label}</span>
      {tank.lastUpdatedAt && <span className="text-slate-400">updated {formatUpdatedAgo(tank.lastUpdatedAt, now)}</span>}
    </div>
  );
}

function StatusBanner({ tank }: { tank: DashboardAquarium }) {
  if (tank.telemetryState !== 'live') {
    return (
      <div role="status" className="flex items-start gap-3 rounded-xl border border-slate-700 bg-slate-900 px-5 py-4 text-sm text-slate-300">
        <Info className="mt-0.5 h-5 w-5 flex-shrink-0 text-teal-400" aria-hidden="true" />
        <p>
          {tank.telemetryState === 'offline' ? 'Device offline.' : isViewerRealtimeConnectionLost() ? 'Your connection to live data was lost; device status cannot be confirmed.' : 'No data from the device yet.'}{' '}
          This is a connection issue, not a water problem.
        </p>
      </div>
    );
  }

  const isHealthy = tank.status === 'healthy';
  // A healthy tank needs no banner: the Normal badge above already says so.
  if (isHealthy) return null;
  const Icon = isHealthy ? CheckCircle2 : TriangleAlert;

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-5 py-4 text-sm ${
        isHealthy
          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
          : 'border-amber-400/30 bg-amber-500/10 text-amber-300'
      }`}
    >
      <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
      <p>
        {isHealthy
          ? `${tank.name} looks stable.`
          : `${tank.name} needs attention based on current monitoring values.`}
      </p>
    </div>
  );
}

function ReadingCard({ stat, tank }: { stat: DashboardTankStat; tank: DashboardAquarium }) {
  const Icon = stat.icon;
  const hasValue = stat.value !== '--';
  const range = getReadingRange(stat.title, tank);

  return (
    <Card className="flex min-h-36 flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="truncate text-sm font-medium text-slate-400">{stat.title}</p>
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-teal-500/10">
          <Icon className="h-4 w-4 text-teal-400" aria-hidden="true" />
        </span>
      </div>
      {hasValue ? (
        <p className="mt-3 break-words text-3xl font-semibold tabular-nums tracking-tight text-white">{stat.value}</p>
      ) : (
        <p className="mt-3 text-base font-medium text-slate-400">
          {tank.telemetryState === 'offline' ? 'Device offline' : isViewerRealtimeConnectionLost() ? 'Connection lost' : 'No data yet'}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-1 pt-3 text-xs">
        <span className="inline-flex items-center gap-2 text-slate-400">
          {range}
          {range && isCustomRange(stat.title, tank) && <Badge variant="info">Custom</Badge>}
        </span>
        {hasValue && (
          <span
            title={stat.change}
            className={`flex w-full items-start gap-1.5 ${
              stat.trend === 'good' ? 'text-emerald-300' : 'text-amber-300'
            }`}
          >
            <span aria-hidden="true" className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-current" />
            {/* Full explanation stays in the Condition card; here, two lines max. */}
            <span className="line-clamp-2">{stat.change}</span>
          </span>
        )}
      </div>
    </Card>
  );
}

function InfoList({
  title,
  items,
  action,
}: {
  title: string;
  items: string[];
  action?: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex items-center justify-between gap-4">
        <h3 className="text-base font-semibold text-white">{title}</h3>
        {action}
      </CardHeader>
      <ul className="divide-y divide-slate-700">
        {items.map((item) => (
          <li key={item} className="px-5 py-3 text-sm text-slate-300 sm:px-6">
            {item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function UserDashboardView({
  liveDataWarning,
  summaryCards,
  aquariums,
  selectedTank,
  stats,
  telemetryNow,
  userAlerts,
  userActivities,
  onNavigate,
  onSelectTank,
  rules = [],
}: UserDashboardViewProps) {
  const equipmentIcons = { Filter, Light: Lightbulb, Feeder: Utensils, 'Equipment diagnostic': Info };
  const equipment = getEquipmentFeedback(selectedTank).map((item) => ({
    ...item,
    icon: equipmentIcons[item.label as keyof typeof equipmentIcons],
  }));
  const readings = stats.filter((stat) => stat.title !== SYSTEM_STATUS_TITLE);

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      {/* One calm row: which tank, how it is doing, and the switcher. */}
      <section aria-label="Selected aquarium" className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h2 className="truncate text-2xl font-semibold tracking-tight text-white">{selectedTank.name}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <DevicePill tank={selectedTank} now={telemetryNow} />
            {selectedTank.telemetryState === 'live' ? <OverallConditionBadge severity={selectedTank.assessment.overallSeverity} /> : null}
            <DraftThresholdsBadge draft={selectedTank.assessment.draft || Boolean(selectedTank.thresholds && selectedTank.thresholds.status === 'draft')} />
          </div>
        </div>
        {aquariums.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-slate-400 sm:w-64">
            Aquarium
            <select
              aria-label="Select aquarium"
              value={selectedTank.id}
              onChange={(event) => onSelectTank(event.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2.5 text-sm font-medium text-slate-100 focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30"
            >
              {aquariums.map((aquarium) => (
                <option key={aquarium.id} value={aquarium.id}>
                  {aquarium.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {liveDataWarning}

      <StatusBanner tank={selectedTank} />

      <section aria-label="Current readings" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {readings.map((stat) => (
          <ReadingCard key={stat.title} stat={stat} tank={selectedTank} />
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column: what the condition is, then what to do about it. */}
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <ConditionPanel assessment={selectedTank.assessment} />
          <RecommendationsPanel aquariumId={selectedTank.id} aquariumName={selectedTank.name} assessment={selectedTank.assessment} thresholds={selectedTank.thresholds} rules={rules} />
        </div>

        {/* Side column: upcoming care, equipment and recent alerts. */}
        <div className="min-w-0 space-y-6">
          <NextCleaningCard key={selectedTank.id} aquariumId={selectedTank.id} aquariumName={selectedTank.name}
            cleaning={selectedTank.engineState?.cleaning ?? null} now={telemetryNow}
            onOpenMaintenance={() => { requestTankFocus(selectedTank.id); onNavigate('maintenance'); }}
          />

          <Card>
            <CardHeader className="flex items-center justify-between gap-4">
              <h3 className="text-base font-semibold text-white">Equipment</h3>
              <button type="button" onClick={() => onNavigate('monitoring')} className={sectionLinkClassName}>
                Open controls
              </button>
            </CardHeader>
            <ul className="divide-y divide-slate-700">
              {equipment.map((item) => {
                const Icon = item.icon;

                return (
                  <li key={item.label} className="flex items-center justify-between gap-3 px-5 py-3 sm:px-6">
                    <span className="flex items-center gap-2 text-sm text-slate-400">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {item.label}
                    </span>
                    <span className="text-sm font-medium text-white">{item.state}</span>
                  </li>
                );
              })}
            </ul>
          </Card>

          <InfoList
            title="Recent alerts"
            items={userAlerts.slice(0, 5)}
            action={
              <button type="button" onClick={() => onNavigate('alerts')} className={sectionLinkClassName}>
                View all
              </button>
            }
          />
        </div>
      </div>

      <section aria-labelledby="all-tanks-heading" className="space-y-4">
        <h3 id="all-tanks-heading" className="text-base font-semibold text-white">All aquariums</h3>
        <SummaryGrid cards={summaryCards} />
      </section>

      <InfoList title="Activity" items={userActivities} />
    </div>
  );
}
