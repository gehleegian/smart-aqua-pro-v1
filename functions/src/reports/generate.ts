// FR21: build a monitoring report for one aquarium and period, store the PDF
// and CSV in Firebase Storage and the summary in Firestore monitoring_reports.
// Called by the generateMonitoringReport callable (owners and assigned
// caretakers) and by the weekly/monthly schedules (index.ts).
import { Timestamp, type Firestore } from 'firebase-admin/firestore';
import { resolveLiveAquariumThresholds, selectSpeciesConfig } from '../shared/monitoringAssessmentCore.js';
import { loadRuleConfig } from '../ruleEngine.js';
import { requireAquariumMember, requireVerifiedActor, type Actor } from '../aquariumAccess.js';
import { MutationError } from '../trustedMutations.js';
import { renderReportPdf } from './pdf.js';
import {
  buildStructuredSummary,
  manilaDateKey,
  normalizeAlert,
  normalizeCommand,
  normalizeMaintenance,
  normalizeReading,
  normalizeRecommendation,
  previousPeriod,
  readingsCsv,
  REPORT_TYPES,
  resolvePeriod,
  summaryText,
  toMillis,
  type ReportPeriod,
  type ReportType,
  type StructuredSummary,
} from './summary.js';

/** The part of a Storage bucket the generator uses (firebase-admin Bucket satisfies it). */
export type ReportBucket = {
  name: string;
  file(path: string): { save(data: Buffer | string, options: { contentType: string; resumable?: boolean; metadata?: Record<string, unknown> }): Promise<unknown> };
};

export type ReportDependencies = { firestore: Firestore; bucket: ReportBucket; now?: () => number };

export type ReportResult = {
  reportId: string;
  aquariumId: string;
  orgId: string;
  pdfPath: string;
  csvPath: string;
  summary: string;
  structuredSummary: StructuredSummary;
};

export function reportStoragePath(orgId: string, aquariumId: string, reportId: string, extension: 'pdf' | 'csv') {
  return `reports/${orgId}/${aquariumId}/${reportId}.${extension}`;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

async function displayName(firestore: Firestore, uid: string) {
  const profile = await firestore.doc(`users/${uid}`).get();
  return (profile.get('name') as string | undefined) ?? (profile.get('full_name') as string | undefined) ?? 'a member';
}

/** Generates and stores one report. Access must already be checked by the caller. */
export async function generateReport(
  dependencies: ReportDependencies,
  aquariumId: string,
  period: ReportPeriod,
  generatedBy: { uid: string | null; label: string },
  options: { reportId?: string } = {}
): Promise<ReportResult> {
  const { firestore, bucket } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  const aquariumSnap = await firestore.doc(`aquariums/${aquariumId}`).get();
  if (!aquariumSnap.exists) throw new MutationError('not-found', 'Aquarium not found.');
  const aquarium = aquariumSnap.data() as Record<string, unknown>;
  const orgId = typeof aquarium.orgId === 'string' && SAFE_ID.test(aquarium.orgId) ? aquarium.orgId : null;
  if (!orgId) {
    throw new MutationError('failed-precondition', 'Reports are available once the aquarium belongs to an organization (docs/migration-live.md §7).');
  }

  const [orgSnap, config, readingsSnap, priorSnap, alertsSnap, recommendationsSnap, maintenanceSnap, commandsSnap] = await Promise.all([
    firestore.doc(`organizations/${orgId}`).get(),
    loadRuleConfig(firestore, now),
    firestore.collection('sensor_readings').where('aquariumId', '==', aquariumId)
      .where('recordedAtEpoch', '>=', period.start).where('recordedAtEpoch', '<', period.end)
      .orderBy('recordedAtEpoch', 'asc').get(),
    firestore.collection('sensor_readings').where('aquariumId', '==', aquariumId)
      .where('recordedAtEpoch', '<', period.start).orderBy('recordedAtEpoch', 'desc').limit(1).get(),
    // Alerts that started before the end; the ones resolved before the start are dropped below.
    firestore.collection('alert_records').where('aquarium_id', '==', aquariumId)
      .where('triggered_at', '<', Timestamp.fromMillis(period.end)).orderBy('triggered_at', 'desc').get(),
    firestore.collection('recommendations').where('aquariumId', '==', aquariumId)
      .where('createdAt', '>=', period.start).where('createdAt', '<', period.end).orderBy('createdAt', 'desc').get(),
    firestore.collection('maintenance_actions').where('aquariumId', '==', aquariumId)
      .where('performedAt', '>=', period.start).where('performedAt', '<', period.end).orderBy('performedAt', 'desc').get(),
    firestore.collection('command_logs').where('aquariumId', '==', aquariumId)
      .where('requestedAt', '>=', period.start).where('requestedAt', '<', period.end).orderBy('requestedAt', 'desc').get(),
  ]);

  const readings = readingsSnap.docs.flatMap((doc) => normalizeReading(doc.data()) ?? []);
  const prior = priorSnap.docs[0] ? normalizeReading(priorSnap.docs[0].data()) : null;
  const alerts = alertsSnap.docs
    .flatMap((doc) => normalizeAlert(doc.id, doc.data()) ?? [])
    .filter((alert) => alert.resolvedAt === null || alert.resolvedAt >= period.start);
  const species = selectSpeciesConfig(aquarium, config.speciesById);
  const thresholds = resolveLiveAquariumThresholds(aquarium, species);
  const aquariumName = typeof aquarium.name === 'string' && aquarium.name.trim() ? aquarium.name.trim() : aquariumId;

  const structuredSummary = buildStructuredSummary({
    period,
    now,
    aquarium: {
      id: aquariumId,
      name: aquariumName,
      orgId,
      orgName: (orgSnap.get('name') as string | undefined) ?? null,
      createdAt: toMillis(aquarium.createdAt ?? aquarium.created_at),
      cleaning: (aquarium.cleaning as Record<string, unknown> | undefined) ?? null,
    },
    readings,
    priorReading: prior,
    alerts,
    recommendations: recommendationsSnap.docs.flatMap((doc) => normalizeRecommendation(doc.id, doc.data()) ?? []),
    maintenance: maintenanceSnap.docs.flatMap((doc) => normalizeMaintenance(doc.id, doc.data()) ?? []),
    commands: commandsSnap.docs.flatMap((doc) => normalizeCommand(doc.id, doc.data()) ?? []),
    thresholds,
    rules: config.rules,
  });

  const reportRef = options.reportId
    ? firestore.doc(`monitoring_reports/${options.reportId}`)
    : firestore.collection('monitoring_reports').doc();
  const reportId = reportRef.id;
  const pdfPath = reportStoragePath(orgId, aquariumId, reportId, 'pdf');
  const csvPath = reportStoragePath(orgId, aquariumId, reportId, 'csv');
  const pdf = await renderReportPdf({ summary: structuredSummary, readings, generatedAt: now, generatedByLabel: generatedBy.label, reportId });
  const metadata = { metadata: { aquariumId, orgId, reportId } };
  await Promise.all([
    bucket.file(pdfPath).save(pdf, { contentType: 'application/pdf', resumable: false, metadata }),
    bucket.file(csvPath).save(readingsCsv(readings), { contentType: 'text/csv; charset=utf-8', resumable: false, metadata }),
  ]);

  const summary = summaryText(structuredSummary);
  // The existing monitoring_reports shape, plus orgId, the structured summary and the file paths.
  await reportRef.set({
    report_id: reportId,
    aquarium_id: aquariumId,
    report_type: period.type,
    start_date: Timestamp.fromMillis(period.start),
    end_date: Timestamp.fromMillis(period.end),
    generated_at: Timestamp.fromMillis(now),
    generated_by: generatedBy.uid ?? 'schedule',
    generated_by_label: generatedBy.label,
    summary,
    fileUrl: null,
    orgId,
    period_label: period.label,
    structured_summary: structuredSummary,
    pdfPath,
    csvPath,
    pdfBytes: pdf.length,
    storageBucket: bucket.name,
  });
  return { reportId, aquariumId, orgId, pdfPath, csvPath, summary, structuredSummary };
}

export type GenerateReportInput = { aquariumId: unknown; reportType: unknown; startDate: unknown; endDate?: unknown };

/** The callable's core: owners and assigned caretakers only (never trust the client's aquariumId alone). */
export async function generateReportForMember(dependencies: ReportDependencies, actor: Actor, input: GenerateReportInput) {
  requireVerifiedActor(actor);
  const aquariumId = typeof input.aquariumId === 'string' && SAFE_ID.test(input.aquariumId) ? input.aquariumId : null;
  if (!aquariumId) throw new MutationError('invalid-argument', 'Choose an aquarium.');
  const reportType = REPORT_TYPES.includes(input.reportType as ReportType) ? (input.reportType as ReportType) : null;
  if (!reportType) throw new MutationError('invalid-argument', 'Choose daily, weekly, monthly or custom.');
  await requireAquariumMember(dependencies.firestore, actor.uid, aquariumId);
  const now = dependencies.now?.() ?? Date.now();
  let period: ReportPeriod;
  try {
    const startDate = typeof input.startDate === 'string' && input.startDate ? input.startDate : manilaDateKey(now);
    period = resolvePeriod(reportType, startDate, typeof input.endDate === 'string' ? input.endDate : undefined);
  } catch (error) {
    throw new MutationError('invalid-argument', error instanceof Error ? error.message : 'Invalid period.');
  }
  if (period.start > now) throw new MutationError('invalid-argument', 'The period has not started yet.');
  const result = await generateReport(dependencies, aquariumId, period, { uid: actor.uid, label: await displayName(dependencies.firestore, actor.uid) });
  return { reportId: result.reportId, aquariumId, pdfPath: result.pdfPath, csvPath: result.csvPath, summary: result.summary };
}

/**
 * Scheduled: last week's (or last month's) report for every aquarium of an
 * active organization. Report IDs are deterministic, so a retried run
 * overwrites the same report instead of adding a second one.
 */
export async function generateScheduledReports(dependencies: ReportDependencies, type: 'weekly' | 'monthly') {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  const period = previousPeriod(type, now);
  const aquariums = await firestore.collection('aquariums').where('orgId', '!=', null).get();
  const orgStatus = new Map<string, boolean>();
  const result = { period: period.label, generated: 0, skipped: 0, failed: [] as string[] };
  for (const aquarium of aquariums.docs) {
    const orgId = aquarium.get('orgId') as string;
    if (!orgStatus.has(orgId)) orgStatus.set(orgId, (await firestore.doc(`organizations/${orgId}`).get()).get('status') === 'active');
    const createdAt = toMillis(aquarium.get('createdAt') ?? aquarium.get('created_at'));
    if (!orgStatus.get(orgId) || (createdAt !== null && createdAt >= period.end)) {
      result.skipped += 1;
      continue;
    }
    try {
      await generateReport(dependencies, aquarium.id, period, { uid: null, label: `the ${type} schedule` }, {
        reportId: `${aquarium.id}_${type}_${manilaDateKey(period.start)}`,
      });
      result.generated += 1;
    } catch (error) {
      result.failed.push(`${aquarium.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return result;
}
