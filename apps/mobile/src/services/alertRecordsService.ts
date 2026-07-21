import { doc, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { AquariumAlert } from '../types/alerts';
import type { AlertRecordDocument } from '../types/alertRecord';

const alertRecordWriteCache = new Map<string, string>();

function getAlertRecordType(alert: AquariumAlert) {
  if (alert.fingerprint.includes(':temperature:low')) {
    return 'Low Temperature';
  }

  if (alert.fingerprint.includes(':temperature:high')) {
    return 'High Temperature';
  }

  if (alert.fingerprint.includes(':water_level:low')) {
    return 'Low Water Level';
  }

  if (alert.fingerprint.includes(':water_quality:low')) {
    return 'Water Quality';
  }

  if (alert.fingerprint.includes(':system:offline')) {
    return 'Power Interruption';
  }

  if (alert.fingerprint.includes(':system:no_live_data')) {
    return 'No Live Data';
  }

  return alert.category.replaceAll('_', ' ');
}

function buildAlertRecordDocument(alert: AquariumAlert): AlertRecordDocument {
  return {
    alert_id: alert.id,
    aquarium_id: alert.aquariumId,
    device_id: alert.aquariumId,
    type: getAlertRecordType(alert),
    message: alert.message,
    severity: alert.type,
    isRead: Boolean(alert.acknowledgedAt),
    triggered_at: new Date(alert.firstDetectedAt),
    resolved_at: alert.resolvedAt ? new Date(alert.resolvedAt) : null,
  };
}

function buildRecordSignature(record: AlertRecordDocument) {
  return JSON.stringify({
    type: record.type,
    message: record.message,
    severity: record.severity,
    isRead: record.isRead,
    triggered_at: record.triggered_at.getTime(),
    resolved_at: record.resolved_at?.getTime() ?? null,
  });
}

export async function syncAlertRecords(alerts: AquariumAlert[]) {
  const batch = writeBatch(db);
  let pendingWrites = 0;

  for (const alert of alerts) {
    const record = buildAlertRecordDocument(alert);
    const signature = buildRecordSignature(record);

    if (alertRecordWriteCache.get(record.alert_id) === signature) {
      continue;
    }

    alertRecordWriteCache.set(record.alert_id, signature);
    batch.set(doc(db, 'alert_records', record.alert_id), record, { merge: true });
    pendingWrites += 1;
  }

  if (pendingWrites === 0) {
    return;
  }

  await batch.commit();
}
