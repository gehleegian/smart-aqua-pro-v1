// FR21 monitoring reports: the summary math. Pure functions, no Firebase
// imports, so the unit tests feed fixed fixtures (functions/test/reportSummary.test.ts).
//
// Inputs are the documents the pipeline already writes:
//   sensor_readings      (telemetryIngest.ts; sampled: one row per 5 min plus one on every classification change)
//   alert_records        (ruleEngine.ts applyAlertOperations; device_offline from scheduledChecks.ts)
//   recommendations      (ruleEngine.ts recommendationDoc; status pending/applied/dismissed/resolved)
//   maintenance_actions  (maintenance.ts)
//   command_logs         (commandLog.ts)
// Nothing here invents a value: a reading counts in min/max/avg only when the
// ingest marked that sensor `valid` (AGENTS.md §5); rows without a validity map
// (legacy rows written before the Cloud Function) are counted as unvalidated
// and excluded.
import {
  PARAMETER_LABELS,
  type CleaningSummary,
  type EffectiveThresholds,
  type RuleConfig,
  type WaterParameter,
} from '../shared/monitoringAssessmentCore.js';

export const REPORT_TIME_ZONE = 'Asia/Manila';
/** The Philippines has no daylight saving time: Asia/Manila is always UTC+8. */
export const MANILA_OFFSET_MS = 8 * 60 * 60_000;
export const HOUR_MS = 60 * 60_000;
export const DAY_MS = 24 * HOUR_MS;
/** History sampling interval of the ingest function (telemetryIngest.ts HISTORY_SAMPLE_INTERVAL_MS). */
export const REPORT_SAMPLE_INTERVAL_MS = 5 * 60_000;
/** A sampled row stands for the time until the next row, but never longer than one interval plus the 60 s offline window. */
export const REPORT_HOLD_MS = REPORT_SAMPLE_INTERVAL_MS + 60_000;
export const MAX_CUSTOM_RANGE_DAYS = 92;

export type ReportType = 'daily' | 'weekly' | 'monthly' | 'custom';
export const REPORT_TYPES: readonly ReportType[] = ['daily', 'weekly', 'monthly', 'custom'];

export const REPORT_WATER_PARAMETERS: readonly WaterParameter[] = ['temperatureC', 'ph', 'tdsPpm', 'turbidity', 'waterLevelPercent'];
const VALIDITY_KEY: Record<WaterParameter, string> = {
  temperatureC: 'temperature',
  ph: 'ph',
  tdsPpm: 'tds',
  turbidity: 'turbidity',
  waterLevelPercent: 'waterLevel',
};
/** Parameters whose per-row status the ingest records (parameterStatus). */
export const REPORT_STATUS_PARAMETERS = [...REPORT_WATER_PARAMETERS, 'filter', 'power', 'equipment'] as const;
export type ReportStatusParameter = typeof REPORT_STATUS_PARAMETERS[number];

// ---------------------------------------------------------------------------
// Periods (Asia/Manila calendar)
// ---------------------------------------------------------------------------
export type ReportPeriod = { type: ReportType; start: number; end: number; label: string };

/** YYYY-MM-DD of an instant in Manila time. */
export function manilaDateKey(epochMs: number) {
  return new Date(epochMs + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD HH:MM" in Manila time. */
export function manilaDateTime(epochMs: number) {
  return new Date(epochMs + MANILA_OFFSET_MS).toISOString().slice(0, 16).replace('T', ' ');
}

/** Midnight (Manila) starting a YYYY-MM-DD date, as epoch ms. */
export function manilaMidnight(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) throw new Error('Dates must be YYYY-MM-DD.');
  const utc = Date.parse(`${dateKey}T00:00:00Z`);
  if (!Number.isFinite(utc) || new Date(utc).toISOString().slice(0, 10) !== dateKey) throw new Error('Dates must be real calendar dates.');
  return utc - MANILA_OFFSET_MS;
}

function addDays(dateKey: string, days: number) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The period a report covers. `anchor` is any Manila date inside it:
 * daily = that day, weekly = its Monday–Sunday week, monthly = its calendar
 * month. custom = anchor through endDate, both inclusive.
 */
export function resolvePeriod(type: ReportType, anchor: string, endDate?: string): ReportPeriod {
  const anchorStart = manilaMidnight(anchor);
  switch (type) {
    case 'daily':
      return { type, start: anchorStart, end: anchorStart + DAY_MS, label: anchor };
    case 'weekly': {
      const weekday = new Date(Date.parse(`${anchor}T00:00:00Z`)).getUTCDay(); // 0 = Sunday
      const monday = addDays(anchor, weekday === 0 ? -6 : 1 - weekday);
      const sunday = addDays(monday, 6);
      return { type, start: manilaMidnight(monday), end: manilaMidnight(monday) + 7 * DAY_MS, label: `${monday} to ${sunday}` };
    }
    case 'monthly': {
      const first = `${anchor.slice(0, 7)}-01`;
      const [year, month] = anchor.split('-').map(Number);
      const next = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
      return { type, start: manilaMidnight(first), end: manilaMidnight(next), label: anchor.slice(0, 7) };
    }
    case 'custom': {
      if (!endDate) throw new Error('A custom report needs an end date.');
      const end = manilaMidnight(endDate) + DAY_MS;
      if (end <= anchorStart) throw new Error('The end date must be on or after the start date.');
      if (end - anchorStart > MAX_CUSTOM_RANGE_DAYS * DAY_MS) throw new Error(`A custom report covers at most ${MAX_CUSTOM_RANGE_DAYS} days.`);
      return { type, start: anchorStart, end, label: `${anchor} to ${endDate}` };
    }
  }
}

/** The full period before the one containing `now` (used by the schedules: last week, last month). */
export function previousPeriod(type: 'weekly' | 'monthly', now: number): ReportPeriod {
  const current = resolvePeriod(type, manilaDateKey(now));
  return resolvePeriod(type, manilaDateKey(current.start - 1));
}

// ---------------------------------------------------------------------------
// Normalizing stored documents
// ---------------------------------------------------------------------------
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Epoch ms from a number, an ISO string, a Date or a Firestore Timestamp. */
export function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (isRecord(value) && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export type ReadingRow = {
  at: number;
  classification: string | null;
  values: Partial<Record<WaterParameter, number>>;
  validity: Partial<Record<WaterParameter, 'valid' | 'invalid' | 'missing'>> | null;
  parameterStatus: Partial<Record<ReportStatusParameter, string>> | null;
};

export function normalizeReading(data: Record<string, unknown>): ReadingRow | null {
  const at = toMillis(data.recordedAtEpoch);
  if (at === null) return null;
  const validityRaw = isRecord(data.validity) ? data.validity : null;
  const values: ReadingRow['values'] = {};
  const validity: NonNullable<ReadingRow['validity']> = {};
  for (const parameter of REPORT_WATER_PARAMETERS) {
    const value = data[parameter];
    if (typeof value === 'number' && Number.isFinite(value)) values[parameter] = value;
    const status = validityRaw?.[VALIDITY_KEY[parameter]];
    if (status === 'valid' || status === 'invalid' || status === 'missing') validity[parameter] = status;
  }
  const statusRaw = isRecord(data.parameterStatus) ? data.parameterStatus : null;
  const parameterStatus = statusRaw
    ? Object.fromEntries(REPORT_STATUS_PARAMETERS.flatMap((parameter) => (typeof statusRaw[parameter] === 'string' ? [[parameter, statusRaw[parameter]]] : [])))
    : null;
  return {
    at,
    classification: text(data.classification),
    values,
    validity: validityRaw ? validity : null,
    parameterStatus,
  };
}

export type AlertRow = {
  id: string;
  parameter: string;
  severity: string;
  type: string | null;
  triggeredAt: number;
  resolvedAt: number | null;
};

export function normalizeAlert(id: string, data: Record<string, unknown>): AlertRow | null {
  const triggeredAt = toMillis(data.triggered_at);
  if (triggeredAt === null) return null;
  return {
    id,
    parameter: text(data.parameter) ?? 'unknown',
    severity: text(data.severity) ?? 'unknown',
    type: text(data.type),
    triggeredAt,
    resolvedAt: toMillis(data.resolved_at),
  };
}

export type RecommendationRow = {
  id: string;
  parameter: string;
  severity: string;
  title: string;
  ruleId: string | null;
  status: 'pending' | 'applied' | 'dismissed' | 'resolved' | 'unknown';
  supersededBy: string | null;
  createdAt: number;
  resolvedAt: number | null;
};

export function normalizeRecommendation(id: string, data: Record<string, unknown>): RecommendationRow | null {
  const createdAt = toMillis(data.createdAt ?? data.created_at);
  if (createdAt === null) return null;
  const raw = String(data.status ?? '').toLowerCase();
  const status = raw === 'pending' || raw === 'applied' || raw === 'dismissed' || raw === 'resolved' ? raw : 'unknown';
  return {
    id,
    parameter: text(data.parameter) ?? 'unknown',
    severity: text(data.severity) ?? 'unknown',
    title: text(data.title) ?? text(data.issueDetected) ?? text(data.issue_detected) ?? 'Recommendation',
    ruleId: text(data.ruleId),
    status,
    supersededBy: text(data.supersededBy),
    createdAt,
    resolvedAt: toMillis(data.resolvedAt ?? data.resolved_at),
  };
}

export type MaintenanceRow = {
  id: string;
  performedAt: number;
  type: string;
  performedByName: string | null;
  performedByRole: string | null;
  waterChangePercent: number | null;
  notes: string | null;
  recommendationId: string | null;
};

export function normalizeMaintenance(id: string, data: Record<string, unknown>): MaintenanceRow | null {
  const performedAt = toMillis(data.performedAt ?? data.action_date);
  if (performedAt === null) return null;
  return {
    id,
    performedAt,
    type: text(data.type) ?? text(data.actionType) ?? text(data.action_type) ?? 'other',
    performedByName: text(data.performedByName),
    performedByRole: text(data.performedByRole),
    waterChangePercent: typeof data.waterChangePercent === 'number' ? data.waterChangePercent : null,
    notes: text(data.notes),
    recommendationId: text(data.recommendationId),
  };
}

export type CommandRow = { id: string; type: string; status: string; source: string; requestedAt: number };

export function normalizeCommand(id: string, data: Record<string, unknown>): CommandRow | null {
  const requestedAt = toMillis(data.requestedAt);
  if (requestedAt === null) return null;
  return {
    id,
    type: text(data.type) ?? 'unknown',
    status: text(data.status) ?? 'unknown',
    source: text(data.source) ?? 'app',
    requestedAt,
  };
}

// ---------------------------------------------------------------------------
// The structured summary (stored on monitoring_reports.structured_summary)
// ---------------------------------------------------------------------------
export type ParameterStats = {
  label: string;
  unit: string | null;
  valid: number;
  invalid: number;
  missing: number;
  unvalidated: number;
  min: number | null;
  max: number | null;
  avg: number | null;
};

export type ConditionTimes = {
  normal: number;
  warning: number;
  critical: number;
  unavailable: number;
  notMonitored: number;
  /** Rows written before per-parameter status was recorded. */
  notRecorded: number;
  noData: number;
};

export type StructuredSummary = {
  version: 1;
  period: { type: ReportType; start: number; end: number; effectiveEnd: number; label: string; timeZone: string };
  aquarium: { id: string; name: string; orgId: string | null; orgName: string | null };
  readings: { rows: number; perParameter: Record<WaterParameter, ParameterStats> };
  completeness: {
    sampleIntervalMs: number;
    expectedSamples: number;
    receivedSamples: number;
    completenessPct: number | null;
    noDataMs: number;
    offlineMs: number;
    offlineEvents: number;
  };
  timeInCondition: { overall: ConditionTimes; perParameter: Record<ReportStatusParameter, ConditionTimes> };
  alerts: {
    total: number;
    bySeverity: Record<string, number>;
    byParameter: Record<string, { total: number; warning: number; critical: number }>;
    resolved: number;
    stillOpen: number;
    avgResolveMs: number | null;
    longestOpen: { alertId: string; parameter: string; severity: string; type: string | null; durationMs: number; stillOpen: boolean; triggeredAt: number } | null;
  };
  recommendations: {
    generated: number;
    applied: number;
    dismissed: number;
    pending: number;
    autoResolved: number;
    superseded: number;
    actedOnPct: number | null;
    byParameter: Record<string, { generated: number; applied: number; dismissed: number; pending: number }>;
    items: { id: string; createdAt: number; parameter: string; severity: string; title: string; status: string; ruleId: string | null }[];
  };
  maintenance: {
    count: number;
    items: { id: string; performedAt: number; type: string; by: string | null; waterChangePercent: number | null; notes: string | null; recommendationId: string | null }[];
    nextCleaning: { status: string; nextCleaningDue: number | null; due: boolean; reason: string | null; intervalDays: number | null; lastCleanedAt: number | null };
  };
  devices: {
    commands: { total: number; done: number; failed: number; noResponse: number; pending: number; byType: Record<string, number>; bySource: Record<string, number> };
    powerInterruptions: { count: number; totalMs: number; items: { start: number; end: number | null }[] };
  };
  thresholds: {
    status: 'draft' | 'approved';
    speciesId: string | null;
    values: Record<string, { min: number | null; max: number | null; unit: string | null }>;
    missing: string[];
    overridden: string[];
    rules: { total: number; approved: number; draft: number; list: { ruleId: string; parameter: string; severity: string; title: string; status: string; enabled: boolean }[] };
    draftNote: string | null;
  };
};

export type SummaryInputs = {
  period: ReportPeriod;
  now: number;
  aquarium: { id: string; name: string; orgId: string | null; orgName: string | null; createdAt: number | null; cleaning: CleaningSummary | Record<string, unknown> | null };
  /** Rows with start <= at < end. */
  readings: ReadingRow[];
  /** The last row before start, if any: its state carries into the period. */
  priorReading?: ReadingRow | null;
  /** Alerts that overlap the period (triggered before end and not resolved before start). */
  alerts: AlertRow[];
  /** Recommendations created in the period. */
  recommendations: RecommendationRow[];
  maintenance: MaintenanceRow[];
  commands: CommandRow[];
  thresholds: EffectiveThresholds;
  rules: RuleConfig[];
};

function emptyTimes(): ConditionTimes {
  return { normal: 0, warning: 0, critical: 0, unavailable: 0, notMonitored: 0, notRecorded: 0, noData: 0 };
}

function timeKey(status: string | null | undefined): keyof ConditionTimes {
  switch (status) {
    case 'normal': return 'normal';
    case 'warning': return 'warning';
    case 'critical': return 'critical';
    case 'unavailable': return 'unavailable';
    case 'not_monitored': return 'notMonitored';
    default: return 'notRecorded';
  }
}

const round = (value: number, places = 2) => Math.round(value * 10 ** places) / 10 ** places;

function overlapMs(from: number, to: number, start: number, end: number) {
  return Math.max(0, Math.min(to, end) - Math.max(from, start));
}

export function computeReadingStats(rows: ReadingRow[]): StructuredSummary['readings'] {
  const perParameter = {} as Record<WaterParameter, ParameterStats>;
  for (const parameter of REPORT_WATER_PARAMETERS) {
    const stats: ParameterStats = {
      label: PARAMETER_LABELS[parameter].label,
      unit: PARAMETER_LABELS[parameter].unit ?? null,
      valid: 0, invalid: 0, missing: 0, unvalidated: 0, min: null, max: null, avg: null,
    };
    let sum = 0;
    for (const row of rows) {
      if (!row.validity) {
        stats.unvalidated += 1;
        continue;
      }
      const status = row.validity[parameter] ?? 'missing';
      const value = row.values[parameter];
      if (status === 'valid' && value !== undefined) {
        stats.valid += 1;
        sum += value;
        stats.min = stats.min === null ? value : Math.min(stats.min, value);
        stats.max = stats.max === null ? value : Math.max(stats.max, value);
      } else if (status === 'invalid') {
        stats.invalid += 1;
      } else {
        stats.missing += 1;
      }
    }
    stats.avg = stats.valid > 0 ? round(sum / stats.valid) : null;
    perParameter[parameter] = stats;
  }
  return { rows: rows.length, perParameter };
}

export function computeCompleteness(
  rows: ReadingRow[],
  alerts: AlertRow[],
  start: number,
  effectiveEnd: number,
  createdAt: number | null,
  covered: number
): StructuredSummary['completeness'] {
  // Expected samples start at the tank's creation if that is inside the period,
  // or at the first stored reading if that is earlier (a reading proves the device existed).
  const firstReading = rows.reduce((first, row) => (row.at >= start && row.at < first ? row.at : first), Number.POSITIVE_INFINITY);
  const from = createdAt !== null && createdAt > start ? Math.max(start, Math.min(createdAt, firstReading)) : start;
  const expectedSamples = effectiveEnd > from ? Math.ceil((effectiveEnd - from) / REPORT_SAMPLE_INTERVAL_MS) : 0;
  const slots = new Set<number>();
  for (const row of rows) {
    if (row.at < from || row.at >= effectiveEnd) continue;
    slots.add(Math.floor((row.at - from) / REPORT_SAMPLE_INTERVAL_MS));
  }
  const offline = alerts.filter((alert) => alert.parameter === 'device');
  return {
    sampleIntervalMs: REPORT_SAMPLE_INTERVAL_MS,
    expectedSamples,
    receivedSamples: slots.size,
    completenessPct: expectedSamples > 0 ? round((slots.size / expectedSamples) * 100, 1) : null,
    noDataMs: Math.max(0, effectiveEnd - start - covered),
    offlineMs: offline.reduce((total, alert) => total + overlapMs(alert.triggeredAt, alert.resolvedAt ?? effectiveEnd, start, effectiveEnd), 0),
    offlineEvents: offline.filter((alert) => alert.triggeredAt >= start && alert.triggeredAt < effectiveEnd).length,
  };
}

/**
 * Time in each condition. Each sampled row stands from its timestamp until the
 * next row, capped at REPORT_HOLD_MS; anything not covered is noData. The row
 * before the period carries into it (clipped to the start).
 */
export function computeTimeInCondition(rows: ReadingRow[], prior: ReadingRow | null | undefined, start: number, effectiveEnd: number) {
  const overall = emptyTimes();
  const perParameter = Object.fromEntries(REPORT_STATUS_PARAMETERS.map((parameter) => [parameter, emptyTimes()])) as Record<ReportStatusParameter, ConditionTimes>;
  const sorted = [...(prior && prior.at < start ? [prior] : []), ...rows.filter((row) => row.at >= start && row.at < effectiveEnd)]
    .sort((a, b) => a.at - b.at);
  let covered = 0;
  sorted.forEach((row, index) => {
    const next = sorted[index + 1]?.at ?? effectiveEnd;
    const span = overlapMs(row.at, Math.min(next, row.at + REPORT_HOLD_MS), start, effectiveEnd);
    if (span <= 0) return;
    covered += span;
    overall[timeKey(row.classification)] += span;
    for (const parameter of REPORT_STATUS_PARAMETERS) {
      perParameter[parameter][timeKey(row.parameterStatus?.[parameter])] += span;
    }
  });
  const noData = Math.max(0, effectiveEnd - start - covered);
  overall.noData = noData;
  for (const parameter of REPORT_STATUS_PARAMETERS) perParameter[parameter].noData = noData;
  return { overall, perParameter, covered };
}

export function computeAlertSummary(alerts: AlertRow[], start: number, end: number, effectiveEnd: number): StructuredSummary['alerts'] {
  const inPeriod = alerts.filter((alert) => alert.triggeredAt >= start && alert.triggeredAt < end);
  const bySeverity: Record<string, number> = { warning: 0, critical: 0 };
  const byParameter: StructuredSummary['alerts']['byParameter'] = {};
  let resolveTotal = 0;
  let resolved = 0;
  for (const alert of inPeriod) {
    bySeverity[alert.severity] = (bySeverity[alert.severity] ?? 0) + 1;
    const entry = (byParameter[alert.parameter] ??= { total: 0, warning: 0, critical: 0 });
    entry.total += 1;
    if (alert.severity === 'warning') entry.warning += 1;
    if (alert.severity === 'critical') entry.critical += 1;
    if (alert.resolvedAt !== null) {
      resolved += 1;
      resolveTotal += alert.resolvedAt - alert.triggeredAt;
    }
  }
  let longestOpen: StructuredSummary['alerts']['longestOpen'] = null;
  for (const alert of alerts) {
    if (alert.triggeredAt >= end || (alert.resolvedAt !== null && alert.resolvedAt < start)) continue;
    const stillOpen = alert.resolvedAt === null;
    const durationMs = (alert.resolvedAt ?? effectiveEnd) - alert.triggeredAt;
    if (!longestOpen || durationMs > longestOpen.durationMs) {
      longestOpen = { alertId: alert.id, parameter: alert.parameter, severity: alert.severity, type: alert.type, durationMs, stillOpen, triggeredAt: alert.triggeredAt };
    }
  }
  return {
    total: inPeriod.length,
    bySeverity,
    byParameter,
    resolved,
    stillOpen: inPeriod.length - resolved,
    avgResolveMs: resolved > 0 ? Math.round(resolveTotal / resolved) : null,
    longestOpen,
  };
}

export function computeRecommendationSummary(recommendations: RecommendationRow[], start: number, end: number): StructuredSummary['recommendations'] {
  const inPeriod = recommendations.filter((item) => item.createdAt >= start && item.createdAt < end).sort((a, b) => a.createdAt - b.createdAt);
  const summary: StructuredSummary['recommendations'] = {
    generated: inPeriod.length, applied: 0, dismissed: 0, pending: 0, autoResolved: 0, superseded: 0,
    actedOnPct: null, byParameter: {}, items: [],
  };
  for (const item of inPeriod) {
    const entry = (summary.byParameter[item.parameter] ??= { generated: 0, applied: 0, dismissed: 0, pending: 0 });
    entry.generated += 1;
    if (item.status === 'applied') { summary.applied += 1; entry.applied += 1; }
    else if (item.status === 'dismissed') { summary.dismissed += 1; entry.dismissed += 1; }
    else if (item.status === 'pending') { summary.pending += 1; entry.pending += 1; }
    else if (item.status === 'resolved' && item.supersededBy) summary.superseded += 1;
    else if (item.status === 'resolved') summary.autoResolved += 1;
  }
  summary.actedOnPct = inPeriod.length > 0 ? round(((summary.applied + summary.dismissed) / inPeriod.length) * 100, 1) : null;
  summary.items = inPeriod.slice(0, 100).map((item) => ({
    id: item.id, createdAt: item.createdAt, parameter: item.parameter, severity: item.severity,
    title: item.title, status: item.status === 'resolved' && item.supersededBy ? 'superseded' : item.status, ruleId: item.ruleId,
  }));
  return summary;
}

function nextCleaning(cleaning: SummaryInputs['aquarium']['cleaning'], now: number): StructuredSummary['maintenance']['nextCleaning'] {
  if (!isRecord(cleaning)) {
    return { status: 'unavailable', nextCleaningDue: null, due: false, reason: 'not_evaluated', intervalDays: null, lastCleanedAt: null };
  }
  const nextCleaningDue = typeof cleaning.nextCleaningDue === 'number' ? cleaning.nextCleaningDue : null;
  return {
    status: text(cleaning.status) ?? 'unavailable',
    nextCleaningDue,
    due: nextCleaningDue !== null && nextCleaningDue <= now,
    reason: text(cleaning.reason),
    intervalDays: typeof cleaning.intervalDays === 'number' ? cleaning.intervalDays : null,
    lastCleanedAt: typeof cleaning.lastCleanedAt === 'number' ? cleaning.lastCleanedAt : null,
  };
}

export function computeDeviceSummary(commands: CommandRow[], alerts: AlertRow[], start: number, end: number, effectiveEnd: number): StructuredSummary['devices'] {
  const inPeriod = commands.filter((command) => command.requestedAt >= start && command.requestedAt < end);
  const counts = { total: inPeriod.length, done: 0, failed: 0, noResponse: 0, pending: 0, byType: {} as Record<string, number>, bySource: {} as Record<string, number> };
  for (const command of inPeriod) {
    if (command.status === 'done') counts.done += 1;
    else if (command.status === 'failed') counts.failed += 1;
    else if (command.status === 'no_response') counts.noResponse += 1;
    else if (command.status === 'pending') counts.pending += 1;
    counts.byType[command.type] = (counts.byType[command.type] ?? 0) + 1;
    counts.bySource[command.source] = (counts.bySource[command.source] ?? 0) + 1;
  }
  const power = alerts
    .filter((alert) => alert.parameter === 'power' && alert.triggeredAt >= start && alert.triggeredAt < end)
    .sort((a, b) => a.triggeredAt - b.triggeredAt);
  return {
    commands: counts,
    powerInterruptions: {
      count: power.length,
      totalMs: power.reduce((total, alert) => total + overlapMs(alert.triggeredAt, alert.resolvedAt ?? effectiveEnd, start, effectiveEnd), 0),
      items: power.map((alert) => ({ start: alert.triggeredAt, end: alert.resolvedAt })),
    },
  };
}

export function computeThresholdSummary(thresholds: EffectiveThresholds, rules: RuleConfig[]): StructuredSummary['thresholds'] {
  const values: StructuredSummary['thresholds']['values'] = {};
  for (const parameter of REPORT_WATER_PARAMETERS) {
    const range = thresholds.values[parameter];
    if (!range) continue;
    values[parameter] = { min: range.min ?? null, max: range.max ?? null, unit: PARAMETER_LABELS[parameter].unit ?? null };
  }
  const list = [...rules]
    .sort((a, b) => a.parameter.localeCompare(b.parameter) || a.priority - b.priority || a.ruleId.localeCompare(b.ruleId))
    .map((rule) => ({ ruleId: rule.ruleId, parameter: rule.parameter, severity: rule.severity, title: rule.title, status: rule.status, enabled: rule.enabled }));
  const draftRules = list.filter((rule) => rule.status !== 'approved').length;
  const draft = thresholds.status !== 'approved' || draftRules > 0;
  return {
    status: thresholds.status,
    speciesId: thresholds.speciesId,
    values,
    missing: [...thresholds.missing],
    overridden: [...thresholds.overridden],
    rules: { total: list.length, approved: list.length - draftRules, draft: draftRules, list },
    draftNote: draft
      ? 'Draft thresholds/rules metadata is present in the application. Current limits use saved user settings and approved defaults; draft recommendation rules are not activated. Historical entries retain their recorded classifications.'
      : null,
  };
}

export function buildStructuredSummary(input: SummaryInputs): StructuredSummary {
  const { period, now } = input;
  const effectiveEnd = Math.max(period.start, Math.min(period.end, now));
  const rows = input.readings.filter((row) => row.at >= period.start && row.at < period.end).sort((a, b) => a.at - b.at);
  const times = computeTimeInCondition(rows, input.priorReading, period.start, effectiveEnd);
  const maintenance = input.maintenance
    .filter((item) => item.performedAt >= period.start && item.performedAt < period.end)
    .sort((a, b) => a.performedAt - b.performedAt)
    .map((item) => ({
      id: item.id, performedAt: item.performedAt, type: item.type,
      by: item.performedByName ? `${item.performedByName}${item.performedByRole ? ` (${item.performedByRole})` : ''}` : null,
      waterChangePercent: item.waterChangePercent, notes: item.notes, recommendationId: item.recommendationId,
    }));
  return {
    version: 1,
    period: { type: period.type, start: period.start, end: period.end, effectiveEnd, label: period.label, timeZone: REPORT_TIME_ZONE },
    aquarium: { id: input.aquarium.id, name: input.aquarium.name, orgId: input.aquarium.orgId, orgName: input.aquarium.orgName },
    readings: computeReadingStats(rows),
    completeness: computeCompleteness(rows, input.alerts, period.start, effectiveEnd, input.aquarium.createdAt, times.covered),
    timeInCondition: { overall: times.overall, perParameter: times.perParameter },
    alerts: computeAlertSummary(input.alerts, period.start, period.end, effectiveEnd),
    recommendations: computeRecommendationSummary(input.recommendations, period.start, period.end),
    maintenance: { count: maintenance.length, items: maintenance, nextCleaning: nextCleaning(input.aquarium.cleaning, now) },
    devices: computeDeviceSummary(input.commands, input.alerts, period.start, period.end, effectiveEnd),
    thresholds: computeThresholdSummary(input.thresholds, input.rules),
  };
}

export function formatDuration(ms: number) {
  if (ms <= 0) return '0 min';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return rest ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} d ${restHours} h` : `${days} d`;
}

export function percentOf(part: number, whole: number) {
  return whole > 0 ? round((part / whole) * 100, 1) : 0;
}

/** The one-line `summary` string kept on monitoring_reports for older readers. */
export function summaryText(summary: StructuredSummary) {
  const span = summary.period.effectiveEnd - summary.period.start;
  const t = summary.timeInCondition.overall;
  const r = summary.recommendations;
  const name = summary.period.type.charAt(0).toUpperCase() + summary.period.type.slice(1);
  return [
    `${name} report ${summary.period.label}:`,
    `${summary.readings.rows} readings (${summary.completeness.completenessPct ?? 0}% complete).`,
    span > 0 ? `Condition: ${percentOf(t.normal, span)}% normal, ${percentOf(t.warning, span)}% warning, ${percentOf(t.critical, span)}% critical.` : '',
    `${summary.alerts.total} alert(s).`,
    `${r.generated} recommendation(s): ${r.applied} applied, ${r.dismissed} dismissed, ${r.pending} pending.`,
    summary.thresholds.draftNote ? 'Draft thresholds.' : '',
  ].filter(Boolean).join(' ');
}

// ---------------------------------------------------------------------------
// CSV of the raw valid readings
// ---------------------------------------------------------------------------
function csvCell(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '';
  const textValue = String(value);
  return /[",\n\r]/.test(textValue) || /^[=+\-@]/.test(textValue) ? `"${textValue.replaceAll('"', '""')}"` : textValue;
}

/** One row per sampled reading; a sensor that was not `valid` is left empty and named in invalid_sensors. */
export function readingsCsv(rows: ReadingRow[]) {
  const header = ['recorded_at_manila', 'recorded_at_epoch_ms', 'temperature_c', 'ph', 'tds_ppm', 'turbidity_ntu', 'water_level_percent', 'classification', 'invalid_or_missing_sensors'];
  const lines = [header.join(',')];
  for (const row of [...rows].sort((a, b) => a.at - b.at)) {
    if (!row.validity) continue; // unvalidated legacy rows are not "valid readings"
    const bad: string[] = [];
    const cell = (parameter: WaterParameter) => {
      if (row.validity?.[parameter] === 'valid' && row.values[parameter] !== undefined) return row.values[parameter];
      bad.push(VALIDITY_KEY[parameter]);
      return null;
    };
    const values = REPORT_WATER_PARAMETERS.map(cell);
    lines.push([manilaDateTime(row.at).replace(' ', 'T'), row.at, ...values, row.classification, bad.join(' ')].map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}
