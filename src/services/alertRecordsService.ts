import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { AlertCategory, AquariumAlert } from '../types/alerts';

// alert_records are created and resolved only by the Cloud Functions (rules
// engine: dedup, cooldown, auto-resolve). Clients read them and may only flip
// `isRead` (Firestore rules).

const PARAMETER_CATEGORY: Record<string, AlertCategory> = {
  temperatureC: 'temperature',
  ph: 'ph',
  tdsPpm: 'tds',
  turbidity: 'turbidity',
  waterLevelPercent: 'water_level',
  power: 'power_status',
  equipment: 'equipment_status',
  filter: 'filter_state',
  device: 'system',
};

function toMillis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof value.toMillis === 'function') {
    return value.toMillis() as number;
  }
  if (value instanceof Date) return value.getTime();
  return null;
}

export function mapAlertRecord(
  id: string,
  data: Record<string, unknown>,
  aquarium: { name: string; ownerName: string }
): AquariumAlert {
  const parameter = typeof data.parameter === 'string' ? data.parameter : '';
  const dedupKey = typeof data.dedupKey === 'string' ? data.dedupKey : '';
  const triggeredAt = toMillis(data.triggered_at) ?? 0;
  const resolved = data.status === 'resolved' || toMillis(data.resolved_at) !== null;
  return {
    id,
    fingerprint: dedupKey || id,
    aquariumId: typeof data.aquarium_id === 'string' ? data.aquarium_id : '',
    tankName: aquarium.name,
    ownerName: aquarium.ownerName,
    type: data.severity === 'critical' ? 'critical' : 'warning',
    category: dedupKey.includes(':sensor_fault:') ? 'system' : PARAMETER_CATEGORY[parameter] ?? 'system',
    message: typeof data.message === 'string' ? data.message : '',
    title: typeof data.type === 'string' ? data.type : undefined,
    firstDetectedAt: triggeredAt,
    lastDetectedAt: toMillis(data.lastSeenAt) ?? triggeredAt,
    resolvedAt: resolved ? toMillis(data.resolved_at) ?? triggeredAt : null,
    acknowledgedAt: data.isRead === true ? triggeredAt : null,
    occurrences: typeof data.occurrences === 'number' ? data.occurrences : 1,
    recommendationId: typeof data.recommendationId === 'string' ? data.recommendationId : null,
    ruleId: typeof data.ruleId === 'string' ? data.ruleId : null,
    origin: 'server',
  };
}

const ALERT_LIMIT = 50;

export function subscribeToAlertRecords(
  aquarium: { id: string; name: string; ownerName: string },
  onChange: (alerts: AquariumAlert[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(
      collection(db, 'alert_records'),
      where('aquarium_id', '==', aquarium.id),
      orderBy('lastSeenAt', 'desc'),
      limit(ALERT_LIMIT)
    ),
    (snapshot) => onChange(snapshot.docs.map((item) => mapAlertRecord(item.id, item.data(), aquarium))),
    (error) => {
      console.error(error);
      onError?.(error);
    }
  );
}

export async function markAlertRead(alertId: string) {
  await updateDoc(doc(db, 'alert_records', alertId), { isRead: true });
}
