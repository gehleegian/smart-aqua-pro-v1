import { CheckCircle2, ClipboardList, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { ConditionTimes, StructuredReportSummary } from '../../types/monitoringReport';
import { useClientPagination } from '../../hooks/useClientPagination';
import Pagination from '../ui/Pagination';
import { describeWaterTrend } from '../../utils/waterTrends';

// FR21: the in-app view of a stored report summary. Every status is written
// out in words (NORMAL / WARNING / CRITICAL), never shown by colour alone.

const PARAMETER_NAMES: Record<string, string> = {
  temperatureC: 'Temperature', ph: 'pH', tdsPpm: 'TDS', turbidity: 'Turbidity', waterLevelPercent: 'Water level',
  filter: 'Filtration', power: 'Power', equipment: 'Equipment', device: 'Device', maintenance: 'Maintenance',
};
export const parameterName = (parameter: string) => PARAMETER_NAMES[parameter] ?? parameter;

export function manilaDateTime(epochMs: number | null | undefined) {
  if (typeof epochMs !== 'number') return '-';
  return new Date(epochMs + 8 * 3_600_000).toISOString().slice(0, 16).replace('T', ' ');
}

export function formatDuration(ms: number) {
  if (ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
  return hours % 24 ? `${Math.floor(hours / 24)} d ${hours % 24} h` : `${Math.floor(hours / 24)} d`;
}

const fmt = (value: number | null) => (value === null ? '-' : String(Number(value.toFixed(2))));
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-600/40 bg-slate-900/40 px-4 py-3">
      <p className="text-2xl font-semibold text-white">{value}</p>
      <p className="text-xs font-medium text-slate-300">{label}</p>
      {hint ? <p className="mt-1 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader><h3 className="text-base font-semibold text-white">{title}</h3></CardHeader>
      <CardContent className="space-y-3 text-sm text-slate-200">{children}</CardContent>
    </Card>
  );
}

function Table({ caption, head, rows }: { caption: string; head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-slate-600/40 text-xs text-slate-300">
            {head.map((cell) => <th key={cell} scope="col" className="px-2 py-2 font-medium">{cell}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-slate-700/40">
              {row.map((cell, cellIndex) => (
                cellIndex === 0
                  ? <th key={cellIndex} scope="row" className="px-2 py-2 font-medium text-slate-100">{cell}</th>
                  : <td key={cellIndex} className="px-2 py-2 text-slate-200">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAR: { key: keyof ConditionTimes; label: string; className: string }[] = [
  { key: 'normal', label: 'NORMAL', className: 'bg-emerald-500' },
  { key: 'warning', label: 'WARNING', className: 'bg-amber-500 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,.18)_4px,rgba(0,0,0,.18)_8px)]' },
  { key: 'critical', label: 'CRITICAL', className: 'bg-rose-600 bg-[repeating-linear-gradient(-45deg,transparent,transparent_3px,rgba(0,0,0,.25)_3px,rgba(0,0,0,.25)_6px)]' },
  { key: 'unavailable', label: 'Sensor fault', className: 'bg-slate-500' },
  { key: 'notRecorded', label: 'Not recorded', className: 'bg-slate-400' },
  { key: 'noData', label: 'No data', className: 'bg-slate-700' },
];

function ConditionBar({ times, span }: { times: ConditionTimes; span: number }) {
  const parts = BAR.filter((part) => times[part.key] > 0);
  return (
    <div className="space-y-2">
      <div className="flex h-4 w-full overflow-hidden rounded border border-slate-600/50" role="img"
        aria-label={parts.map((part) => `${part.label} ${pct(times[part.key], span)}%`).join(', ')}>
        {parts.map((part) => (
          <div key={part.key} className={part.className} style={{ width: `${pct(times[part.key], span)}%` }} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300">
        {BAR.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm ${part.className}`} aria-hidden="true" />
            {part.label}: {formatDuration(times[part.key])} ({pct(times[part.key], span)}%)
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  applied: <CheckCircle2 className="h-4 w-4 text-emerald-300" aria-hidden="true" />,
  dismissed: <XCircle className="h-4 w-4 text-slate-300" aria-hidden="true" />,
  pending: <ClipboardList className="h-4 w-4 text-amber-300" aria-hidden="true" />,
};

export default function ReportSummaryView({ summary }: { summary: StructuredReportSummary }) {
  const span = summary.period.effectiveEnd - summary.period.start;
  const rec = summary.recommendations;
  const c = summary.completeness;
  const a = summary.alerts;
  const cleaning = summary.maintenance.nextCleaning;
  const recommendationPages = useClientPagination(rec.items,
    `${summary.aquarium.id}:${summary.period.type}:${summary.period.start}:${summary.period.end}`);
  return (
    <div className="space-y-6">
      {summary.period.effectiveEnd < summary.period.end ? (
        <p className="text-sm text-slate-300">This period has not ended: figures cover up to {manilaDateTime(summary.period.effectiveEnd)} (Asia/Manila).</p>
      ) : null}

      <Section title="Recommendations and what was done">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Generated" value={rec.generated} />
          <Stat label="Applied" value={rec.applied} />
          <Stat label="Dismissed" value={rec.dismissed} />
          <Stat label="Still pending" value={rec.pending} />
          <Stat label="Acted on" value={rec.actedOnPct === null ? '-' : `${rec.actedOnPct}%`} />
        </div>
        <p className="text-xs text-slate-400">
          Each recommendation comes from a predefined IF-THEN rule. Closed automatically when the condition cleared: {rec.autoResolved}.
          Replaced by a more severe one: {rec.superseded}.
        </p>
        {rec.items.length > 0 ? (
          <>
          <ol aria-label="Report recommendations" start={recommendationPages.start} className="divide-y divide-slate-700/50">
            {recommendationPages.items.map((item, index) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="text-xs tabular-nums text-teal-300" aria-label={`Record ${recommendationPages.startIndex + index + 1}`}>#{recommendationPages.startIndex + index + 1}</span>
                {STATUS_ICON[item.status] ?? <CheckCircle2 className="h-4 w-4 text-slate-400" aria-hidden="true" />}
                <span className="font-medium text-slate-100">{item.title}</span>
                <span className="text-xs text-slate-400">{parameterName(item.parameter)} · {item.severity.toUpperCase()} · {manilaDateTime(item.createdAt)} · rule {item.ruleId ?? '-'}</span>
                <span className="ml-auto rounded border border-slate-500/50 px-2 py-0.5 text-xs uppercase text-slate-200">{item.status}</span>
              </li>
            ))}
          </ol>
          <Pagination {...recommendationPages} label="Report recommendations" itemLabel="report recommendations" />
          </>
        ) : <p className="text-slate-400">No recommendations were generated in this period.</p>}
      </Section>

      <Section title="Readings (valid readings only)">
        <Table
          caption="Minimum, maximum and average of valid readings per parameter"
          head={['Parameter', 'Min', 'Max', 'Average', 'Valid', 'Invalid', 'Missing', 'Unvalidated']}
          rows={Object.entries(summary.readings.perParameter).map(([, stats]) => [
            `${stats.label}${stats.unit ? ` (${stats.unit})` : ''}`, fmt(stats.min), fmt(stats.max), fmt(stats.avg), stats.valid, stats.invalid, stats.missing, stats.unvalidated,
          ])}
        />
        <p className="text-xs text-slate-400">Invalid readings are sensor problems, not water conditions, and are left out of the figures.</p>
      </Section>

      <Section title="Water trends (sampled history)">
        <p className="text-xs text-slate-400">Descriptive changes only, not a forecast or a cleaning recommendation. Equal endpoints do not prove stable water or sustained recovery. Missing readings are not filled.</p>
        <ul className="space-y-4">
          {Object.entries(summary.readings.perParameter).map(([key, stats]) => (
            <li key={key} className="rounded-lg border border-slate-600/40 p-3">
              <h4 className="font-medium text-white">{stats.label}</h4>
              <p>{describeWaterTrend(stats.trend, stats.unit)}</p>
              {stats.trend ? (
                <p className="mt-1 text-xs text-slate-400">
                  {stats.trend.samples} distinct valid samples; {stats.trend.excluded} excluded or duplicate rows.
                  {stats.trend.first && stats.trend.last ? ` Observed ${manilaDateTime(stats.trend.first.at)} to ${manilaDateTime(stats.trend.last.at)} (Asia/Manila).` : ''}
                  {stats.trend.maxGapMs !== null ? ` Largest gap between valid samples: ${formatDuration(stats.trend.maxGapMs)}.` : ''}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Data completeness">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Completeness" value={c.completenessPct === null ? '-' : `${c.completenessPct}%`} hint={`${c.receivedSamples} of ${c.expectedSamples} five-minute samples`} />
            <Stat label="Time offline" value={formatDuration(c.offlineMs)} hint={`${c.offlineEvents} offline event(s); no data ${formatDuration(c.noDataMs)}`} />
          </div>
        </Section>
        <Section title="Alerts">
          <div className="grid grid-cols-3 gap-3">
            <Stat label="Raised" value={a.total} hint={`${a.bySeverity.critical ?? 0} CRITICAL · ${a.bySeverity.warning ?? 0} WARNING`} />
            <Stat label="Avg. time to resolve" value={a.avgResolveMs === null ? '-' : formatDuration(a.avgResolveMs)} />
            <Stat label="Still open" value={a.stillOpen} />
          </div>
          {a.longestOpen ? (
            <p>Longest open: {a.longestOpen.type ?? parameterName(a.longestOpen.parameter)} ({a.longestOpen.severity.toUpperCase()}), {formatDuration(a.longestOpen.durationMs)}{a.longestOpen.stillOpen ? ', still open' : ''}.</p>
          ) : null}
          {Object.keys(a.byParameter).length > 0 ? (
            <Table caption="Alerts by parameter and severity" head={['Parameter / event', 'Total', 'WARNING', 'CRITICAL']}
              rows={Object.entries(a.byParameter).map(([parameter, counts]) => [parameterName(parameter), counts.total, counts.warning, counts.critical])} />
          ) : null}
        </Section>
      </div>

      <Section title="Time in condition">
        <ConditionBar times={summary.timeInCondition.overall} span={span} />
        <Table
          caption="Time in each condition per parameter"
          head={['Parameter', 'NORMAL', 'WARNING', 'CRITICAL', 'Sensor fault', 'Not monitored']}
          rows={Object.entries(summary.timeInCondition.perParameter).map(([parameter, times]) => [
            parameterName(parameter),
            `${pct(times.normal, span)}%`, `${pct(times.warning, span)}%`, `${pct(times.critical, span)}%`, `${pct(times.unavailable, span)}%`, `${pct(times.notMonitored, span)}%`,
          ])}
        />
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Maintenance log">
          {summary.maintenance.items.length === 0 ? <p className="text-slate-400">No maintenance logged in this period.</p> : (
            <ul className="divide-y divide-slate-700/50">
              {summary.maintenance.items.map((item) => (
                <li key={item.id} className="py-2">
                  <p className="font-medium text-slate-100">{item.type.replaceAll('_', ' ')}{item.waterChangePercent !== null ? ` (${item.waterChangePercent}%)` : ''}</p>
                  <p className="text-xs text-slate-400">{manilaDateTime(item.performedAt)} · {item.by ?? 'unknown'}{item.recommendationId ? ' · for a recommendation' : ''}</p>
                  {item.notes ? <p className="text-slate-300">{item.notes}</p> : null}
                </li>
              ))}
            </ul>
          )}
          <p>Next cleaning: {cleaning.nextCleaningDue === null ? `not scheduled (${cleaning.reason ?? 'unavailable'})` : `${manilaDateTime(cleaning.nextCleaningDue)}${cleaning.due ? ' (DUE)' : ''}`}</p>
        </Section>
        <Section title="Device activity">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Commands" value={summary.devices.commands.total} />
            <Stat label="Done" value={summary.devices.commands.done} />
            <Stat label="Failed" value={summary.devices.commands.failed} />
            <Stat label="No response" value={summary.devices.commands.noResponse} />
          </div>
          <p>Power interruptions: {summary.devices.powerInterruptions.count} (total {formatDuration(summary.devices.powerInterruptions.totalMs)}).</p>
        </Section>
      </div>

      <Section title="Thresholds and rules in force">
        <p>Species profile: {summary.thresholds.speciesId ?? 'none'} · thresholds {summary.thresholds.status.toUpperCase()} · {summary.thresholds.rules.total} rules ({summary.thresholds.rules.approved} approved, {summary.thresholds.rules.draft} draft)</p>
        <Table caption="Normal range per parameter" head={['Parameter', 'Normal min', 'Normal max']}
          rows={Object.entries(summary.thresholds.values).map(([parameter, range]) => [`${parameterName(parameter)}${range.unit ? ` (${range.unit})` : ''}`, fmt(range.min), fmt(range.max)])} />
        {summary.thresholds.missing.length > 0 ? <p className="text-amber-200">Missing thresholds (not evaluated): {summary.thresholds.missing.map(parameterName).join(', ')}.</p> : null}
      </Section>
    </div>
  );
}
