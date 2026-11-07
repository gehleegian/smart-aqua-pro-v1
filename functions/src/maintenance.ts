import type { Firestore } from 'firebase-admin/firestore';
import { requireAquariumMember, requireVerifiedActor, type Actor } from './aquariumAccess.js';
import { MutationError } from './trustedMutations.js';

/**
 * FR20 maintenance logging (Sprint 4). Owners and assigned caretakers log what
 * they did; a log linked to a recommendation marks it `applied`. A tank
 * cleaning, or a water change of CYCLE_RESET_WATER_CHANGE_PCT or more, starts
 * a new cleaning cycle: it is stored with actionType 'cleaning', which the
 * existing onMaintenanceActionLogged trigger and findLastCleaning already use.
 */
export const MAINTENANCE_TYPES = [
  'water_change',
  'filter_clean',
  'tank_cleaning',
  'feeding_adjustment',
  'equipment_check',
  'other',
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number];
export const CYCLE_RESET_WATER_CHANGE_PCT = 25;
const MAX_NOTES = 500;
const MAX_PAST_MS = 365 * 24 * 60 * 60_000;
const FUTURE_SKEW_MS = 2 * 60_000;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

export function resetsCleaningCycle(type: MaintenanceType, waterChangePercent: number | null) {
  return type === 'tank_cleaning' || (type === 'water_change' && (waterChangePercent ?? 0) >= CYCLE_RESET_WATER_CHANGE_PCT);
}

export type LogMaintenanceInput = {
  aquariumId: unknown;
  type: unknown;
  waterChangePercent?: unknown;
  notes?: unknown;
  performedAt: unknown;
  recommendationId?: unknown;
};

export async function logMaintenance(
  dependencies: { firestore: Firestore; now?: () => number },
  actor: Actor,
  input: LogMaintenanceInput
) {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  requireVerifiedActor(actor);

  const aquariumId = typeof input.aquariumId === 'string' && ID_PATTERN.test(input.aquariumId) ? input.aquariumId : null;
  if (!aquariumId) throw new MutationError('invalid-argument', 'Aquarium is invalid.');
  if (!MAINTENANCE_TYPES.includes(input.type as MaintenanceType)) {
    throw new MutationError('invalid-argument', `Type must be one of: ${MAINTENANCE_TYPES.join(', ')}.`);
  }
  const type = input.type as MaintenanceType;
  let waterChangePercent: number | null = null;
  if (input.waterChangePercent !== undefined && input.waterChangePercent !== null && input.waterChangePercent !== '') {
    const value = Number(input.waterChangePercent);
    if (type !== 'water_change' || !Number.isFinite(value) || value <= 0 || value > 100) {
      throw new MutationError('invalid-argument', 'Water change % must be 1–100, and only for a water change.');
    }
    waterChangePercent = Math.round(value);
  }
  if (type === 'water_change' && waterChangePercent === null) {
    throw new MutationError('invalid-argument', 'Enter how much water was changed (%).');
  }
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  if (notes.length > MAX_NOTES) throw new MutationError('invalid-argument', `Notes can be at most ${MAX_NOTES} characters.`);
  const performedAt = Number(input.performedAt);
  if (!Number.isFinite(performedAt) || performedAt > now + FUTURE_SKEW_MS) {
    throw new MutationError('invalid-argument', 'When it was done cannot be in the future.');
  }
  if (performedAt < now - MAX_PAST_MS) throw new MutationError('invalid-argument', 'When it was done must be within the last year.');
  const recommendationId = input.recommendationId === undefined || input.recommendationId === null || input.recommendationId === ''
    ? null
    : typeof input.recommendationId === 'string' && ID_PATTERN.test(input.recommendationId) ? input.recommendationId : undefined;
  if (recommendationId === undefined) throw new MutationError('invalid-argument', 'Recommendation is invalid.');

  const profile = await firestore.doc(`users/${actor.uid}`).get();
  const performedByName = (profile.get('name') as string | undefined) ?? (profile.get('full_name') as string | undefined) ?? actor.email;
  const resets = resetsCleaningCycle(type, waterChangePercent);
  const actionRef = firestore.collection('maintenance_actions').doc();

  const result = await firestore.runTransaction(async (transaction) => {
    const access = await requireAquariumMember(firestore, actor.uid, aquariumId, transaction);
    const recommendation = recommendationId ? await transaction.get(firestore.doc(`recommendations/${recommendationId}`)) : null;
    if (recommendation) {
      if (!recommendation.exists || recommendation.get('aquariumId') !== aquariumId) {
        throw new MutationError('not-found', 'Recommendation not found for this aquarium.');
      }
      if (recommendation.get('status') !== 'pending') {
        throw new MutationError('failed-precondition', 'This recommendation was already handled.');
      }
    }
    transaction.create(actionRef, {
      aquariumId,
      orgId: access.orgId,
      type,
      // 'cleaning' is what the cleaning-cycle trigger and query look for.
      actionType: resets ? 'cleaning' : type,
      resetsCleaningCycle: resets,
      waterChangePercent,
      notes,
      performedAt,
      performedBy: actor.uid,
      performedByName,
      performedByRole: access.role,
      recommendationId,
      ruleId: recommendation?.get('ruleId') ?? null,
      action_status: 'completed',
      createdAt: now,
    });
    if (recommendation) {
      transaction.update(recommendation.ref, {
        status: 'applied',
        resolvedAt: now,
        resolvedBy: actor.uid,
        maintenanceActionId: actionRef.id,
      });
    }
    transaction.create(firestore.collection('audit_logs').doc(), {
      actor: actor.uid,
      action: 'maintenance.log',
      target: `maintenance_actions/${actionRef.id}`,
      orgId: access.orgId,
      details: { aquariumId, type, waterChangePercent, recommendationId, resetsCleaningCycle: resets },
      at: now,
    });
    return { orgId: access.orgId };
  });

  return { id: actionRef.id, aquariumId, orgId: result.orgId, resetsCleaningCycle: resets, recommendationApplied: Boolean(recommendationId) };
}
