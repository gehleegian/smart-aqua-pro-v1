import type { Database } from 'firebase-admin/database';
import type { Firestore } from 'firebase-admin/firestore';
import {
  buildAlertFindings,
  computeBioload,
  evaluateAquarium,
  getTelemetryFreshness,
  planAlertChanges,
  resolveThresholds,
  selectSpeciesConfig,
} from './shared/monitoringAssessmentCore.js';
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

export type ScheduledDependencies = { firestore: Firestore; database: Database; now?: () => number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Every minute: a device whose telemetry `updatedAt` is older than the 60 s
 * offline window gets one deduped `device_offline` alert; it resolves on the
 * first fresh check (or on the next telemetry write, in the ingest function).
 * Aquariums that never reported telemetry are skipped. Writes happen only on
 * a state change.
 */
export async function checkDeviceHeartbeats(dependencies: ScheduledDependencies) {
  const now = dependencies.now?.() ?? Date.now();
  const { firestore, database } = dependencies;
  const authorization = (await database.ref('authorization/aquariums').get()).val();
  const summary = { checked: 0, offline: 0, opened: 0, resolved: 0, skipped: 0 };
  if (!isRecord(authorization)) return summary;
  const config = await loadRuleConfig(firestore, now);

  for (const [aquariumId, entry] of Object.entries(authorization)) {
    if (!isRecord(entry) || entry.state !== 'active' || !isRecord(entry.deviceUids) || Object.keys(entry.deviceUids).length === 0) {
      continue;
    }
    const telemetry = (await database.ref(`devices/${aquariumId}/telemetry`).get()).val();
    const freshness = isRecord(telemetry) ? getTelemetryFreshness(telemetry as { updatedAt?: number; online?: boolean }, now) : 'unavailable';
    if (freshness === 'unavailable') {
      summary.skipped += 1;
      continue;
    }
    summary.checked += 1;
    const deviceState = freshness === 'live' ? 'online' : 'offline';
    if (deviceState === 'offline') summary.offline += 1;
    const result = evaluateAquarium(null, resolveThresholds(null), config.rules, { deviceState });
    const findings = buildAlertFindings(result).filter((finding) => finding.key === 'device');
    const stateRef = engineStateRef(firestore, aquariumId);

    await firestore.runTransaction(async (transaction) => {
      const state = readEngineState((await transaction.get(stateRef)).data());
      const plan = planAlertChanges({ aquariumId, entries: state.entries, findings, now, resolveAfter: () => 1 });
      if (!plan.changed) return;
      const aquarium = (await transaction.get(firestore.doc(`aquariums/${aquariumId}`))).data() ?? {};
      const recommendationStatus = await readClosableRecommendations(transaction, firestore, plan.operations);
      applyAlertOperations(transaction, firestore, {
        aquariumId,
        ownerId: typeof aquarium.ownerId === 'string' ? aquarium.ownerId : typeof entry.ownerUid === 'string' ? entry.ownerUid : '',
        deviceId: typeof aquarium.deviceUid === 'string' ? aquarium.deviceUid : Object.keys(entry.deviceUids as object)[0] ?? aquariumId,
        now,
        readingSnapshot: isRecord(telemetry) ? { updatedAt: telemetry.updatedAt ?? null, online: telemetry.online ?? null } : null,
      }, plan.operations, recommendationStatus);
      transaction.set(stateRef, { aquariumId, entries: plan.entries, updatedAt: now }, { merge: true });
      for (const op of plan.operations) {
        if (op.kind === 'open') summary.opened += 1;
        if (op.kind === 'resolve') summary.resolved += 1;
      }
    });
  }
  return summary;
}

/**
 * Recompute one aquarium's cleaning schedule (daily check and after a cleaning
 * is logged). Creates `cleaning_due` once the date passes, at most once per
 * cleaning cycle.
 */
export async function refreshCleaningSchedule(
  dependencies: { firestore: Firestore; now?: () => number },
  aquariumId: string,
  options: { resolvePendingCleaning?: boolean } = {}
) {
  const now = dependencies.now?.() ?? Date.now();
  const { firestore } = dependencies;
  const config = await loadRuleConfig(firestore, now);
  const aquariumRef = firestore.doc(`aquariums/${aquariumId}`);
  const logged = await findLastCleaning(firestore, aquariumId);
  const pendingCleaning = options.resolvePendingCleaning
    ? await firestore.collection('recommendations')
      .where('aquariumId', '==', aquariumId)
      .where('status', '==', 'pending')
      .get()
    : null;

  return firestore.runTransaction(async (transaction) => {
    const [aquariumSnap, stateSnap] = await transaction.getAll(aquariumRef, engineStateRef(firestore, aquariumId));
    const aquarium = aquariumSnap.data();
    if (!aquarium || typeof aquarium.ownerId !== 'string') return { updated: false, recommend: null };
    const state = readEngineState(stateSnap.data());
    const species = selectSpeciesConfig(aquarium, config.speciesById);
    const bioload = computeBioload(aquarium, species?.bioloadBandsGPerL);
    const created = readCreatedAt(aquarium);
    const lastCleaned = logged !== null ? { at: logged, source: 'maintenance_actions' as const }
      : created !== null ? { at: created, source: 'createdAt' as const } : null;
    const cleaning = advanceCleaning({
      state: state.cleaning,
      lastCleaned,
      species,
      bioloadLevel: bioload?.level ?? null,
      now,
      tdsPpm: null,
      turbidityEnteredWarning: false,
    });
    const ctx = { aquariumId, ownerId: aquarium.ownerId, deviceId: aquariumId, now, readingSnapshot: null };
    if (cleaning.recommend) {
      const rule = cleaningRecommendation(config.rules, cleaning.recommend, cleaning.summary);
      if (rule) transaction.set(firestore.doc(`recommendations/${aquariumId}_${cleaning.recommend}_${now}`), recommendationDoc(ctx, rule, null));
    }
    for (const doc of pendingCleaning?.docs ?? []) {
      const ruleId = doc.get('ruleId');
      if (ruleId === 'cleaning_due' || ruleId === 'cleaning_due_early') {
        transaction.set(doc.ref, { status: 'resolved', resolvedAt: now, resolvedBy: 'system' }, { merge: true });
      }
    }
    const update: Record<string, unknown> = {};
    if (cleaningSummaryChanged(aquarium.cleaning, cleaning.summary)) update.cleaning = cleaning.summary;
    if ((bioload?.level ?? null) !== (aquarium.bioloadLevel ?? null)) update.bioloadLevel = bioload?.level ?? null;
    if (Object.keys(update).length > 0) transaction.set(aquariumRef, update, { merge: true });
    if (stableStringify(cleaning.state) !== stableStringify(state.cleaning)) {
      transaction.set(engineStateRef(firestore, aquariumId), { aquariumId, cleaning: cleaning.state, updatedAt: now }, { merge: true });
    }
    return { updated: Object.keys(update).length > 0, recommend: cleaning.recommend, summary: cleaning.summary };
  });
}

export async function runDailyCleaningCheck(dependencies: { firestore: Firestore; now?: () => number }) {
  const aquariums = await dependencies.firestore.collection('aquariums').select('ownerId').get();
  const summary = { aquariums: 0, recommendations: 0 };
  for (const doc of aquariums.docs) {
    const result = await refreshCleaningSchedule(dependencies, doc.id);
    summary.aquariums += 1;
    if (result.recommend) summary.recommendations += 1;
  }
  return summary;
}
