import type { Firestore } from 'firebase-admin/firestore';
import {
  assessAquariumCondition,
  buildAssessmentTelemetryFromRaw,
  evaluateTelemetryValidity,
  MONITORING_RULE_VERSION,
  TELEMETRY_EPOCH_FLOOR,
  type AssessmentSeverity,
  type TelemetryValidity,
} from './shared/monitoringAssessmentCore.js';

// Device contract decision 6 (docs/device-contract.md): sampled history.
// At most one row every HISTORY_SAMPLE_INTERVAL_MS per aquarium, plus an
// immediate row whenever the classification changes. Clients and devices never
// write history; only this trusted function does.
export const HISTORY_SAMPLE_INTERVAL_MS = 5 * 60_000;
// dateKey / recordedAt / time keys use the project's local time, matching the
// existing history rows (local ISO string, no offset).
export const HISTORY_TIME_ZONE = 'Asia/Manila';
// Reject device clocks far in the future (legacy firmware writes its own clock).
export const MAX_FUTURE_SKEW_MS = 5 * 60_000;

const TELEMETRY_FIELDS = [
  'temperatureC', 'temperatureReadingValid', 'waterLevelPercent', 'waterPresent',
  'tdsPpm', 'tdsPercent', 'tdsReadingValid', 'turbidity', 'turbidityReadingValid',
  'ph', 'phReadingValid', 'filterState', 'equipmentStatus', 'powerStatus', 'online',
] as const;

export type IngestDependencies = {
  firestore: Firestore;
  now?: () => number;
};

export type IngestSkipReason =
  | 'malformed'
  | 'timestamp_out_of_range'
  | 'unknown_aquarium'
  | 'out_of_order'
  | 'rate_limited';

export type IngestResult =
  | { written: true; docId: string; sampleReason: 'first_of_day' | 'interval' | 'classification_change'; classification: AssessmentSeverity }
  | { written: false; reason: IngestSkipReason };

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

export async function ingestTelemetry(
  dependencies: IngestDependencies,
  aquariumId: string,
  raw: unknown
): Promise<IngestResult> {
  const now = dependencies.now?.() ?? Date.now();
  if (!isRecord(raw) || typeof raw.updatedAt !== 'number' || !Number.isFinite(raw.updatedAt)) {
    return { written: false, reason: 'malformed' };
  }
  const recordedAtEpoch = raw.updatedAt;
  if (recordedAtEpoch < TELEMETRY_EPOCH_FLOOR || recordedAtEpoch > now + MAX_FUTURE_SKEW_MS) {
    return { written: false, reason: 'timestamp_out_of_range' };
  }

  const { firestore } = dependencies;
  const aquariumSnap = await firestore.doc(`aquariums/${aquariumId}`).get();
  const aquarium = aquariumSnap.data();
  const ownerId = readString(aquarium?.ownerId);
  if (!aquarium || !ownerId) {
    return { written: false, reason: 'unknown_aquarium' };
  }

  // Validate first (AGENTS.md §5); only valid sensors reach classification.
  const validity = evaluateTelemetryValidity(raw);
  const assessment = assessAquariumCondition({
    profile: aquarium,
    telemetry: buildAssessmentTelemetryFromRaw(raw, validity),
    source: 'live',
    assessedAt: recordedAtEpoch,
  });
  const classification = assessment.overallSeverity;

  const { dateKey, recordedAt, timeKey } = localParts(recordedAtEpoch);
  const docId = `${aquariumId}_${dateKey}_${recordedAtEpoch}`;
  const dayRef = firestore.doc(`aquariums/${aquariumId}/sensor_readings/${dateKey}`);
  const flatRef = firestore.doc(`sensor_readings/${docId}`);
  const nestedRef = dayRef.collection('readings').doc(timeKey);

  return firestore.runTransaction(async (transaction) => {
    const day = (await transaction.get(dayRef)).data();
    const lastEpoch = typeof day?.lastRecordedAtEpoch === 'number' ? day.lastRecordedAtEpoch : null;
    const lastClassification = typeof day?.lastClassification === 'string' ? day.lastClassification : null;

    let sampleReason: 'first_of_day' | 'interval' | 'classification_change';
    if (lastEpoch === null) {
      sampleReason = 'first_of_day';
    } else if (recordedAtEpoch <= lastEpoch) {
      return { written: false, reason: 'out_of_order' } as const;
    } else if (lastClassification !== null && lastClassification !== classification) {
      sampleReason = 'classification_change';
    } else if (recordedAtEpoch - lastEpoch >= HISTORY_SAMPLE_INTERVAL_MS) {
      sampleReason = 'interval';
    } else {
      return { written: false, reason: 'rate_limited' } as const;
    }

    const telemetry = Object.fromEntries(
      TELEMETRY_FIELDS.filter((field) => raw[field] !== undefined && raw[field] !== null)
        .map((field) => [field, raw[field]])
    );
    const ownerName = readString(aquarium.ownerName);
    const deviceUid = readString(aquarium.deviceUid);
    const reading = {
      ...telemetry,
      aquariumId,
      ownerId,
      ...(ownerName ? { ownerName } : {}),
      ...(deviceUid ? { deviceUid } : {}),
      source: 'device',
      dateKey,
      recordedAt,
      recordedAtEpoch,
      ingestedAtEpoch: now,
      sampleReason,
      validity: summarizeValidity(validity),
      reading_id: docId,
    };

    transaction.set(flatRef, reading);
    transaction.set(nestedRef, reading);
    transaction.set(dayRef, {
      aquariumId,
      ownerId,
      ...(ownerName ? { ownerName } : {}),
      dateKey,
      lastRecordedAtEpoch: recordedAtEpoch,
      lastClassification: classification,
      lastRuleVersion: MONITORING_RULE_VERSION,
      updatedAtEpoch: now,
    }, { merge: true });

    return { written: true, docId, sampleReason, classification } as const;
  });
}
