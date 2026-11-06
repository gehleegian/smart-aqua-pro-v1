import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import {
  FieldValue,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';
import {
  syncAquariumAuthorization,
  syncUserAuthorization,
  type SyncDependencies,
} from './authorizationSync.js';
import { MutationError } from './trustedMutations.js';

/**
 * Sprint 3 access model: organizations, QR device claiming, caretaker invites.
 * See docs/access-model.md. Every operation here is server-side only; the
 * client reaches it through the callables in index.ts.
 *
 * Writes go to Firestore first (one transaction), then the RTDB access mirror
 * (`authorization/aquariums/{id}`) is re-synchronised through the existing
 * syncAquariumAuthorization, so RTDB rules see the change before the callable
 * returns.
 */

export type OrgDependencies = SyncDependencies & {
  auth: Auth;
  /** HMAC pepper for claim codes. Functions secret CLAIM_CODE_PEPPER; never in git. */
  claimCodePepper: string;
  now?: () => number;
};

export type OrgActor = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  /** `platformAdmin: true` custom claim. */
  platformAdmin: boolean;
};

export type OrgRole = 'owner' | 'caretaker';
export type OrgStatus = 'active' | 'suspended';

export const DEVICE_ID_PATTERN = /^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
/** No 0/O, 1/I/L: the code is typed by hand from a printed label. */
export const CLAIM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CLAIM_CODE_LENGTH = 8;
export const CLAIM_FAILURE_LIMIT = 5;
export const CLAIM_FAILURE_WINDOW_MS = 60 * 60 * 1000;
export const INVITE_TTL_MS = 48 * 60 * 60 * 1000;
const MAX_ASSIGNED_AQUARIUMS = 50;
const UID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const DOC_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AQUARIUM_DIRECTORY_SCHEMA_VERSION = 3;

// ---------------------------------------------------------------------------
// Pure helpers (shared with scripts/provision-device.ts through the same rules)
// ---------------------------------------------------------------------------

export function normalizeDeviceId(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

/** Upper-cases and drops spaces/dashes so "abcd-efgh" and "ABCD EFGH" match. */
export function normalizeClaimCode(value: unknown) {
  return typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
}

export function isValidClaimCode(code: string) {
  return code.length === CLAIM_CODE_LENGTH && [...code].every((character) => CLAIM_CODE_ALPHABET.includes(character));
}

/** HMAC-SHA256(pepper, "<deviceId>:<code>"), hex. Binding the ID stops code reuse across devices. */
export function hashClaimCode(pepper: string, deviceId: string, code: string) {
  if (!pepper) throw new MutationError('failed-precondition', 'Claim code verification is not configured.');
  return createHmac('sha256', pepper).update(`${deviceId}:${code}`).digest('hex');
}

export function claimCodeMatches(pepper: string, deviceId: string, code: string, storedHash: unknown) {
  if (typeof storedHash !== 'string' || !/^[0-9a-f]{64}$/.test(storedHash)) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = Buffer.from(hashClaimCode(pepper, deviceId, code), 'hex');
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function hashInviteToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export function deviceUidFor(deviceId: string) {
  return `esp32-${deviceId}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function clock(dependencies: OrgDependencies) {
  return dependencies.now?.() ?? Date.now();
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function requireText(value: unknown, label: string, maxLength: number) {
  const text = readString(value);
  if (!text || text.length > maxLength) {
    throw new MutationError('invalid-argument', `${label} is required (at most ${maxLength} characters).`);
  }
  return text;
}

function requireId(value: unknown, label: string, pattern = DOC_ID_PATTERN) {
  const text = readString(value);
  if (!text || !pattern.test(text)) throw new MutationError('invalid-argument', `${label} is invalid.`);
  return text;
}

function requireIdList(value: unknown, label: string) {
  if (!Array.isArray(value) || value.length > MAX_ASSIGNED_AQUARIUMS) {
    throw new MutationError('invalid-argument', `${label} must be a list of at most ${MAX_ASSIGNED_AQUARIUMS} IDs.`);
  }
  return [...new Set(value.map((id) => requireId(id, label)))];
}

function requireVerifiedEmail(actor: OrgActor) {
  if (!actor.emailVerified || !actor.email) {
    throw new MutationError('permission-denied', 'Verify your email address first.');
  }
  return actor.email.toLowerCase();
}

function orgRef(firestore: Firestore, orgId: string) {
  return firestore.doc(`organizations/${orgId}`);
}

function memberRef(firestore: Firestore, orgId: string, uid: string) {
  return firestore.doc(`organizations/${orgId}/members/${uid}`);
}

function writeAuditLog(
  transaction: Transaction,
  firestore: Firestore,
  entry: { actor: string; action: string; target: string; orgId: string | null; details?: Record<string, unknown>; at: number }
) {
  transaction.create(firestore.collection('audit_logs').doc(), { details: {}, ...entry });
}

function assertOrgActive(snapshot: DocumentSnapshot) {
  if (!snapshot.exists) throw new MutationError('not-found', 'Organization not found.');
  if (snapshot.get('status') !== 'active') {
    throw new MutationError('failed-precondition', 'This organization is suspended. Contact SmartAqua support.');
  }
}

function assertOwner(snapshot: DocumentSnapshot) {
  if (!snapshot.exists || snapshot.get('role') !== 'owner') {
    throw new MutationError('permission-denied', 'Only an organization owner can do this.');
  }
}

async function readProfileName(firestore: Firestore, uid: string, fallback: string | null) {
  const profile = await firestore.doc(`users/${uid}`).get();
  return {
    exists: profile.exists,
    role: profile.get('role') as unknown,
    name: readString(profile.get('name')) ?? readString(profile.get('full_name')) ?? fallback ?? uid,
  };
}

async function listMemberships(firestore: Firestore, uid: string) {
  const snapshot = await firestore.collectionGroup('members').where('uid', '==', uid).get();
  return snapshot.docs
    .map((doc) => ({
      orgId: doc.ref.parent.parent?.id ?? '',
      role: doc.get('role') as unknown,
      joinedAt: Number(doc.get('joinedAt') ?? 0),
    }))
    .filter((membership) => membership.orgId)
    .sort((left, right) => left.joinedAt - right.joinedAt);
}

async function syncAquariums(dependencies: OrgDependencies, aquariumIds: Iterable<string>) {
  for (const aquariumId of new Set(aquariumIds)) {
    await syncAquariumAuthorization(dependencies, aquariumId);
  }
}

function directoryDocument(aquarium: Record<string, unknown>, updatedAt: string) {
  return {
    name: aquarium.name,
    ownerId: aquarium.ownerId,
    ownerName: aquarium.ownerName,
    species: aquarium.species,
    tankType: aquarium.tankType,
    createdAt: aquarium.createdAt,
    updatedAt,
    schemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  };
}

// ---------------------------------------------------------------------------
// claimDevice
// ---------------------------------------------------------------------------

export type ClaimDeviceInput = {
  deviceId: unknown;
  claimCode: unknown;
  aquariumName: unknown;
  orgName?: unknown;
  orgId?: unknown;
};

export type ClaimDeviceResult = {
  orgId: string;
  aquariumId: string;
  deviceId: string;
  orgCreated: boolean;
};

function attemptsRef(firestore: Firestore, uid: string) {
  return firestore.doc(`claim_attempts/${uid}`);
}

async function recentFailures(dependencies: OrgDependencies, uid: string) {
  const now = clock(dependencies);
  const snapshot = await attemptsRef(dependencies.firestore, uid).get();
  const failures = Array.isArray(snapshot.get('failures')) ? (snapshot.get('failures') as unknown[]) : [];
  return failures.filter((at): at is number => typeof at === 'number' && at > now - CLAIM_FAILURE_WINDOW_MS);
}

async function recordFailure(dependencies: OrgDependencies, uid: string, recent: number[]) {
  await attemptsRef(dependencies.firestore, uid).set({
    failures: [...recent, clock(dependencies)].slice(-CLAIM_FAILURE_LIMIT * 2),
    updatedAt: clock(dependencies),
  });
}

/** RTDB half of a claim. Idempotent; re-run by a retry of the same claim. */
async function activateDeviceBinding(dependencies: OrgDependencies, aquariumId: string, deviceUid: string) {
  await dependencies.database.ref().update({
    [`authorization/aquariums/${aquariumId}/deviceUids/${deviceUid}`]: true,
    [`deviceBindings/${deviceUid}`]: aquariumId,
  });
  await syncAquariumAuthorization(dependencies, aquariumId);
}

export async function claimDevice(
  dependencies: OrgDependencies,
  actor: OrgActor,
  input: ClaimDeviceInput
): Promise<ClaimDeviceResult> {
  const { firestore } = dependencies;
  const email = requireVerifiedEmail(actor);
  if (actor.platformAdmin) {
    throw new MutationError('permission-denied', 'Platform admin accounts cannot claim devices.');
  }
  const deviceId = normalizeDeviceId(input.deviceId);
  const claimCode = normalizeClaimCode(input.claimCode);
  const aquariumName = requireText(input.aquariumName, 'Aquarium name', 60);
  const typedOrgName = input.orgName === undefined || input.orgName === null || input.orgName === ''
    ? null
    : requireText(input.orgName, 'Organization name', 80);
  const requestedOrgId = input.orgId === undefined || input.orgId === null || input.orgId === ''
    ? null
    : requireId(input.orgId, 'Organization');

  const recent = await recentFailures(dependencies, actor.uid);
  if (recent.length >= CLAIM_FAILURE_LIMIT) {
    throw new MutationError('resource-exhausted', 'Too many attempts. Try again in an hour.');
  }

  // 1. Device + code. A wrong code and an unknown device look the same.
  const registryRef = firestore.doc(`device_registry/${deviceId}`);
  const registry = DEVICE_ID_PATTERN.test(deviceId) ? await registryRef.get() : null;
  if (
    !registry?.exists ||
    !isValidClaimCode(claimCode) ||
    !claimCodeMatches(dependencies.claimCodePepper, deviceId, claimCode, registry.get('claimCodeHash'))
  ) {
    await recordFailure(dependencies, actor.uid, recent);
    throw new MutationError('invalid-argument', 'Invalid code.');
  }
  const deviceUid = readString(registry.get('deviceUid')) ?? deviceUidFor(deviceId);
  if (registry.get('status') === 'revoked') {
    throw new MutationError('failed-precondition', 'This device has been revoked. Contact SmartAqua support.');
  }
  if (registry.get('status') === 'claimed') {
    // A retry by the same claimer finishes the RTDB half and succeeds.
    const aquariumId = readString(registry.get('aquariumId'));
    const orgId = readString(registry.get('orgId'));
    if (registry.get('claimedBy') === actor.uid && aquariumId && orgId) {
      await activateDeviceBinding(dependencies, aquariumId, deviceUid);
      return { orgId, aquariumId, deviceId, orgCreated: false };
    }
    throw new MutationError('already-exists', 'Already registered, contact the owner.');
  }
  if (registry.get('status') !== 'unclaimed') {
    throw new MutationError('failed-precondition', 'This device is not ready to be claimed.');
  }

  // 2. Which org. An owned org is reused; a caretaker can never claim into
  //    the org they were invited to.
  const memberships = await listMemberships(firestore, actor.uid);
  const owned = memberships.filter((membership) => membership.role === 'owner');
  let orgId: string;
  let createOrg = false;
  if (requestedOrgId) {
    const membership = memberships.find((item) => item.orgId === requestedOrgId);
    if (membership?.role !== 'owner') {
      throw new MutationError('permission-denied', 'Only an organization owner can add devices to it.');
    }
    orgId = requestedOrgId;
  } else if (owned.length > 0) {
    orgId = owned[0].orgId;
  } else {
    // Deterministic ID: two concurrent first claims cannot create two orgs.
    orgId = `org-${actor.uid}`;
    createOrg = true;
  }

  const profile = await readProfileName(firestore, actor.uid, email);
  if (!profile.exists || profile.role !== 'User') {
    throw new MutationError('failed-precondition', 'Your account profile is not ready. Sign out and sign in again.');
  }
  const now = clock(dependencies);
  const nowIso = new Date(now).toISOString();
  const aquariumRef = firestore.collection('aquariums').doc();
  const aquariumId = aquariumRef.id;

  const orgCreated = await firestore.runTransaction(async (transaction) => {
    const [registryNow, orgNow, ownerMember] = await transaction.getAll(
      registryRef,
      orgRef(firestore, orgId),
      memberRef(firestore, orgId, actor.uid)
    );
    if (registryNow.get('status') !== 'unclaimed') {
      throw new MutationError('already-exists', 'Already registered, contact the owner.');
    }
    let created = false;
    if (orgNow.exists) {
      assertOrgActive(orgNow);
      assertOwner(ownerMember);
    } else if (createOrg) {
      created = true;
      transaction.create(orgNow.ref, {
        name: typedOrgName ?? profile.name,
        type: typedOrgName ? 'business' : 'personal',
        status: 'active',
        createdBy: actor.uid,
        createdAt: now,
      });
      transaction.create(ownerMember.ref, {
        uid: actor.uid,
        role: 'owner',
        joinedAt: now,
        invitedBy: null,
        email,
        displayName: profile.name,
      });
    } else {
      throw new MutationError('not-found', 'Organization not found.');
    }

    const aquarium = {
      name: aquariumName,
      species: ['Goldfish'],
      tankType: 'Freshwater',
      status: 'setup',
      orgId,
      caretakerIds: [],
      ownerId: actor.uid,
      ownerName: profile.name,
      deviceId,
      deviceUid,
      feeder: 'Active',
      light: 'On',
      filter: 'Active',
      createdAt: nowIso,
      updatedAt: nowIso,
      directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
    };
    transaction.create(aquariumRef, aquarium);
    transaction.set(firestore.doc(`aquarium_directory/${aquariumId}`), directoryDocument(aquarium, nowIso));
    transaction.update(registryRef, {
      status: 'claimed',
      orgId,
      aquariumId,
      claimedBy: actor.uid,
      claimedAt: now,
    });
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: 'device.claim',
      target: `device_registry/${deviceId}`,
      orgId,
      details: { aquariumId, deviceUid, orgCreated: created },
      at: now,
    });
    return created;
  });

  await attemptsRef(firestore, actor.uid).delete();
  await syncUserAuthorization(dependencies, actor.uid, { cascadeAquariums: false });
  await activateDeviceBinding(dependencies, aquariumId, deviceUid);
  return { orgId, aquariumId, deviceId, orgCreated };
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

async function requireOwnedActiveOrg(firestore: Firestore, actor: OrgActor, orgId: string) {
  const [org, member] = await firestore.getAll(orgRef(firestore, orgId), memberRef(firestore, orgId, actor.uid));
  assertOwner(member);
  assertOrgActive(org);
  return org;
}

async function readOrgAquariums(firestore: Firestore, orgId: string, transaction?: Transaction) {
  const query = firestore.collection('aquariums').where('orgId', '==', orgId);
  const snapshot = transaction ? await transaction.get(query) : await query.get();
  return snapshot.docs;
}

export async function createInvite(
  dependencies: OrgDependencies,
  actor: OrgActor,
  input: { orgId: unknown; email: unknown; aquariumIds: unknown }
) {
  const { firestore } = dependencies;
  const actorEmail = requireVerifiedEmail(actor);
  const orgId = requireId(input.orgId, 'Organization');
  const email = requireText(input.email, 'Email', 254).toLowerCase();
  if (!EMAIL_PATTERN.test(email)) throw new MutationError('invalid-argument', 'Enter a valid email address.');
  if (email === actorEmail) throw new MutationError('invalid-argument', 'You cannot invite yourself.');
  const aquariumIds = requireIdList(input.aquariumIds, 'Aquarium');
  if (aquariumIds.length === 0) throw new MutationError('invalid-argument', 'Choose at least one aquarium.');

  await requireOwnedActiveOrg(firestore, actor, orgId);
  const orgAquariumIds = new Set((await readOrgAquariums(firestore, orgId)).map((doc) => doc.id));
  const foreign = aquariumIds.filter((id) => !orgAquariumIds.has(id));
  if (foreign.length > 0) {
    throw new MutationError('permission-denied', 'Every aquarium must belong to this organization.');
  }

  const now = clock(dependencies);
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashInviteToken(token);
  const inviteRef = firestore.doc(`invites/${tokenHash}`);
  const expiresAt = now + INVITE_TTL_MS;
  await firestore.runTransaction(async (transaction) => {
    transaction.create(inviteRef, {
      orgId,
      email,
      role: 'caretaker',
      aquariumIds,
      tokenHash,
      expiresAt,
      usedAt: null,
      usedBy: null,
      revokedAt: null,
      createdBy: actor.uid,
      createdAt: now,
    });
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: 'invite.create',
      target: `invites/${tokenHash}`,
      orgId,
      details: { email, aquariumIds },
      at: now,
    });
  });
  // Only the hash is stored; the token exists in this response and the link.
  return { inviteId: tokenHash, token, path: `/invite/${token}`, expiresAt };
}

export async function acceptInvite(
  dependencies: OrgDependencies,
  actor: OrgActor,
  input: { token: unknown }
) {
  const { firestore } = dependencies;
  const email = requireVerifiedEmail(actor);
  const token = requireText(input.token, 'Invite token', 200);
  if (actor.platformAdmin) {
    throw new MutationError('permission-denied', 'Platform admin accounts cannot join an organization.');
  }
  const profile = await readProfileName(firestore, actor.uid, email);
  if (!profile.exists || profile.role !== 'User') {
    throw new MutationError('failed-precondition', 'Your account profile is not ready. Sign out and sign in again.');
  }
  const inviteRef = firestore.doc(`invites/${hashInviteToken(token)}`);
  const now = clock(dependencies);

  const result = await firestore.runTransaction(async (transaction) => {
    const invite = await transaction.get(inviteRef);
    if (!invite.exists) throw new MutationError('not-found', 'This invite link is invalid.');
    if (invite.get('usedAt') !== null && invite.get('usedAt') !== undefined) {
      throw new MutationError('failed-precondition', 'This invite has already been used.');
    }
    if (invite.get('revokedAt') !== null && invite.get('revokedAt') !== undefined) {
      throw new MutationError('failed-precondition', 'This invite was revoked by the owner.');
    }
    if (Number(invite.get('expiresAt')) <= now) {
      throw new MutationError('failed-precondition', 'This invite has expired. Ask the owner for a new link.');
    }
    if (invite.get('email') !== email) {
      throw new MutationError('permission-denied', 'This invite was sent to a different email address.');
    }
    const orgId = String(invite.get('orgId'));
    const [org, member] = await transaction.getAll(orgRef(firestore, orgId), memberRef(firestore, orgId, actor.uid));
    assertOrgActive(org);
    if (member.exists && member.get('role') === 'owner') {
      throw new MutationError('failed-precondition', 'You already own this organization.');
    }
    const requested = new Set((invite.get('aquariumIds') as string[] | undefined) ?? []);
    // Tanks removed from the org since the invite was created are skipped.
    const aquariums = (await readOrgAquariums(firestore, orgId, transaction)).filter((doc) => requested.has(doc.id));

    transaction.set(member.ref, {
      uid: actor.uid,
      role: 'caretaker',
      joinedAt: member.exists ? member.get('joinedAt') : now,
      invitedBy: invite.get('createdBy') ?? null,
      email,
      displayName: profile.name,
    });
    for (const aquarium of aquariums) {
      transaction.update(aquarium.ref, { caretakerIds: FieldValue.arrayUnion(actor.uid) });
    }
    transaction.update(inviteRef, { usedAt: now, usedBy: actor.uid });
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: 'invite.accept',
      target: `invites/${inviteRef.id}`,
      orgId,
      details: { aquariumIds: aquariums.map((doc) => doc.id) },
      at: now,
    });
    return { orgId, aquariumIds: aquariums.map((doc) => doc.id) };
  });

  await syncUserAuthorization(dependencies, actor.uid, { cascadeAquariums: false });
  await syncAquariums(dependencies, result.aquariumIds);
  return result;
}

export async function revokeInvite(dependencies: OrgDependencies, actor: OrgActor, input: { inviteId: unknown }) {
  const { firestore } = dependencies;
  requireVerifiedEmail(actor);
  const inviteId = requireId(input.inviteId, 'Invite', /^[0-9a-f]{64}$/);
  const inviteRef = firestore.doc(`invites/${inviteId}`);
  const now = clock(dependencies);
  await firestore.runTransaction(async (transaction) => {
    const invite = await transaction.get(inviteRef);
    if (!invite.exists) throw new MutationError('not-found', 'Invite not found.');
    const orgId = String(invite.get('orgId'));
    assertOwner(await transaction.get(memberRef(firestore, orgId, actor.uid)));
    if (invite.get('usedAt')) throw new MutationError('failed-precondition', 'This invite has already been used.');
    if (invite.get('revokedAt')) return;
    transaction.update(inviteRef, { revokedAt: now });
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: 'invite.revoke',
      target: `invites/${inviteId}`,
      orgId,
      details: { email: invite.get('email') },
      at: now,
    });
  });
  return { inviteId, revoked: true };
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

export async function removeMember(dependencies: OrgDependencies, actor: OrgActor, input: { orgId: unknown; uid: unknown }) {
  const { firestore } = dependencies;
  requireVerifiedEmail(actor);
  const orgId = requireId(input.orgId, 'Organization');
  const uid = requireId(input.uid, 'Member', UID_PATTERN);
  const now = clock(dependencies);

  const affected = await firestore.runTransaction(async (transaction) => {
    const [actorMember, target] = await transaction.getAll(
      memberRef(firestore, orgId, actor.uid),
      memberRef(firestore, orgId, uid)
    );
    assertOwner(actorMember);
    if (!target.exists) throw new MutationError('not-found', 'Member not found.');
    if (target.get('role') === 'owner') {
      // Only one owner exists per org today, so an owner is never removable.
      throw new MutationError('failed-precondition', 'An organization must keep at least one owner.');
    }
    const aquariums = (await readOrgAquariums(firestore, orgId, transaction)).filter((doc) =>
      ((doc.get('caretakerIds') as unknown[] | undefined) ?? []).includes(uid)
    );
    for (const aquarium of aquariums) {
      transaction.update(aquarium.ref, { caretakerIds: FieldValue.arrayRemove(uid) });
    }
    transaction.delete(target.ref);
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: 'member.remove',
      target: `organizations/${orgId}/members/${uid}`,
      orgId,
      details: { role: target.get('role'), email: target.get('email') ?? null, aquariumIds: aquariums.map((doc) => doc.id) },
      at: now,
    });
    return aquariums.map((doc) => doc.id);
  });

  // The member doc is gone (Firestore access ended in the commit); now RTDB.
  await syncAquariums(dependencies, affected);
  return { orgId, uid, removed: true, aquariumIds: affected };
}

export async function updateCaretakerAssignments(
  dependencies: OrgDependencies,
  actor: OrgActor,
  input: { orgId: unknown; uid: unknown; aquariumIds: unknown }
) {
  const { firestore } = dependencies;
  requireVerifiedEmail(actor);
  const orgId = requireId(input.orgId, 'Organization');
  const uid = requireId(input.uid, 'Member', UID_PATTERN);
  const wanted = new Set(requireIdList(input.aquariumIds, 'Aquarium'));
  const now = clock(dependencies);

  const changed = await firestore.runTransaction(async (transaction) => {
    const [org, actorMember, target] = await transaction.getAll(
      orgRef(firestore, orgId),
      memberRef(firestore, orgId, actor.uid),
      memberRef(firestore, orgId, uid)
    );
    assertOwner(actorMember);
    assertOrgActive(org);
    if (!target.exists || target.get('role') !== 'caretaker') {
      throw new MutationError('failed-precondition', 'Only caretakers have tank assignments.');
    }
    const aquariums = await readOrgAquariums(firestore, orgId, transaction);
    const known = new Set(aquariums.map((doc) => doc.id));
    if ([...wanted].some((id) => !known.has(id))) {
      throw new MutationError('permission-denied', 'Every aquarium must belong to this organization.');
    }
    const added: string[] = [];
    const removed: string[] = [];
    for (const aquarium of aquariums) {
      const has = ((aquarium.get('caretakerIds') as unknown[] | undefined) ?? []).includes(uid);
      if (wanted.has(aquarium.id) && !has) {
        transaction.update(aquarium.ref, { caretakerIds: FieldValue.arrayUnion(uid) });
        added.push(aquarium.id);
      } else if (!wanted.has(aquarium.id) && has) {
        transaction.update(aquarium.ref, { caretakerIds: FieldValue.arrayRemove(uid) });
        removed.push(aquarium.id);
      }
    }
    if (added.length > 0 || removed.length > 0) {
      writeAuditLog(transaction, firestore, {
        actor: actor.uid,
        action: 'member.assignments',
        target: `organizations/${orgId}/members/${uid}`,
        orgId,
        details: { added, removed },
        at: now,
      });
    }
    return [...added, ...removed];
  });

  await syncAquariums(dependencies, changed);
  return { orgId, uid, aquariumIds: [...wanted], changed };
}

// ---------------------------------------------------------------------------
// Platform admin: suspend / reactivate an org
// ---------------------------------------------------------------------------

async function assertPlatformAdmin(firestore: Firestore, actor: OrgActor) {
  requireVerifiedEmail(actor);
  if (actor.platformAdmin) return;
  // Fallback for admins whose claim the migration has not set yet.
  const profile = await firestore.doc(`users/${actor.uid}`).get();
  if (profile.get('role') !== 'Admin') {
    throw new MutationError('permission-denied', 'Platform administrator authorization is required.');
  }
}

export async function setOrganizationStatus(
  dependencies: OrgDependencies,
  actor: OrgActor,
  input: { orgId: unknown; status: unknown; reason?: unknown }
) {
  const { firestore } = dependencies;
  await assertPlatformAdmin(firestore, actor);
  const orgId = requireId(input.orgId, 'Organization');
  if (input.status !== 'active' && input.status !== 'suspended') {
    throw new MutationError('invalid-argument', 'Status must be active or suspended.');
  }
  const status: OrgStatus = input.status;
  const reason = input.reason === undefined || input.reason === '' ? null : requireText(input.reason, 'Reason', 300);
  const now = clock(dependencies);

  const aquariumIds = await firestore.runTransaction(async (transaction) => {
    const org = await transaction.get(orgRef(firestore, orgId));
    if (!org.exists) throw new MutationError('not-found', 'Organization not found.');
    const aquariums = await readOrgAquariums(firestore, orgId, transaction);
    if (org.get('status') === status) return aquariums.map((doc) => doc.id);
    transaction.update(org.ref, { status, statusChangedAt: now, statusChangedBy: actor.uid });
    writeAuditLog(transaction, firestore, {
      actor: actor.uid,
      action: status === 'suspended' ? 'org.suspend' : 'org.reactivate',
      target: `organizations/${orgId}`,
      orgId,
      details: { reason, previousStatus: org.get('status') ?? null },
      at: now,
    });
    return aquariums.map((doc) => doc.id);
  });

  await syncAquariums(dependencies, aquariumIds);
  return { orgId, status, aquariumIds };
}

/** Used by tests and the migration to read a member doc reference. */
export function organizationMemberRef(firestore: Firestore, orgId: string, uid: string): DocumentReference {
  return memberRef(firestore, orgId, uid);
}
