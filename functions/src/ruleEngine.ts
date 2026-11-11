import { FieldValue, Timestamp, type DocumentReference, type Firestore, type Transaction } from 'firebase-admin/firestore';
import {
  computeCleaningSchedule,
  normalizeRuleConfig,
  normalizeSpeciesConfig,
  PARAMETER_LABELS,
  type AlertEntryState,
  type AlertOperation,
  type BioloadLevel,
  type CleaningReason,
  type CleaningSummary,
  type MatchedRule,
  type RuleConfig,
  type SpeciesConfig,
} from './shared/monitoringAssessmentCore.js';

// ---------------------------------------------------------------------------
// Rule config (Firestore `species` + `rules`), cached per function instance.
// Edits in Firestore apply within RULE_CONFIG_CACHE_MS, without a redeploy (FR13).
// ---------------------------------------------------------------------------
export const RULE_CONFIG_CACHE_MS = 5 * 60_000;

export type LoadedRuleConfig = { speciesById: Record<string, SpeciesConfig>; rules: RuleConfig[]; loadedAt: number };
let ruleConfigCache: LoadedRuleConfig | null = null;

export function clearRuleConfigCache() {
  ruleConfigCache = null;
}

export async function loadRuleConfig(firestore: Firestore, now: number): Promise<LoadedRuleConfig> {
  if (ruleConfigCache && now - ruleConfigCache.loadedAt < RULE_CONFIG_CACHE_MS && now >= ruleConfigCache.loadedAt) {
    return ruleConfigCache;
  }
  const [speciesSnap, rulesSnap] = await Promise.all([
    firestore.collection('species').get(),
    firestore.collection('rules').get(),
  ]);
  const speciesById: Record<string, SpeciesConfig> = {};
  for (const doc of speciesSnap.docs) {
    const config = normalizeSpeciesConfig(doc.id, doc.data());
    if (config) speciesById[doc.id] = config;
  }
  const rules = rulesSnap.docs.flatMap((doc) => {
    const rule = normalizeRuleConfig(doc.id, doc.data());
    return rule ? [rule] : [];
  });
  ruleConfigCache = { speciesById, rules, loadedAt: now };
  return ruleConfigCache;
}

// ---------------------------------------------------------------------------
// Engine state: aquariums/{id}/engine/state (functions only; clients denied).
// ---------------------------------------------------------------------------
export type CleaningState = {
  cycleStart: number | null;
  lastCleanedSource: 'maintenance_actions' | 'createdAt' | null;
  tdsBaselinePpm: number | null;
  lastTdsPpm: number | null;
  turbidityWarningTimes: number[];
  latched: { at: number; reason: Exclude<CleaningReason, 'interval'> } | null;
  earlyRecommendedForCycle: number | null;
  dueRecommendedForCycle: number | null;
};

export type EngineState = {
  entries: Record<string, AlertEntryState>;
  lastSignature: string | null;
  lastParameterStatus: Record<string, string>;
  /** Unknown/invalid readings do not end a turbidity episode. */
  lastValidTurbidityStatus: 'normal' | 'warning' | 'critical' | null;
  cleaning: CleaningState | null;
};

export function engineStateRef(firestore: Firestore, aquariumId: string) {
  return firestore.doc(`aquariums/${aquariumId}/engine/state`);
}

export function readEngineState(data: Record<string, unknown> | undefined): EngineState {
  return {
    entries: (data?.entries && typeof data.entries === 'object' ? data.entries : {}) as Record<string, AlertEntryState>,
    lastSignature: typeof data?.lastSignature === 'string' ? data.lastSignature : null,
    lastParameterStatus: (data?.lastParameterStatus && typeof data.lastParameterStatus === 'object'
      ? data.lastParameterStatus : {}) as Record<string, string>,
    lastValidTurbidityStatus: data?.lastValidTurbidityStatus === 'normal' ||
      data?.lastValidTurbidityStatus === 'warning' || data?.lastValidTurbidityStatus === 'critical'
      ? data.lastValidTurbidityStatus : null,
    cleaning: (data?.cleaning && typeof data.cleaning === 'object' ? data.cleaning : null) as CleaningState | null,
  };
}

// ---------------------------------------------------------------------------
// Applying planned alert operations (existing alert_records shape + Sprint 2 fields).
// ---------------------------------------------------------------------------
export type AlertContext = {
  aquariumId: string;
  ownerId: string;
  deviceId: string;
  now: number;
  readingSnapshot: Record<string, unknown> | null;
  thresholdSnapshot?: Record<string, unknown>;
};

function alertTitle(op: { parameter: string; severity: string; rule?: MatchedRule }) {
  return op.rule?.title ?? `${PARAMETER_LABELS[op.parameter as keyof typeof PARAMETER_LABELS]?.label ?? op.parameter} ${op.severity}`;
}

function alertMessage(op: { parameter: string; severity: string; rule?: MatchedRule }) {
  return op.rule?.issueDetected ?? `${alertTitle(op)} (no matching rule is configured).`;
}

export function recommendationDoc(ctx: AlertContext, rule: MatchedRule, alertId: string | null) {
  return {
    aquariumId: ctx.aquariumId,
    ownerId: ctx.ownerId,
    alertId,
    ruleId: rule.ruleId,
    ruleStatus: rule.approvalStatus,
    ruleSource: rule.source,
    parameter: rule.parameter,
    severity: rule.severity,
    title: rule.title,
    issueDetected: rule.issueDetected,
    action: rule.action,
    basis: rule.basis,
    preCheck: rule.preCheck,
    readingSnapshot: ctx.readingSnapshot,
    threshold: ctx.thresholdSnapshot?.[rule.parameter] ?? null,
    status: 'pending',
    createdAt: ctx.now,
    resolvedAt: null,
    resolvedBy: null,
  };
}

/** Read the recommendations an operation list may close, so the writes can skip ones a user already handled. */
export async function readClosableRecommendations(
  transaction: Transaction,
  firestore: Firestore,
  operations: AlertOperation[]
): Promise<Record<string, string | null>> {
  const ids = operations.flatMap((op) =>
    op.kind === 'resolve' && op.recommendationId ? [op.recommendationId]
      : (op.kind === 'escalate' || op.kind === 'change') && op.supersededRecommendationId ? [op.supersededRecommendationId]
        : []);
  if (ids.length === 0) return {};
  const refs = ids.map((id) => firestore.doc(`recommendations/${id}`));
  const snaps = await transaction.getAll(...refs);
  return Object.fromEntries(snaps.map((snap) => [snap.id, snap.exists ? (snap.get('status') as string) ?? null : null]));
}

export function applyAlertOperations(
  transaction: Transaction,
  firestore: Firestore,
  ctx: AlertContext,
  operations: AlertOperation[],
  recommendationStatus: Record<string, string | null>
) {
  const alertRef = (id: string) => firestore.doc(`alert_records/${id}`);
  const recRef = (id: string): DocumentReference => firestore.doc(`recommendations/${id}`);
  const closeIfPending = (id: string | null, extra: Record<string, unknown> = {}) => {
    if (id && recommendationStatus[id] === 'pending') {
      transaction.set(recRef(id), { status: 'resolved', resolvedAt: ctx.now, resolvedBy: 'system', ...extra }, { merge: true });
    }
  };
  for (const op of operations) {
    switch (op.kind) {
      case 'open':
        transaction.set(alertRef(op.alertId), {
          alert_id: op.alertId,
          aquarium_id: ctx.aquariumId,
          device_id: ctx.deviceId,
          type: alertTitle(op),
          message: alertMessage(op),
          severity: op.severity,
          isRead: false,
          status: 'active',
          triggered_at: Timestamp.fromMillis(ctx.now),
          resolved_at: null,
          ruleId: op.rule?.ruleId ?? null,
          recommendationId: op.recommendationId,
          parameter: op.parameter,
          dedupKey: `${ctx.aquariumId}:${op.key}`,
          occurrences: 1,
          lastSeenAt: ctx.now,
          ownerId: ctx.ownerId,
          // FCM is not implemented yet; a sender would pick up notifyRequestedAt.
          notifyRequestedAt: ctx.now,
          notificationCount: 1,
        });
        if (op.rule && op.recommendationId) {
          transaction.set(recRef(op.recommendationId), recommendationDoc(ctx, op.rule, op.alertId));
        }
        break;
      case 'escalate':
      case 'change':
        transaction.set(alertRef(op.alertId), {
          severity: op.severity,
          type: alertTitle(op),
          message: alertMessage(op),
          ruleId: op.rule?.ruleId ?? null,
          recommendationId: op.recommendationId,
          occurrences: FieldValue.increment(1),
          lastSeenAt: ctx.now,
          ...(op.notify ? { notifyRequestedAt: ctx.now, notificationCount: FieldValue.increment(1), escalatedAt: ctx.now } : {}),
        }, { merge: true });
        if (op.supersededRecommendationId || (op.recommendationId && op.rule)) {
          if (op.rule && op.recommendationId && op.recommendationId !== op.supersededRecommendationId) {
            transaction.set(recRef(op.recommendationId), recommendationDoc(ctx, op.rule, op.alertId));
          }
          closeIfPending(op.supersededRecommendationId, { supersededBy: op.recommendationId });
        }
        break;
      case 'touch':
        transaction.set(alertRef(op.alertId), { occurrences: FieldValue.increment(1), lastSeenAt: ctx.now }, { merge: true });
        break;
      case 'resolve':
        transaction.set(alertRef(op.alertId), {
          status: 'resolved',
          resolved_at: Timestamp.fromMillis(ctx.now),
          resolvedBy: 'system',
        }, { merge: true });
        closeIfPending(op.recommendationId);
        break;
      case 'suppressed':
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Cleaning schedule state machine (formula: docs/bioload.md).
// ---------------------------------------------------------------------------
export function emptyCleaningState(): CleaningState {
  return {
    cycleStart: null, lastCleanedSource: null, tdsBaselinePpm: null, lastTdsPpm: null,
    turbidityWarningTimes: [], latched: null, earlyRecommendedForCycle: null, dueRecommendedForCycle: null,
  };
}

export function readCreatedAt(aquarium: Record<string, unknown>): number | null {
  const value = aquarium.createdAt ?? aquarium.created_at;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (value instanceof Timestamp) return value.toMillis();
  return null;
}

export async function findLastCleaning(firestore: Firestore, aquariumId: string): Promise<number | null> {
  const snap = await firestore.collection('maintenance_actions')
    .where('aquariumId', '==', aquariumId)
    .where('actionType', '==', 'cleaning')
    .orderBy('performedAt', 'desc')
    .limit(1)
    .get();
  const performedAt = snap.docs[0]?.get('performedAt');
  return typeof performedAt === 'number' && Number.isFinite(performedAt) ? performedAt : null;
}

export type CleaningAdvance = {
  state: CleaningState;
  summary: CleaningSummary;
  recommend: 'cleaning_due' | 'cleaning_due_early' | null;
};

/**
 * One step of the cleaning schedule. `lastCleaned` (when given) starts a new
 * cycle if it differs from the stored one. `tdsPpm` is the current VALID TDS
 * reading (null if none); `turbidityEnteredWarning` is true when turbidity just
 * moved into WARNING or worse on this evaluation.
 */
export function advanceCleaning(input: {
  state: CleaningState | null;
  lastCleaned: { at: number; source: 'maintenance_actions' | 'createdAt' } | null;
  species: SpeciesConfig | null;
  bioloadLevel: BioloadLevel | null;
  now: number;
  tdsPpm: number | null;
  turbidityEnteredWarning: boolean;
}): CleaningAdvance {
  let state: CleaningState = { ...emptyCleaningState(), ...(input.state ?? {}) };
  if (input.lastCleaned && input.lastCleaned.at !== state.cycleStart) {
    state = { ...emptyCleaningState(), cycleStart: input.lastCleaned.at, lastCleanedSource: input.lastCleaned.source };
  }
  const early = input.species?.earlyCleaning;
  const windowMs = (early?.turbidityWindowHours ?? 0) * 60 * 60_000;
  if (input.turbidityEnteredWarning) state.turbidityWarningTimes = [...state.turbidityWarningTimes, input.now];
  state.turbidityWarningTimes = state.turbidityWarningTimes.filter((time) => time > input.now - windowMs);
  if (input.tdsPpm !== null) {
    state.lastTdsPpm = input.tdsPpm;
    if (state.tdsBaselinePpm === null) state.tdsBaselinePpm = input.tdsPpm;
  }

  const base = {
    lastCleanedAt: state.cycleStart,
    lastCleanedSource: state.lastCleanedSource,
    bioloadLevel: input.bioloadLevel,
    evaluatedAt: input.now,
  };
  if (!input.species || !early) {
    return { state, recommend: null, summary: { ...base, status: 'unavailable', nextCleaningDue: null, reason: 'no_species_config', intervalDays: null } };
  }
  const intervalDays = input.bioloadLevel ? input.species.cleaningIntervalDays?.[input.bioloadLevel] ?? null : null;
  if (!intervalDays || state.cycleStart === null) {
    return { state, recommend: null, summary: { ...base, status: 'unavailable', nextCleaningDue: null, reason: 'bioload_unknown', intervalDays: null } };
  }
  const schedule = computeCleaningSchedule({
    now: input.now,
    lastCleanedAt: state.cycleStart,
    intervalDays,
    tdsBaselinePpm: state.tdsBaselinePpm,
    currentTdsPpm: input.tdsPpm ?? state.lastTdsPpm,
    tdsRisePctLimit: early.tdsRisePct,
    turbidityWarningTimes: state.turbidityWarningTimes,
    turbidityWarningCount: early.turbidityWarningCount,
    turbidityWindowHours: early.turbidityWindowHours,
    latched: state.latched,
  });
  if (schedule.newTrigger) state.latched = schedule.newTrigger;
  let recommend: CleaningAdvance['recommend'] = null;
  if (schedule.early && state.earlyRecommendedForCycle !== state.cycleStart) {
    recommend = 'cleaning_due_early';
    state.earlyRecommendedForCycle = state.cycleStart;
  } else if (!schedule.early && schedule.due && state.dueRecommendedForCycle !== state.cycleStart) {
    recommend = 'cleaning_due';
    state.dueRecommendedForCycle = state.cycleStart;
  }
  return {
    state,
    recommend,
    summary: { ...base, status: 'scheduled', nextCleaningDue: schedule.nextCleaningDue, reason: schedule.reason, intervalDays },
  };
}

/** JSON with sorted keys: Firestore returns map keys in its own order, so plain JSON.stringify would always differ. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

/** True when the stored summary differs from the new one in anything but evaluatedAt. */
export function cleaningSummaryChanged(previous: unknown, next: CleaningSummary) {
  if (!previous || typeof previous !== 'object') return true;
  const strip = (value: Record<string, unknown>) => stableStringify({ ...value, evaluatedAt: 0 });
  return strip(previous as Record<string, unknown>) !== strip(next as unknown as Record<string, unknown>);
}

export function cleaningRecommendation(
  rules: RuleConfig[],
  ruleId: 'cleaning_due' | 'cleaning_due_early',
  summary: CleaningSummary
): MatchedRule | null {
  const rule = rules.find((candidate) => candidate.enabled && candidate.status === 'approved' && candidate.ruleId === ruleId);
  if (!rule) return null;
  const due = summary.nextCleaningDue ? new Date(summary.nextCleaningDue).toISOString() : 'now';
  const why = summary.reason === 'tds_rise' ? 'TDS rose since the first reading after the last cleaning'
    : summary.reason === 'turbidity_repeat' ? 'turbidity reached WARNING repeatedly within 24 hours'
      : `the ${summary.intervalDays}-day interval for a ${summary.bioloadLevel} bioload has passed`;
  return {
    ruleId: rule.ruleId,
    parameter: 'maintenance',
    severity: rule.severity,
    priority: rule.priority,
    title: rule.title,
    action: rule.action,
    basis: rule.basis,
    preCheck: rule.preCheck,
    issueDetected: `Cleaning due (${due}): ${why}.`,
    approvalStatus: rule.status,
    source: rule.source,
  };
}
