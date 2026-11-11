import type { Firestore } from 'firebase-admin/firestore';
import {
  buildAlertFindings,
  computeBioload,
  conditionSignature,
  evaluateAquarium,
  planAlertChanges,
  assessmentConfigurationKey,
  resolveLiveAquariumThresholds,
  readTurbidityVoltage,
  selectSpeciesConfig,
  TELEMETRY_STALE_MS,
  TELEMETRY_EPOCH_FLOOR,
  toConditionSummary,
  type ConditionSeverity,
  type EngineResult,
  type TelemetryValidity,
} from './shared/monitoringAssessmentCore.js';
import { evaluateTelemetryValidity } from './shared/monitoringAssessmentCore.js';
import { withWaterLevelProfile, type LevelProfileInput } from './shared/waterLevelProfile.js';
import {
  advanceCleaning,
  applyAlertOperations,
  cleaningRecommendation,
  cleaningSummaryChanged,
  engineStateRef,
  findLastCleaning,
  loadRuleConfig,
  readClosableRecommendations,
  readCreatedAt,
  readEngineState,
  recommendationDoc,
  stableStringify,
} from './ruleEngine.js';

// Device contract decision 6 (docs/device-contract.md) plus the Sprint 2 rules
// engine (docs/rule-engine.md). On every telemetry write:
//   validate -> evaluate (Firestore thresholds + rules) -> reconcile alerts and
//   recommendations (dedup / cooldown / auto-resolve) -> sampled history ->
//   condition summary on the aquarium doc -> cleaning schedule.
// Firestore is written only when something changes. History: at most one row
// every HISTORY_SAMPLE_INTERVAL_MS, plus an immediate row whenever any
// per-parameter classification changes.
export const HISTORY_SAMPLE_INTERVAL_MS = 5 * 60_000;
// dateKey / recordedAt / time keys use the project's local time, matching the
// existing history rows (local ISO string, no offset).
export const HISTORY_TIME_ZONE = 'Asia/Manila';
// Reject device clocks far in the future (legacy firmware writes its own clock).
const TELEMETRY_FIELDS = [
  'temperatureC', 'temperatureReadingValid', 'waterLevelPercent', 'waterPresent',
  'waterLevelReadingValid', 'waterLevelTargetHeightCm',
  'tdsPpm', 'tdsPercent', 'tdsReadingValid', 'turbidity', 'turbidityReadingValid',
  'turbidityState', 'turbidityVoltage', 'ph', 'phReadingValid', 'filterState', 'lightState',
  'equipmentStatus', 'powerStatus', 'mainsPresent', 'online',
] as const;

export type IngestDependencies = {
  firestore: Firestore;
  now?: () => number;
};

export type IngestSkipReason =
  | 'malformed'
  | 'timestamp_out_of_range'
  | 'stale_or_offline'
  | 'unknown_aquarium'
  | 'out_of_order';

export type SampleReason = 'first_of_day' | 'interval' | 'classification_change';

export type IngestResult =
  | {
    ingested: true;
    /** A history row was written. */
    written: boolean;
    docId: string | null;
    sampleReason: SampleReason | null;
    classification: ConditionSeverity | 'unavailable';
    alertOperations: string[];
    recommendationsCreated: number;
    firestoreWrites: number;
  }
  | { ingested: false; written: false; reason: IngestSkipReason };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function localParts(epochMs: number) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: HISTORY_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(epochMs));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  const dateKey = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  return { dateKey, recordedAt: `${dateKey}T${time}`, timeKey: time.replaceAll(':', '-') };
}

function summarizeValidity(validity: TelemetryValidity) {
  const sensors = ['temperature', 'ph', 'tds', 'turbidity', 'waterLevel'] as const;
  const summary: Record<string, unknown> = { allValid: validity.allValid };
  const invalidReasons: Record<string, string> = {};
  for (const sensor of sensors) {
    summary[sensor] = validity[sensor].status;
    const reason = validity[sensor].reason;
    if (validity[sensor].status === 'invalid' && reason) invalidReasons[sensor] = reason;
  }
  if (Object.keys(invalidReasons).length > 0) summary.invalidReasons = invalidReasons;
  return summary;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function pickTelemetry(raw: Record<string, unknown>) {
  return Object.fromEntries(
    TELEMETRY_FIELDS.filter((field) => raw[field] !== undefined && raw[field] !== null &&
      (field !== 'turbidityVoltage' || readTurbidityVoltage(raw[field]) !== undefined))
      .map((field) => [field, raw[field]])
  );
}

function statusOf(result: EngineResult, parameter: string) {
  return result.perParameter.find((item) => item.parameter === parameter)?.status;
}

export async function ingestTelemetry(
  dependencies: IngestDependencies,
  aquariumId: string,
  raw: unknown,
  previousRaw?: unknown
): Promise<IngestResult> {
  const now = dependencies.now?.() ?? Date.now();
  if (!isRecord(raw) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) {
    return { ingested: false, written: false, reason: 'malformed' };
  }
  const recordedAtEpoch = raw.updatedAt;
  const previousRecordedAt = isRecord(previousRaw) &&
    typeof previousRaw.updatedAt === 'number' && Number.isFinite(previousRaw.updatedAt)
    ? previousRaw.updatedAt
    : null;
  // RTDB `telemetry` is a latest-value node. The trigger supplies the value
  // that this write replaced, allowing duplicate/backward device writes to be
  // rejected without adding a Firestore write for every normal 15 s sample.
  if (previousRecordedAt !== null && recordedAtEpoch <= previousRecordedAt) {
    return { ingested: false, written: false, reason: 'out_of_order' };
  }
  // Keep server evaluation aligned with the web freshness contract: a future
  // sample is unavailable, not a current water condition. Repository firmware
  // uses the RTDB server timestamp, so valid writes do not require clock-skew
  // tolerance here.
  if (recordedAtEpoch < TELEMETRY_EPOCH_FLOOR || recordedAtEpoch > now) {
    return { ingested: false, written: false, reason: 'timestamp_out_of_range' };
  }
  // A latest-value write that is already stale, or explicitly says the device
  // is offline, is a connectivity event rather than a current water reading.
  // The scheduled heartbeat owns the offline alert lifecycle. Never let this
  // payload create water-condition advice or resolve an active offline alert.
  if (raw.online === false || now - recordedAtEpoch > TELEMETRY_STALE_MS) {
    return { ingested: false, written: false, reason: 'stale_or_offline' };
  }

  const { firestore } = dependencies;
  const aquariumRef = firestore.doc(`aquariums/${aquariumId}`);
  const aquarium = (await aquariumRef.get()).data();
  const ownerId = readString(aquarium?.ownerId);
  if (!aquarium || !ownerId) {
    return { ingested: false, written: false, reason: 'unknown_aquarium' };
  }

  // 1. Validate (AGENTS.md §5) and evaluate against the Firestore thresholds and rules.
  const config = await loadRuleConfig(firestore, now);
  const configuredSpecies = selectSpeciesConfig(aquarium, config.speciesById);
  const enabledRules = config.rules.filter((rule) => rule.enabled);
  const ruleSetApproved = enabledRules.length > 0 && enabledRules.every((rule) => rule.status === 'approved');
  // Draft rules and species bioload/cleaning bands stay inactive. Saved aquarium
  // limits classify valid readings independently of recommendation approval.
  const species = configuredSpecies?.status === 'approved' ? configuredSpecies : null;
  const approvedRules = config.rules.filter((rule) => rule.enabled && rule.status === 'approved');
  const thresholds = resolveLiveAquariumThresholds(aquarium, configuredSpecies);
  const configurationKey = assessmentConfigurationKey(thresholds, config.rules);
  const bioload = computeBioload(aquarium, species?.bioloadBandsGPerL);
  const checkedReading = withWaterLevelProfile(aquarium as LevelProfileInput, raw);
  const validity = evaluateTelemetryValidity(checkedReading);
  const evaluated = evaluateAquarium(checkedReading, thresholds, approvedRules, {
    hasFiltrationSystem: typeof aquarium.hasFiltrationSystem === 'boolean' ? aquarium.hasFiltrationSystem : undefined,
    bioloadLevel: bioload?.level ?? null,
    fishCount: typeof aquarium.fishCount === 'number' ? aquarium.fishCount : undefined,
  });
  const result = { ...evaluated, draft: evaluated.draft || !ruleSetApproved };
  const signature = `${conditionSignature(result)}|config=${configurationKey}`;
  const classification = result.overall;

  const { dateKey, recordedAt, timeKey } = localParts(recordedAtEpoch);
  const docId = `${aquariumId}_${dateKey}_${recordedAtEpoch}`;
  const dayRef = firestore.doc(`aquariums/${aquariumId}/sensor_readings/${dateKey}`);
  const stateRef = engineStateRef(firestore, aquariumId);
  const deviceId = readString(aquarium.deviceUid) ?? aquariumId;
  const ownerName = readString(aquarium.ownerName);
  const telemetry = pickTelemetry(checkedReading);

  // The first evaluation of a cleaning cycle needs the last logged cleaning.
  const preState = readEngineState((await stateRef.get()).data());
  let lastCleaned: { at: number; source: 'maintenance_actions' | 'createdAt' } | null = null;
  if (!preState.cleaning?.cycleStart) {
    const logged = await findLastCleaning(firestore, aquariumId);
    const created = readCreatedAt(aquarium);
    lastCleaned = logged !== null ? { at: logged, source: 'maintenance_actions' } : created !== null ? { at: created, source: 'createdAt' } : null;
  }

  return firestore.runTransaction(async (transaction) => {
    const [daySnap, stateSnap] = await transaction.getAll(dayRef, stateRef);
    const day = daySnap.data();
    const state = readEngineState(stateSnap.data());
    const lastEpoch = typeof day?.lastRecordedAtEpoch === 'number' ? day.lastRecordedAtEpoch : null;
    if (lastEpoch !== null && recordedAtEpoch <= lastEpoch) {
      return { ingested: false, written: false, reason: 'out_of_order' } as const;
    }

    // 2. Alerts: dedup per aquarium + parameter; device_offline resolves on fresh data.
    const findings = [
      ...buildAlertFindings(result),
      { key: 'device', parameter: 'device' as const, state: 'normal' as const },
    ];
    const plan = planAlertChanges({
      aquariumId,
      entries: state.entries,
      findings,
      now,
      resolveAfter: (key) => (key === 'device' ? 1 : 3),
    });

    // 3. History sampling (Sprint 1), now keyed on the per-parameter signature.
    let sampleReason: SampleReason | null = null;
    if (lastEpoch === null) sampleReason = 'first_of_day';
    else if (state.lastSignature !== null && state.lastSignature !== signature) sampleReason = 'classification_change';
    else if (recordedAtEpoch - lastEpoch >= HISTORY_SAMPLE_INTERVAL_MS) sampleReason = 'interval';

    // 4. Cleaning schedule.
    const turbidityNow = statusOf(result, 'turbidity');
    const abnormal = (status?: string) => status === 'warning' || status === 'critical';
    const previousStatus = state.lastParameterStatus.turbidity;
    // Legacy entries may lack last-valid state. A recorded episode plus an
    // unknown previous reading is not evidence that the water became Normal.
    const turbidityBefore = state.lastValidTurbidityStatus ??
      (previousStatus === 'normal' || abnormal(previousStatus) ? previousStatus :
        state.cleaning?.turbidityWarningTimes.length ? 'warning' : undefined);
    const lastValidTurbidityStatus = turbidityNow === 'normal' || turbidityNow === 'warning' || turbidityNow === 'critical'
      ? turbidityNow : turbidityBefore === 'normal' || turbidityBefore === 'warning' || turbidityBefore === 'critical'
        ? turbidityBefore : null;
    const tdsValid = statusOf(result, 'tdsPpm');
    const cleaning = advanceCleaning({
      state: state.cleaning,
      lastCleaned,
      species,
      bioloadLevel: bioload?.level ?? null,
      now,
      tdsPpm: tdsValid === 'normal' || tdsValid === 'warning' || tdsValid === 'critical' ? raw.tdsPpm as number : null,
      turbidityEnteredWarning: abnormal(turbidityNow) && !abnormal(turbidityBefore),
    });
    const cleaningChanged = stableStringify(cleaning.state) !== stableStringify(state.cleaning);
    const writeCleaningSummary = cleaningSummaryChanged(aquarium.cleaning, cleaning.summary);

    const recommendationStatus = await readClosableRecommendations(transaction, firestore, plan.operations);

    // ---- writes (only what changed) ----
    let firestoreWrites = 0;
    const ctx = {
      aquariumId,
      ownerId,
      deviceId,
      now,
      readingSnapshot: { ...telemetry, updatedAt: recordedAtEpoch },
      thresholdSnapshot: thresholds.values as Record<string, unknown>,
    };
    applyAlertOperations(transaction, firestore, ctx, plan.operations, recommendationStatus);
    let recommendationsCreated = 0;
    for (const op of plan.operations) {
      if (op.kind === 'suppressed') continue;
      firestoreWrites += 1;
      if ((op.kind === 'open' || op.kind === 'escalate' || op.kind === 'change') && op.rule && op.recommendationId &&
        (op.kind === 'open' || op.recommendationId !== op.supersededRecommendationId)) {
        recommendationsCreated += 1;
        firestoreWrites += 1;
      }
      if ((op.kind === 'resolve' && op.recommendationId && recommendationStatus[op.recommendationId] === 'pending') ||
        ((op.kind === 'escalate' || op.kind === 'change') && op.supersededRecommendationId &&
          recommendationStatus[op.supersededRecommendationId] === 'pending')) {
        firestoreWrites += 1;
      }
    }

    if (cleaning.recommend) {
      const rule = cleaningRecommendation(approvedRules, cleaning.recommend, cleaning.summary);
      if (rule) {
        transaction.set(firestore.doc(`recommendations/${aquariumId}_${cleaning.recommend}_${now}`), recommendationDoc(ctx, rule, null));
        recommendationsCreated += 1;
        firestoreWrites += 1;
      }
    }

    if (sampleReason) {
      const reading = {
        ...telemetry,
        aquariumId,
        ownerId,
        ...(ownerName ? { ownerName } : {}),
        deviceUid: deviceId,
        source: 'device',
        dateKey,
        recordedAt,
        recordedAtEpoch,
        ingestedAtEpoch: now,
        sampleReason,
        classification,
        // Per-parameter status at ingest time (FR21 reports: time in condition per parameter).
        parameterStatus: Object.fromEntries(result.perParameter
          .filter((item) => item.parameter !== 'device' && item.parameter !== 'maintenance')
          .map((item) => [item.parameter, item.status])),
        validity: summarizeValidity(validity),
        matchedRuleIds: result.matchedRules.map((rule) => rule.ruleId),
        thresholdSnapshot: {
          speciesId: thresholds.speciesId,
          status: thresholds.status,
          values: thresholds.values,
          overridden: thresholds.overridden,
        },
        reading_id: docId,
      };
      transaction.set(firestore.doc(`sensor_readings/${docId}`), reading);
      transaction.set(dayRef.collection('readings').doc(timeKey), reading);
      transaction.set(dayRef, {
        aquariumId,
        ownerId,
        ...(ownerName ? { ownerName } : {}),
        dateKey,
        lastRecordedAtEpoch: recordedAtEpoch,
        lastClassification: classification,
        lastSignature: signature,
        lastRuleVersion: result.draft ? 'rules:draft' : 'rules:approved',
        updatedAtEpoch: now,
      }, { merge: true });
      firestoreWrites += 3;
    }

    const aquariumUpdate: Record<string, unknown> = {};
    if (sampleReason) {
      aquariumUpdate.condition = {
        ...toConditionSummary(result, now, recordedAtEpoch, configurationKey),
        ...(validity.waterLevel.status === 'valid' && typeof checkedReading.waterLevelTargetHeightCm === 'number'
          ? { waterLevelTargetHeightCm: checkedReading.waterLevelTargetHeightCm } : {}),
      };
    }
    if (writeCleaningSummary) aquariumUpdate.cleaning = cleaning.summary;
    if ((bioload?.level ?? null) !== (aquarium.bioloadLevel ?? null)) aquariumUpdate.bioloadLevel = bioload?.level ?? null;
    if (Object.keys(aquariumUpdate).length > 0) {
      transaction.set(aquariumRef, aquariumUpdate, { merge: true });
      firestoreWrites += 1;
    }

    if (plan.changed || sampleReason || cleaningChanged) {
      transaction.set(stateRef, {
        aquariumId,
        entries: plan.entries,
        lastSignature: signature,
        lastParameterStatus: Object.fromEntries(result.perParameter.map((item) => [item.parameter, item.status])),
        lastValidTurbidityStatus,
        cleaning: cleaning.state,
        updatedAt: now,
      });
      firestoreWrites += 1;
    }

    return {
      ingested: true,
      written: sampleReason !== null,
      docId: sampleReason ? docId : null,
      sampleReason,
      classification,
      alertOperations: plan.operations.map((op) => `${op.kind}:${op.key}`),
      recommendationsCreated,
      firestoreWrites,
    } as const;
  });
}
