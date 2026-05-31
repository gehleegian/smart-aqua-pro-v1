import { collection, doc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { db } from '../firebase';
import type { MonitoringReportDocument } from '../types/monitoringReport';

type CreateMonitoringReportOptions = Omit<MonitoringReportDocument, 'report_id'>;

type AlertRecordSummary = {
  total: number;
  critical: number;
  warning: number;
  resolved: number;
  active: number;
};

function readFirestoreDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return value;
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate() as Date;
  }

  return null;
}

export async function getAlertRecordSummaryForRange(
  aquariumId: string,
  startDate: Date,
  endDate: Date
): Promise<AlertRecordSummary> {
  const snapshot = await getDocs(
    query(collection(db, 'alert_records'), where('aquarium_id', '==', aquariumId))
  );
  const summary: AlertRecordSummary = {
    total: 0,
    critical: 0,
    warning: 0,
    resolved: 0,
    active: 0,
  };

  snapshot.docs.forEach((docSnap) => {
    const alert = docSnap.data() as Record<string, unknown>;
    const triggeredAt = readFirestoreDate(alert.triggered_at);

    if (!triggeredAt || triggeredAt < startDate || triggeredAt > endDate) {
      return;
    }

    const resolvedAt = readFirestoreDate(alert.resolved_at);
    const severity = typeof alert.severity === 'string' ? alert.severity : '';

    summary.total += 1;
    summary.critical += severity === 'critical' ? 1 : 0;
    summary.warning += severity === 'warning' ? 1 : 0;
    summary.resolved += resolvedAt ? 1 : 0;
    summary.active += resolvedAt ? 0 : 1;
  });

  return summary;
}

export async function createMonitoringReport(
  options: CreateMonitoringReportOptions
): Promise<string> {
  const reportRef = doc(collection(db, 'monitoring_reports'));
  const report: MonitoringReportDocument = {
    report_id: reportRef.id,
    ...options,
  };

  await setDoc(reportRef, report);
  return reportRef.id;
}
