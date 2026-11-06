import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import type { Database } from 'firebase-admin/database';
import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { ClaimError, deniedClaim, parseClaimInput } from './claimValidation.ts';

export type ClaimActor = { uid: string; emailVerified: boolean; principalType?: unknown };
export type ClaimDependencies = {
  firestore: Firestore;
  database: Database;
  auth: Auth;
  // Failure injection for emulator tests; never set by the HTTP handler.
  afterStep?: (step: 'reserved' | 'staged' | 'prepared' | 'activated') => Promise<void>;
};

function recovery(): never {
  throw new ClaimError(503, 'claim-pending',
    'Device setup is not complete. Retry with the same account and device ID. If this persists, contact support.');
}

function safeKey(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

async function readEligibleOwner(transaction: Transaction, db: Firestore, actor: ClaimActor) {
  const [profile, block, policy] = await transaction.getAll(
    db.doc(`users/${actor.uid}`), db.doc(`security_user_blocks/${actor.uid}`),
    db.doc(`authorization_user_policies/${actor.uid}`),
  );
  if (block.exists || profile.get('role') !== 'User' ||
    (!actor.emailVerified && policy.get('emailVerificationRequired') !== false)) {
    throw new ClaimError(403, 'forbidden', 'An eligible, verified user account is required.');
  }
  return { name: String(profile.get('name') || profile.get('full_name') || 'Aquarium owner').slice(0, 120),
    emailVerificationRequired: policy.get('emailVerificationRequired') !== false };
}

async function limitAttempts(db: Firestore, uid: string) {
  const ref = db.doc(`device_claim_limits/${createHash('sha256').update(uid).digest('hex')}`);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const old = await tx.get(ref);
    const start = Number(old.get('windowStartedAt'));
    const active = Number.isFinite(start) && now - start < 60_000;
    const count = active ? Number(old.get('count') || 0) : 0;
    if (count >= 10) throw new ClaimError(429, 'rate-limited', 'Too many attempts. Wait one minute and try again.');
    tx.set(ref, { windowStartedAt: active ? start : now, count: count + 1 });
  });
}

function ownsReservation(registry: DocumentSnapshot, uid: string, aquariumId: string) {
  return registry.get('ownerUid') === uid && registry.get('aquariumId') === aquariumId &&
    ['claiming', 'activating', 'claimed'].includes(registry.get('state'));
}

/** ID-only, first-eligible-owner claim. No client-supplied owner/UID/permissions.
 * Knowing an unclaimed enclosure ID is sufficient; this is not proof of possession.
 */
export async function claimDevice(deps: ClaimDependencies, actor: ClaimActor, value: unknown) {
  if (!safeKey(actor.uid) || actor.principalType === 'device') {
    throw new ClaimError(403, 'forbidden', 'A user account is required.');
  }
  const account = await deps.auth.getUser(actor.uid);
  if (account.disabled || account.customClaims?.principalType === 'device') {
    throw new ClaimError(403, 'forbidden', 'A user account is required.');
  }
  await limitAttempts(deps.firestore, actor.uid);
  const input = parseClaimInput(value);
  const db = deps.firestore;
  const registryRef = db.doc(`device_registry/${input.deviceId}`);
  const operationId = `device-claim-${input.deviceId}`;

  const preview = await registryRef.get();
  if (!preview.exists ||
    !safeKey(preview.get('deviceUid')) || !safeKey(preview.get('aquariumId'))) deniedClaim();
  const deviceUid = preview.get('deviceUid') as string;
  const aquariumId = preview.get('aquariumId') as string;
  const device = await deps.auth.getUser(deviceUid).catch(() => null);
  if (!device || device.disabled || device.customClaims?.principalType !== 'device') deniedClaim();
  const aquariumRef = db.doc(`aquariums/${aquariumId}`);
  const directoryRef = db.doc(`aquarium_directory/${aquariumId}`);
  const blockRef = db.doc(`security_aquarium_blocks/${aquariumId}`);

  const reservation = await db.runTransaction(async tx => {
    const owner = await readEligibleOwner(tx, db, actor);
    const [registry, binding, aquarium, directory, block] = await tx.getAll(
      registryRef, db.doc(`device_uid_registry/${deviceUid}`), aquariumRef, directoryRef, blockRef,
    );
    if (registry.get('deviceUid') !== deviceUid || registry.get('aquariumId') !== aquariumId ||
      binding.get('deviceId') !== input.deviceId) deniedClaim();
    if (registry.get('state') !== 'unclaimed') {
      if (!ownsReservation(registry, actor.uid, aquariumId)) deniedClaim();
      if (aquarium.get('ownerId') !== actor.uid || aquarium.get('deviceUid') !== deviceUid ||
        aquarium.get('deviceId') !== input.deviceId ||
        (block.exists && block.get('operationId') !== operationId)) recovery();
      return { ...owner, state: registry.get('state') as string };
    }
    if (aquarium.exists || directory.exists || block.exists) recovery();
    const now = new Date().toISOString();
    const profile = input.profile;
    // No manufactured telemetry is stored. These are desired OFF defaults only.
    const aquariumData = { ...profile, ownerId: actor.uid, ownerName: owner.name,
      deviceId: input.deviceId, deviceUid, createdAt: now, updatedAt: now,
      directorySchemaVersion: 3, feeder: 'Inactive', light: 'Off', filter: 'Inactive' };
    const directoryData = Object.fromEntries(['name', 'species', 'tankType', 'tankLengthCm',
      'tankWidthCm', 'tankHeightCm', 'workingWaterVolumeLiters', 'hasFiltrationSystem', 'fishCount']
      .map(key => [key, profile[key]]));
    tx.create(aquariumRef, aquariumData);
    tx.create(directoryRef, { ...directoryData, ownerId: actor.uid, ownerName: owner.name,
      createdAt: now, updatedAt: now, schemaVersion: 3 });
    tx.create(blockRef, { operationId, reason: 'device-claim-pending', createdAt: now });
    tx.update(registryRef, { ownerUid: actor.uid, state: 'claiming', operationId, claimedAt: now });
    return { ...owner, state: 'claiming' };
  });
  await deps.afterStep?.('reserved');
  const mirrorRef = deps.database.ref(`authorization/aquariums/${aquariumId}`);
  const mirrorMatches = (current: Record<string, unknown> | null) => current &&
    current.ownerUid === actor.uid && current.claimOperationId === operationId &&
    JSON.stringify(current.deviceUids) === JSON.stringify({ [deviceUid]: true });

  // Completed retries are read-only: NEVER resurrect access after revoke/delete/transfer.
  if (reservation.state === 'claimed') {
    const current = (await mirrorRef.get()).val();
    if (!mirrorMatches(current) || current.state !== 'active' || current.activeMutationId) recovery();
    return { status: 'claimed' as const, aquariumId, deviceId: input.deviceId };
  }

  const staged = await mirrorRef.transaction(current => {
    if (current === null && reservation.state === 'claiming') {
      return { ownerUid: actor.uid, state: 'transitioning', deviceUids: { [deviceUid]: true },
        claimOperationId: operationId, activeMutationId: operationId };
    }
    // RTDB may invoke a transaction first with an empty local cache. Returning
    // null lets the server compare-and-retry; undefined would abort too early.
    if (current === null) return null;
    if (!mirrorMatches(current)) return;
    if (current.state === 'transitioning' && current.activeMutationId === operationId) return current;
    // Crash after activation can resume final bookkeeping, but not change permissions.
    if (reservation.state === 'activating' && current.state === 'active' && !current.activeMutationId) return current;
    return;
  });
  if (!staged.committed || !mirrorMatches(staged.snapshot.val())) recovery();
  await deps.afterStep?.('staged');

  // Commit canonical ownership before opening realtime access. Foreign security
  // blocks are never removed; retries cannot change the original profile/owner.
  await db.runTransaction(async tx => {
    await readEligibleOwner(tx, db, actor);
    const [registry, aquarium, block] = await tx.getAll(registryRef, aquariumRef, blockRef);
    if (!ownsReservation(registry, actor.uid, aquariumId) || aquarium.get('ownerId') !== actor.uid ||
      aquarium.get('deviceUid') !== deviceUid || (block.exists && block.get('operationId') !== operationId)) recovery();
    if (registry.get('state') === 'claimed') return;
    tx.update(registryRef, { state: 'activating' });
    if (block.exists) tx.delete(blockRef);
  });
  await deps.afterStep?.('prepared');

  // This mirror contains only trusted profile fields, never client role input.
  const userMirror = deps.database.ref(`authorization/users/${actor.uid}`);
  const userResult = await userMirror.transaction(current => {
    if (current && current.role !== 'User') return;
    return { ...current, role: 'User', emailVerificationRequired: reservation.emailVerificationRequired };
  });
  if (!userResult.committed) recovery();

  const activated = await mirrorRef.transaction(current => {
    if (current === null) return null;
    if (!mirrorMatches(current)) return;
    if (current.state === 'active' && !current.activeMutationId) return current;
    if (current.state !== 'transitioning' || current.activeMutationId !== operationId) return;
    const next = { ...current, state: 'active' };
    delete next.activeMutationId;
    return next;
  });
  if (!activated.committed || activated.snapshot.child('state').val() !== 'active') recovery();
  await deps.afterStep?.('activated');
  try {
    await db.runTransaction(async tx => {
      await readEligibleOwner(tx, db, actor);
      const [registry, aquarium, block] = await tx.getAll(registryRef, aquariumRef, blockRef);
      if (!ownsReservation(registry, actor.uid, aquariumId) || block.exists ||
        aquarium.get('ownerId') !== actor.uid || aquarium.get('deviceUid') !== deviceUid) recovery();
      tx.update(registryRef, { state: 'claimed' });
    });
  } catch (error) {
    // Do not undo another administrator's ownership change; only close this claim.
    await mirrorRef.transaction(current => current === null ? null :
      mirrorMatches(current) && current.state === 'active' ? { ...current, state: 'revoked' } : undefined);
    throw error;
  }
  return { status: 'claimed' as const, aquariumId, deviceId: input.deviceId };
}
