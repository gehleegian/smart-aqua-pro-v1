import { useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useRecommendations } from '../../hooks/useRecommendations';
import { LogMaintenanceModal } from '../maintenance/LogMaintenanceModal';
import StatusMessage from '../ui/StatusMessage';
import type { Recommendation } from '../../types/recommendation';
import Badge from '../ui/Badge';
import { SeverityBadge } from './ConditionBadges';
import Button from '../ui/Button';
import { Card, CardContent } from '../ui/Card';
import type {
  AquariumConditionAssessment,
  CleaningSummary,
  EffectiveThresholds,
  MonitoringParameter,
  RangeThreshold,
  RuleConfig,
  WaterParameter,
} from '../../utils/monitoringAssessmentCore';

const generatedAtFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
});

const PARAMETER_LABELS: Record<string, { label: string; unit?: string }> = {
  temperatureC: { label: 'Temperature', unit: '°C' },
  ph: { label: 'pH' },
  tdsPpm: { label: 'TDS', unit: 'ppm' },
  turbidity: { label: 'Turbidity', unit: 'NTU' },
  waterLevelPercent: { label: 'Water level', unit: '%' },
  power: { label: 'Power' },
  equipment: { label: 'Equipment' },
  filter: { label: 'Filtration' },
  device: { label: 'Device' },
  maintenance: { label: 'Maintenance' },
};

const THRESHOLD_KEYS: Partial<Record<MonitoringParameter, WaterParameter>> = {
  temperature: 'temperatureC',
  ph: 'ph',
  tds: 'tdsPpm',
  turbidity: 'turbidity',
  waterLevel: 'waterLevelPercent',
};

export type Insight = {
  key: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'default';
  label: string;
  text: string;
  /** Guidance quoted from approved rules only, with the rule id for traceability. */
  guidance?: { ruleId: string; when: string; text: string }[];
};

const dueFormatter = new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeZone: 'Asia/Manila' });

function digitsFor(parameter: MonitoringParameter) {
  return parameter === 'tds' || parameter === 'waterLevel' ? 0 : 1;
}

function withUnit(value: string, unit?: string) {
  return `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
}

function rangeText(range: RangeThreshold | undefined, unit?: string) {
  if (!range) return null;
  const format = (value: number) => withUnit(String(value), unit);
  if (range.min !== undefined && range.max !== undefined) return `${format(range.min)} to ${format(range.max)}`;
  if (range.min !== undefined) return `minimum ${format(range.min)}`;
  if (range.max !== undefined) return `maximum ${format(range.max)}`;
  return null;
}

/**
 * The approved rule that applies first when a reading crosses one side of its
 * limit: the lowest-priority-number, unconditional rule on that side.
 */
function firstApprovedRule(rules: RuleConfig[], parameter: WaterParameter, side: 'min' | 'max') {
  const ops = side === 'max' ? ['gt', 'gte'] : ['lt', 'lte'];
  return rules
    .filter((rule) => rule.enabled && rule.status === 'approved' && rule.parameter === parameter &&
      rule.condition.ref === side && ops.includes(rule.condition.op) && rule.extraChecks.length === 0)
    .sort((a, b) => (a.condition.marginPct ?? a.condition.margin ?? 0) - (b.condition.marginPct ?? b.condition.margin ?? 0) ||
      a.priority - b.priority || a.ruleId.localeCompare(b.ruleId))[0];
}

/**
 * Data-driven insights from the existing assessment, the aquarium's effective
 * limits, approved rules and the stored cleaning schedule. Nothing here is a
 * new rule: distances are arithmetic on the reading and its limit, and every
 * piece of guidance is quoted from an approved rule. Invalid sensor data never
 * receives water-quality guidance.
 */
export function buildInsights(
  assessment: AquariumConditionAssessment | null | undefined,
  thresholds?: EffectiveThresholds | null,
  rules: RuleConfig[] = [],
  cleaning?: CleaningSummary | null,
  now = Date.now(),
): Insight[] {
  if (!assessment || assessment.source !== 'live') {
    return [{ key: 'no-data', tone: 'default', label: 'No live data', text: 'Insights appear here when the device sends fresh readings.' }];
  }
  const insights: Insight[] = [];
  for (const item of assessment.parameters) {
    if (item.notMonitored) continue;
    const key = THRESHOLD_KEYS[item.parameter];
    const limit = key ? thresholds?.values[key] : undefined;
    const custom = Boolean(key && thresholds?.overridden.includes(key));
    const range = rangeText(limit, item.unit);
    const digits = digitsFor(item.parameter);
    const shown = typeof item.value === 'number' ? item.value.toFixed(digits) : item.value;
    const value = shown === null || shown === '' ? null : withUnit(String(shown), item.unit);
    const head = value ? `${item.label} ${value}` : item.label;
    const limits = range ? ` (${custom ? 'this aquarium\u2019s custom limit' : 'configured limit'}: ${range})` : '';

    if (item.status === 'unavailable') {
      insights.push({ key: item.parameter, tone: 'default', label: 'Sensor/data',
        text: `${item.message} Treated as a sensor or data problem, not a water condition, so no water-quality advice is given.` });
      continue;
    }
    if (item.status !== 'normal') {
      insights.push({ key: item.parameter, tone: item.status === 'critical' ? 'danger' : 'warning', label: item.status.toUpperCase(),
        text: item.recommendation
          ? `${item.message} See the active recommendation above.`
          : `${item.message}${limits} No approved recommendation rule covers this condition yet.` });
      continue;
    }

    // NORMAL: how far the reading is from each limit, and what the approved
    // rule on that side will recommend if the limit is crossed.
    const parts: string[] = [];
    const guidance: NonNullable<Insight['guidance']> = [];
    if (typeof item.value === 'number' && key && limit) {
      const sides: ['max' | 'min', number | undefined][] = [['max', limit.max], ['min', limit.min]];
      for (const [side, bound] of sides) {
        if (bound === undefined) continue;
        const gap = Math.abs(bound - item.value);
        parts.push(`${withUnit(gap.toFixed(digits), item.unit)} ${side === 'max' ? 'below the' : 'above the'} ${withUnit(String(bound), item.unit)} ${side === 'max' ? 'maximum' : 'minimum'}`);
        const rule = firstApprovedRule(rules, key, side);
        if (rule) guidance.push({ ruleId: rule.ruleId, when: `If it goes ${side === 'max' ? 'above' : 'below'} ${withUnit(String(bound), item.unit)}`, text: rule.action });
      }
    }
    const distance = parts.length > 0 ? `: ${parts.join(', ')}` : ` is within range${limits}`;
    const pending = key && limit && guidance.length === 0
      ? ' No approved rule guidance for this parameter yet.'
      : '';
    insights.push({ key: item.parameter, tone: 'success', label: 'Normal',
      text: `${head}${distance}.${custom && parts.length > 0 ? ' Judged against this aquarium\u2019s custom limit.' : ''}${pending}`,
      ...(guidance.length > 0 ? { guidance } : {}) });
  }

  if (cleaning?.status === 'scheduled' && typeof cleaning.nextCleaningDue === 'number') {
    const due = cleaning.nextCleaningDue <= now;
    const why = cleaning.reason === 'tds_rise' ? ' Brought forward because TDS rose since the last cleaning.'
      : cleaning.reason === 'turbidity_repeat' ? ' Brought forward because turbidity was repeatedly in WARNING.'
        : '';
    const basis = cleaning.intervalDays ? ` Schedule: every ${cleaning.intervalDays} days${cleaning.bioloadLevel ? ` (${cleaning.bioloadLevel} bioload)` : ''}.` : '';
    insights.push({ key: 'cleaning', tone: due ? 'warning' : 'info', label: due ? 'Cleaning due' : 'Next cleaning',
      text: `${due ? 'Cleaning / water change is due now.' : `Next cleaning / water change due ${dueFormatter.format(cleaning.nextCleaningDue)}.`}${why}${basis}` });
  }

  if (thresholds && thresholds.overridden.length > 0) {
    insights.push({ key: 'custom-limits', tone: 'info', label: 'Custom limits',
      text: 'Some readings are judged against limits saved for this aquarium instead of the species defaults. Review them in the aquarium settings if a reading looks wrong.' });
  }
  return insights;
}

function measurementText(item: Recommendation) {
  const value = item.readingSnapshot?.[item.parameter];
  if (typeof value !== 'number' && typeof value !== 'string') return 'Not available';
  const unit = typeof value === 'number' ? PARAMETER_LABELS[item.parameter]?.unit : undefined;
  return `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
}

function thresholdText(item: Recommendation) {
  const unit = PARAMETER_LABELS[item.parameter]?.unit;
  const format = (value: number) => `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  if (item.threshold?.min !== undefined && item.threshold.max !== undefined) {
    return `${format(item.threshold.min)} to ${format(item.threshold.max)}`;
  }
  if (item.threshold?.min !== undefined) return `Minimum ${format(item.threshold.min)}`;
  if (item.threshold?.max !== undefined) return `Maximum ${format(item.threshold.max)}`;
  return null;
}

// Pending recommendations from the rules engine. Applied opens the
// maintenance log form (FR20): logging marks the recommendation applied.
// Dismiss only changes the status.
export function RecommendationsPanel({ aquariumId, aquariumName, defaultOpen = false, assessment, thresholds, rules, cleaning }: {
  aquariumId: string;
  aquariumName?: string;
  defaultOpen?: boolean;
  assessment?: AquariumConditionAssessment | null;
  thresholds?: EffectiveThresholds | null;
  rules?: RuleConfig[];
  cleaning?: CleaningSummary | null;
}) {
  const { recommendations, error, savingId, setStatus } = useRecommendations(aquariumId);
  const insights = assessment === undefined ? [] : buildInsights(assessment, thresholds, rules, cleaning);
  const pending = recommendations.filter((item) => item.status === 'pending' && item.ruleStatus === 'approved');
  const withheld = recommendations.filter((item) => item.status === 'pending' && item.ruleStatus === 'draft');
  const [applying, setApplying] = useState<Recommendation | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <Card className="self-start">
      <details key={aquariumId} open={defaultOpen} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-4 transition-colors hover:bg-slate-700/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <ClipboardList className="h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-base font-semibold text-white">Recommendations</span>
              <span className="block text-xs text-slate-400">
                {error ? 'Recommendations unavailable' : `${pending.length} active${insights.length > 0 ? ` · ${insights.length} insight${insights.length === 1 ? '' : 's'}` : ''}`}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm text-teal-200">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </span>
        </summary>
        <CardContent className="border-t border-slate-600/30">
          {error ? <p className="mb-3 text-sm text-amber-300">{error}</p> : null}
          {notice ? <div className="mb-3"><StatusMessage variant="success">{notice}</StatusMessage></div> : null}
          {withheld.length > 0 ? (
            <div className="mb-3 rounded-lg border border-teal-300/20 bg-teal-400/10 p-3 text-sm text-teal-100">
              <p>{withheld.length} saved draft recommendation{withheld.length === 1 ? '' : 's'} withheld. Rule approval has not been recorded in the app for these saved recommendations.</p>
              <div className="mt-2"><Badge variant="info">Draft rule</Badge></div>
            </div>
          ) : null}
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">No active approved recommendations.</p>
          ) : (
            <ul aria-label="Pending recommendations" tabIndex={0} className="max-h-96 space-y-3 overflow-y-auto overscroll-contain rounded-sm pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">
              {pending.map((item) => (
                <li key={item.id} className="break-words rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-white">{item.title}</p>
                    <div className="flex gap-2">
                      <SeverityBadge severity={item.severity} />
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Problem detected</dt>
                      <dd className="text-slate-200">{item.issueDetected}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Parameter</dt>
                      <dd className="text-slate-200">{PARAMETER_LABELS[item.parameter]?.label ?? item.parameter}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Measured value</dt>
                      <dd className="text-slate-200">{measurementText(item)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Severity</dt>
                      <dd className="text-slate-200">{item.severity.toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Generated</dt>
                      <dd className="text-slate-200">
                        {item.createdAt > 0 ? <time dateTime={new Date(item.createdAt).toISOString()}>{generatedAtFormatter.format(item.createdAt)}</time> : 'Timestamp unavailable'}
                      </dd>
                    </div>
                    {thresholdText(item) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Applicable threshold</dt>
                        <dd className="text-slate-200">{thresholdText(item)}</dd>
                      </div>
                    ) : null}
                  </dl>
                  <dl className="mt-3 space-y-2 text-sm">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Check first</dt>
                      <dd className="text-slate-200">{item.preCheck}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Action</dt>
                      <dd className="text-slate-200">{item.action}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Why</dt>
                      <dd className="text-slate-300">{item.basis}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button size="sm" disabled={savingId === item.id} onClick={() => { setNotice(''); setApplying(item); }}>
                      Applied
                    </Button>
                    <Button size="sm" variant="secondary" disabled={savingId === item.id} onClick={() => void setStatus(item.id, 'dismissed')}>
                      Dismiss
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {insights.length > 0 ? (
            <section aria-label="Current insights" className="mt-4 border-t border-slate-600/30 pt-4">
              <h4 className="text-sm font-semibold text-white">Current insights</h4>
              <p className="mt-1 text-xs text-slate-400">Based on the latest sensor readings and this aquarium&apos;s limits. Guidance is quoted from approved rules.</p>
              <ul className="mt-3 space-y-2">
                {insights.map((insight) => (
                  <li key={insight.key} className="flex flex-wrap items-start gap-2 text-sm text-slate-200">
                    <Badge variant={insight.tone}>{insight.label}</Badge>
                    <div className="min-w-0 flex-1 break-words">
                      <p>{insight.text}</p>
                      {insight.guidance?.map((tip) => (
                        <p key={tip.ruleId} className="mt-1 text-slate-300">
                          <span className="font-medium text-teal-200">{tip.when}:</span> {tip.text}{' '}
                          <span className="text-xs text-slate-500">(rule {tip.ruleId})</span>
                        </p>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </CardContent>
      </details>
      {applying ? (
        <LogMaintenanceModal
          aquariumId={aquariumId}
          aquariumName={aquariumName}
          recommendation={applying}
          onClose={() => setApplying(null)}
          onLogged={setNotice}
        />
      ) : null}
    </Card>
  );
}
