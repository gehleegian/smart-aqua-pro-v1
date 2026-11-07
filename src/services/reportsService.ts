import { FirebaseError } from 'firebase/app';
import { collection, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref } from 'firebase/storage';
import { db, functions, storage } from '../firebase';
import type { GeneratedReport, ReportType, StructuredReportSummary } from '../types/monitoringReport';

// FR21 (Sprint 5). Reports are generated server-side by the
// generateMonitoringReport callable (owners and assigned caretakers) and by the
// weekly/monthly schedules; the app only lists them and opens the files.
// Firestore and Storage rules decide who may read them.

function millis(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value && typeof value === 'object' && 'toMillis' in value && typeof (value as { toMillis: unknown }).toMillis === 'function') {
    return (value as { toMillis: () => number }).toMillis();
  }
  return null;
}

const text = (value: unknown) => (typeof value === 'string' ? value : '');

export function toGeneratedReport(id: string, data: Record<string, unknown>): GeneratedReport {
  const structured = data.structured_summary && typeof data.structured_summary === 'object'
    ? (data.structured_summary as StructuredReportSummary)
    : null;
  return {
    id,
    aquariumId: text(data.aquarium_id),
    orgId: typeof data.orgId === 'string' ? data.orgId : null,
    reportType: text(data.report_type) || 'custom',
    periodLabel: text(data.period_label) || structured?.period.label || '',
    startDate: millis(data.start_date),
    endDate: millis(data.end_date),
    generatedAt: millis(data.generated_at),
    generatedBy: text(data.generated_by),
    generatedByLabel: typeof data.generated_by_label === 'string' ? data.generated_by_label : null,
    summary: text(data.summary),
    structuredSummary: structured,
    pdfPath: typeof data.pdfPath === 'string' ? data.pdfPath : null,
    csvPath: typeof data.csvPath === 'string' ? data.csvPath : null,
  };
}

export async function listReports(aquariumId: string, max = 30): Promise<GeneratedReport[]> {
  const snapshot = await getDocs(query(
    collection(db, 'monitoring_reports'),
    where('aquarium_id', '==', aquariumId),
    orderBy('generated_at', 'desc'),
    limit(max),
  ));
  return snapshot.docs.map((docSnap) => toGeneratedReport(docSnap.id, docSnap.data()));
}

export type GenerateReportRequest = { aquariumId: string; reportType: ReportType; startDate: string; endDate?: string };

const ERRORS: Record<string, string> = {
  'functions/permission-denied': 'You can only create reports for aquariums you own or are assigned to.',
  'functions/invalid-argument': 'Check the period: dates must be real, not in the future, and a custom range covers at most 92 days.',
  'functions/failed-precondition': 'Reports are not available for this aquarium right now (the organization may be suspended).',
  'functions/unauthenticated': 'Your session has expired. Please sign in again.',
  'functions/deadline-exceeded': 'The report took too long. Try a shorter period.',
};

export async function generateReport(request: GenerateReportRequest) {
  try {
    const callable = httpsCallable<GenerateReportRequest, { reportId: string; summary: string }>(functions, 'generateMonitoringReport', { timeout: 130_000 });
    return (await callable(request)).data;
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    const detail = error instanceof FirebaseError && code === 'functions/invalid-argument' ? ` (${error.message})` : '';
    throw new Error((ERRORS[code] ?? 'The report could not be generated. Please try again.') + detail);
  }
}

/** A short-lived download link for a report file; Storage rules check access. */
export async function reportFileUrl(path: string) {
  try {
    return await getDownloadURL(ref(storage, path));
  } catch (error) {
    const code = error instanceof FirebaseError ? error.code : '';
    if (code === 'storage/unauthorized') throw new Error('You do not have access to this file.');
    if (code === 'storage/object-not-found') throw new Error('The file is missing. Generate the report again.');
    throw new Error('The file could not be opened. Please try again.');
  }
}
