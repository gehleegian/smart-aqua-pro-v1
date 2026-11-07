import type { Firestore } from 'firebase-admin/firestore';
import { isCitedSource, validateRuleDraft, validateSpeciesDraft } from './shared/monitoringAssessmentCore.js';
import { stableStringify as stableKey } from './ruleEngine.js';
import { MutationError } from './trustedMutations.js';
import type { Actor } from './aquariumAccess.js';

/**
 * FR13 admin side (Sprint 4): the platform admin creates and edits rules and
 * species defaults, and approves them. Any edit puts the item back to `draft`
 * (an approval covers exact values). Approving requires a real citation in
 * `source`. Every change is audited (audit_logs, orgId null). The functions
 * cache the config for RULE_CONFIG_CACHE_MS (5 min), so changes reach the
 * engine within 5 minutes, without a redeploy.
 */
export type RuleConfigKind = 'rule' | 'species';
const COLLECTION: Record<RuleConfigKind, string> = { rule: 'rules', species: 'species' };
const APPROVAL_FIELDS = ['status', 'approvedBy', 'approvedAt', 'updatedAt', 'updatedBy'];

async function requirePlatformAdmin(firestore: Firestore, actor: Actor) {
  if (!actor.emailVerified || !actor.email) throw new MutationError('permission-denied', 'Verify your email address first.');
  const profile = await firestore.doc(`users/${actor.uid}`).get();
  if (!actor.platformAdmin && profile.get('role') !== 'Admin') {
    throw new MutationError('permission-denied', 'Only a platform administrator can edit rules.');
  }
  return (profile.get('name') as string | undefined) ?? actor.email;
}

function readKind(value: unknown): RuleConfigKind {
  if (value !== 'rule' && value !== 'species') throw new MutationError('invalid-argument', 'kind must be rule or species.');
  return value;
}

function content(data: Record<string, unknown> | undefined) {
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => !APPROVAL_FIELDS.includes(key)));
}

export async function saveRuleConfig(
  dependencies: { firestore: Firestore; now?: () => number },
  actor: Actor,
  input: { kind: unknown; id: unknown; data: unknown }
) {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  await requirePlatformAdmin(firestore, actor);
  const kind = readKind(input.kind);
  const id = typeof input.id === 'string' ? input.id : '';
  const validation = kind === 'rule' ? validateRuleDraft(id, input.data) : validateSpeciesDraft(id, input.data);
  if (!validation.ok) throw new MutationError('invalid-argument', validation.errors.join(' '));
  const ref = firestore.doc(`${COLLECTION[kind]}/${id}`);

  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    const before = current.exists ? content(current.data()) : null;
    if (before && stableKey(before) === stableKey(validation.value)) {
      return { id, kind, changed: false, status: current.get('status') as string };
    }
    const changedKeys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(validation.value)])]
      .filter((key) => stableKey(before?.[key]) !== stableKey(validation.value[key]));
    transaction.set(ref, { ...validation.value, status: 'draft', approvedBy: null, approvedAt: null, updatedAt: now, updatedBy: actor.uid });
    transaction.create(firestore.collection('audit_logs').doc(), {
      actor: actor.uid,
      action: `${kind}.${before ? 'update' : 'create'}`,
      target: `${COLLECTION[kind]}/${id}`,
      orgId: null,
      details: { changedKeys, previousStatus: current.get('status') ?? null, before, after: validation.value },
      at: now,
    });
    return { id, kind, changed: true, status: 'draft' };
  });
}

export async function approveRuleConfig(
  dependencies: { firestore: Firestore; now?: () => number },
  actor: Actor,
  input: { kind: unknown; id: unknown }
) {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  const approver = await requirePlatformAdmin(firestore, actor);
  const kind = readKind(input.kind);
  const id = typeof input.id === 'string' ? input.id : '';
  const ref = firestore.doc(`${COLLECTION[kind]}/${id}`);

  return firestore.runTransaction(async (transaction) => {
    const current = await transaction.get(ref);
    if (!current.exists) throw new MutationError('not-found', `${kind === 'rule' ? 'Rule' : 'Species'} not found.`);
    if (!isCitedSource(current.get('source'))) {
      throw new MutationError('failed-precondition', 'Add the citation in Source (not "TBD") before approving.');
    }
    // Re-validate what is stored: never approve something the engine would ignore.
    const stored = content(current.data());
    const validation = kind === 'rule' ? validateRuleDraft(id, stored) : validateSpeciesDraft(id, stored);
    if (!validation.ok) throw new MutationError('failed-precondition', `Fix it before approving: ${validation.errors.join(' ')}`);
    if (current.get('status') === 'approved') return { id, kind, changed: false };
    transaction.update(ref, { status: 'approved', approvedBy: approver, approvedAt: now, updatedAt: now, updatedBy: actor.uid });
    transaction.create(firestore.collection('audit_logs').doc(), {
      actor: actor.uid,
      action: `${kind}.approve`,
      target: `${COLLECTION[kind]}/${id}`,
      orgId: null,
      details: { source: current.get('source'), approvedBy: approver },
      at: now,
    });
    return { id, kind, changed: true };
  });
}
