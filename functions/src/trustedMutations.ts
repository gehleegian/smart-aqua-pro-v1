import { createHash } from 'node:crypto';
import type { Auth } from 'firebase-admin/auth';
import { ServerValue, type Database } from 'firebase-admin/database';
import {
  FieldValue,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';
import {
  syncAquariumAuthorization,
  syncUserAuthorization,
  type SyncDependencies,
  type UserRole,
} from './authorizationSync.js';

export type MutationErrorCode =
  | 'aborted'
  | 'already-exists'
  | 'failed-precondition'
  | 'invalid-argument'
  | 'not-found'
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable';

export class MutationError extends Error {
  constructor(
    public readonly code: MutationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'MutationError';
  }
}

export type MutationActor = {
  uid: string;
  emailVerified: boolean;
};

export type MutationStep =
  | 'after-lock'
  | 'before-rtdb-revocation'
  | 'after-rtdb-revocation'
  | 'before-canonical-write'
  | 'after-canonical-write'
  | 'before-auth-revocation'
  | 'before-activation'
  | 'before-completion';

export type TrustedMutationDependencies = SyncDependencies & {
  auth: Auth;
  beforeStep?: (
    step: MutationStep,
    context: { operationId: string; resourceId: string }
  ) => void | Promise<void>;
};

export type TrustedMutationResult = {
  operationId: string;
  resourceId: string;
  status: 'completed' | 'prepared' | 'revoked';
};

type OperationType =
  | 'aquarium-transfer'
  | 'aquarium-deletion-preparation'
  | 'user-role-update'
  | 'user-revocation';

type OperationIdentity = {
  operationId: string;
  fingerprint: string;
};

type OperationData = {
  actorUid?: string;
  fingerprint?: string;
  status?: string;
  result?: TrustedMutationResult;
  aquariumIds?: string[];
  previousOwnerId?: string;
  previousRole?: UserRole;
};

const IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const IDEMPOTENCY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;
const AQUARIUM_DIRECTORY_SCHEMA_VERSION = 3;

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRole(value: unknown): UserRole | null {
  return value === 'User' || value === 'Admin' ? value : null;
}

function assertIdentifier(value: string, label: string) {
  if (!IDENTIFIER_PATTERN.test(value)) {
    throw new MutationError('invalid-argument', `${label} is invalid.`);
  }
}

function assertIdempotencyKey(value: string) {
  if (!IDEMPOTENCY_PATTERN.test(value)) {
    throw new MutationError(
      'invalid-argument',
      'The idempotency key must contain 8 to 128 letters, numbers, underscores, or hyphens.'
    );
  }
}

function operationIdentity(
  actorUid: string,
  idempotencyKey: string,
  type: OperationType,
  payload: Record<string, string>
): OperationIdentity {
  assertIdempotencyKey(idempotencyKey);
  const operationId = createHash('sha256')
    .update(`${actorUid}:${idempotencyKey}`)
    .digest('hex');
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ type, ...payload }))
    .digest('hex');
  return { operationId, fingerprint };
}

function operationRef(firestore: Firestore, operationId: string) {
  return firestore.doc(`security_mutation_operations/${operationId}`);
}

function auditRef(
  firestore: Firestore,
  operationId: string,
  stage: string
) {
  return firestore.doc(`security_audit_events/${operationId}__${stage}`);
}

function userLockRef(firestore: Firestore, uid: string) {
  return firestore.doc(`security_mutation_locks/user__${uid}`);
}

function aquariumLockRef(firestore: Firestore, aquariumId: string) {
  return firestore.doc(`security_mutation_locks/aquarium__${aquariumId}`);
}

function userBlockRef(firestore: Firestore, uid: string) {
  return firestore.doc(`security_user_blocks/${uid}`);
}

function aquariumBlockRef(firestore: Firestore, aquariumId: string) {
  return firestore.doc(`security_aquarium_blocks/${aquariumId}`);
}

function deletionPreparationRef(firestore: Firestore, aquariumId: string) {
  return firestore.doc(`security_aquarium_deletion_preparations/${aquariumId}`);
}

function operationSnapshotData(snapshot: DocumentSnapshot): OperationData {
  return snapshot.exists ? (snapshot.data() as OperationData) : {};
}

function existingTerminalResult(
  snapshot: DocumentSnapshot,
  actorUid: string,
  fingerprint: string
) {
  if (!snapshot.exists) {
    return null;
  }

  const data = operationSnapshotData(snapshot);
  if (data.actorUid !== actorUid || data.fingerprint !== fingerprint) {
    throw new MutationError(
      'already-exists',
      'The idempotency key was already used for a different request.'
    );
  }

  if (
    (data.status === 'completed' ||
      data.status === 'prepared' ||
      data.status === 'revoked') &&
    data.result
  ) {
    return data.result;
  }

  return null;
}

function assertAvailableLock(
  snapshot: DocumentSnapshot,
  operationId: string
) {
  if (
    snapshot.exists &&
    snapshot.get('operationId') !== operationId &&
    snapshot.get('status') !== 'released'
  ) {
    throw new MutationError(
      'aborted',
      'Another trusted mutation is already operating on this resource.'
    );
  }
}

function assertNoForeignBlock(
  snapshot: DocumentSnapshot,
  operationId: string
) {
  if (snapshot.exists && snapshot.get('operationId') !== operationId) {
    throw new MutationError(
      'failed-precondition',
      'The resource is already blocked by another security workflow.'
    );
  }
}

async function assertVerificationEligible(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor
) {
  assertIdentifier(actor.uid, 'Requester UID');
  if (actor.emailVerified) {
    return;
  }

  const policy = await dependencies.firestore
    .doc(`authorization_user_policies/${actor.uid}`)
    .get();
  if (!policy.exists || policy.get('emailVerificationRequired') !== false) {
    throw new MutationError(
      'permission-denied',
      'Email verification or an explicit legacy exemption is required for this operation.'
    );
  }
}

async function assertEnabledAuthAccount(auth: Auth, uid: string) {
  try {
    const user = await auth.getUser(uid);
    if (user.disabled) {
      throw new MutationError(
        'failed-precondition',
        'The account is not eligible for this operation.'
      );
    }
    return user;
  } catch (error) {
    if (error instanceof MutationError) {
      throw error;
    }
    throw new MutationError(
      'failed-precondition',
      'The account is not eligible for this operation.'
    );
  }
}

function assertAdminProfile(snapshot: DocumentSnapshot) {
  if (!snapshot.exists || readRole(snapshot.get('role')) !== 'Admin') {
    throw new MutationError(
      'permission-denied',
      'Administrator authorization is required.'
    );
  }
}

function assertUserProfile(snapshot: DocumentSnapshot, label: string) {
  if (!snapshot.exists || readRole(snapshot.get('role')) !== 'User') {
    throw new MutationError(
      'failed-precondition',
      `${label} is not an eligible User account.`
    );
  }
}

async function runStep(
  dependencies: TrustedMutationDependencies,
  step: MutationStep,
  operationId: string,
  resourceId: string
) {
  await dependencies.beforeStep?.(step, { operationId, resourceId });
}

async function writeAudit(
  firestore: Firestore,
  operationId: string,
  stage: string,
  data: Record<string, unknown>
) {
  await auditRef(firestore, operationId, stage).set({
    operationId,
    stage,
    ...data,
    recordedAt: FieldValue.serverTimestamp(),
  });
}

async function markRecoveryRequired(
  dependencies: TrustedMutationDependencies,
  operationId: string,
  type: OperationType,
  actorUid: string,
  resourceId: string,
  error: unknown
) {
  const errorCode =
    error instanceof MutationError ? error.code : 'unavailable';

  await Promise.allSettled([
    operationRef(dependencies.firestore, operationId).set(
      {
        status: 'recovery_required',
        errorCode,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    ),
    writeAudit(dependencies.firestore, operationId, 'recovery_required', {
      type,
      actorUid,
      resourceId,
      errorCode,
    }),
  ]);
}

async function transitionAquariumMirror(
  database: Database,
  aquariumId: string,
  operationId: string,
  state: 'transitioning' | 'revoked',
  removeDevices: boolean
) {
  await database
    .ref(`authorization/aquariums/${aquariumId}`)
    .transaction((value) => {
      const current =
        value && typeof value === 'object' && !Array.isArray(value)
          ? (value as Record<string, unknown>)
          : {};
      const next: Record<string, unknown> = {
        ...current,
        state,
        activeMutationId: operationId,
        syncedAt: ServerValue.TIMESTAMP,
      };
      if (removeDevices) {
        delete next.deviceUids;
      }
      return next;
    });
}

async function revokeUserAndAquariums(
  database: Database,
  uid: string,
  aquariumIds: string[],
  operationId: string,
  aquariumState: 'transitioning' | 'revoked',
  removeDevices: boolean
) {
  const updates: Record<string, unknown> = {
    [`users/${uid}`]: null,
  };

  for (const aquariumId of aquariumIds) {
    updates[`aquariums/${aquariumId}/state`] = aquariumState;
    updates[`aquariums/${aquariumId}/activeMutationId`] = operationId;
    updates[`aquariums/${aquariumId}/syncedAt`] = ServerValue.TIMESTAMP;
    if (removeDevices) {
      updates[`aquariums/${aquariumId}/deviceUids`] = null;
    }
  }

  await database.ref('authorization').update(updates);
}

function directoryOwnerUpdate(
  aquarium: DocumentData,
  ownerId: string,
  ownerName: string,
  updatedAt: string
) {
  const allowedOptionalFields = [
    'bioload',
    'fishCount',
    'tankType',
    'tankSizeLiters',
    'tankLengthCm',
    'tankWidthCm',
    'tankHeightCm',
    'workingWaterVolumeLiters',
    'hasFiltrationSystem',
    'filtrationSetup',
    'createdAt',
  ];
  const result: Record<string, unknown> = {
    name: readString(aquarium.name) ?? 'Unnamed Aquarium',
    ownerId,
    ownerName,
    species: Array.isArray(aquarium.species) ? aquarium.species : [],
    updatedAt,
    schemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
  };

  for (const field of allowedOptionalFields) {
    if (aquarium[field] !== undefined) {
      result[field] = aquarium[field];
    }
  }
  if (
    result.hasFiltrationSystem === undefined &&
    typeof aquarium.filtrationSetup === 'string' &&
    aquarium.filtrationSetup.trim()
  ) {
    result.hasFiltrationSystem = true;
  }
  return result;
}

async function releaseAquariumOperation(
  dependencies: TrustedMutationDependencies,
  operationId: string,
  aquariumId: string,
  actorUid: string,
  status: TrustedMutationResult['status']
) {
  const result: TrustedMutationResult = {
    operationId,
    resourceId: aquariumId,
    status,
  };
  const batch = dependencies.firestore.batch();
  batch.set(
    operationRef(dependencies.firestore, operationId),
    {
      status,
      result,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  batch.set(
    aquariumLockRef(dependencies.firestore, aquariumId),
    {
      operationId,
      status: status === 'prepared' ? 'prepared' : 'released',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (status === 'completed') {
    batch.delete(aquariumBlockRef(dependencies.firestore, aquariumId));
  }
  batch.set(auditRef(dependencies.firestore, operationId, status), {
    operationId,
    stage: status,
    actorUid,
    resourceId: aquariumId,
    recordedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return result;
}

export async function transferAquariumOwnership(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor,
  input: {
    aquariumId: string;
    newOwnerUid: string;
    idempotencyKey: string;
  }
): Promise<TrustedMutationResult> {
  await assertVerificationEligible(dependencies, actor);
  assertIdentifier(input.aquariumId, 'Aquarium ID');
  assertIdentifier(input.newOwnerUid, 'New owner UID');
  await Promise.all([
    assertEnabledAuthAccount(dependencies.auth, actor.uid),
    assertEnabledAuthAccount(dependencies.auth, input.newOwnerUid),
  ]);

  const identity = operationIdentity(
    actor.uid,
    input.idempotencyKey,
    'aquarium-transfer',
    { aquariumId: input.aquariumId, newOwnerUid: input.newOwnerUid }
  );
  let previousOwnerId = '';
  let operationStarted = false;

  try {
    const terminal = await dependencies.firestore.runTransaction(
      async (transaction) => {
        const operation = operationRef(
          dependencies.firestore,
          identity.operationId
        );
        const lock = aquariumLockRef(
          dependencies.firestore,
          input.aquariumId
        );
        const block = aquariumBlockRef(
          dependencies.firestore,
          input.aquariumId
        );
        const actorProfile = dependencies.firestore.doc(`users/${actor.uid}`);
        const aquarium = dependencies.firestore.doc(
          `aquariums/${input.aquariumId}`
        );
        const recipient = dependencies.firestore.doc(
          `users/${input.newOwnerUid}`
        );
        const recipientBlock = userBlockRef(
          dependencies.firestore,
          input.newOwnerUid
        );
        const [operationSnapshot, lockSnapshot, blockSnapshot, actorSnapshot,
          aquariumSnapshot, recipientSnapshot, recipientBlockSnapshot] =
          await Promise.all([
            transaction.get(operation),
            transaction.get(lock),
            transaction.get(block),
            transaction.get(actorProfile),
            transaction.get(aquarium),
            transaction.get(recipient),
            transaction.get(recipientBlock),
          ]);

        const existing = existingTerminalResult(
          operationSnapshot,
          actor.uid,
          identity.fingerprint
        );
        if (existing) {
          return existing;
        }

        assertAdminProfile(actorSnapshot);
        assertAvailableLock(lockSnapshot, identity.operationId);
        assertNoForeignBlock(blockSnapshot, identity.operationId);
        assertUserProfile(recipientSnapshot, 'The proposed owner');
        if (recipientBlockSnapshot.exists) {
          throw new MutationError(
            'failed-precondition',
            'The proposed owner is blocked by a security workflow.'
          );
        }
        if (!aquariumSnapshot.exists) {
          throw new MutationError('not-found', 'Aquarium not found.');
        }

        const operationData = operationSnapshotData(operationSnapshot);
        const currentOwnerId = readString(aquariumSnapshot.get('ownerId'));
        previousOwnerId =
          operationData.previousOwnerId ?? currentOwnerId ?? '';
        if (!previousOwnerId) {
          throw new MutationError(
            'failed-precondition',
            'The aquarium does not have a valid current owner.'
          );
        }
        if (
          currentOwnerId !== previousOwnerId &&
          currentOwnerId !== input.newOwnerUid
        ) {
          throw new MutationError(
            'aborted',
            'Aquarium ownership changed during the operation.'
          );
        }
        if (
          !operationSnapshot.exists &&
          currentOwnerId === input.newOwnerUid
        ) {
          throw new MutationError(
            'failed-precondition',
            'The proposed owner already owns this aquarium.'
          );
        }

        transaction.set(lock, {
          operationId: identity.operationId,
          type: 'aquarium-transfer',
          status: 'held',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(block, {
          operationId: identity.operationId,
          reason: 'ownership-transfer',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(
          operation,
          {
            actorUid: actor.uid,
            fingerprint: identity.fingerprint,
            type: 'aquarium-transfer',
            resourceId: input.aquariumId,
            previousOwnerId,
            newOwnerUid: input.newOwnerUid,
            status: 'started',
            createdAt: operationSnapshot.exists
              ? operationSnapshot.get('createdAt')
              : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return null;
      }
    );
    if (terminal) {
      return terminal;
    }
    operationStarted = true;

    await runStep(
      dependencies,
      'after-lock',
      identity.operationId,
      input.aquariumId
    );
    await runStep(
      dependencies,
      'before-rtdb-revocation',
      identity.operationId,
      input.aquariumId
    );
    await transitionAquariumMirror(
      dependencies.database,
      input.aquariumId,
      identity.operationId,
      'transitioning',
      false
    );
    await operationRef(dependencies.firestore, identity.operationId).set(
      { status: 'access_revoked', updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );
    await runStep(
      dependencies,
      'after-rtdb-revocation',
      identity.operationId,
      input.aquariumId
    );
    await runStep(
      dependencies,
      'before-canonical-write',
      identity.operationId,
      input.aquariumId
    );

    await dependencies.firestore.runTransaction(async (transaction) => {
      const operation = operationRef(
        dependencies.firestore,
        identity.operationId
      );
      const lock = aquariumLockRef(
        dependencies.firestore,
        input.aquariumId
      );
      const block = aquariumBlockRef(
        dependencies.firestore,
        input.aquariumId
      );
      const aquarium = dependencies.firestore.doc(
        `aquariums/${input.aquariumId}`
      );
      const directory = dependencies.firestore.doc(
        `aquarium_directory/${input.aquariumId}`
      );
      const actorProfile = dependencies.firestore.doc(`users/${actor.uid}`);
      const recipient = dependencies.firestore.doc(`users/${input.newOwnerUid}`);
      const recipientBlock = userBlockRef(
        dependencies.firestore,
        input.newOwnerUid
      );
      const [lockSnapshot, blockSnapshot, aquariumSnapshot,
        directorySnapshot, actorSnapshot, recipientSnapshot,
        recipientBlockSnapshot] = await Promise.all([
        transaction.get(lock),
        transaction.get(block),
        transaction.get(aquarium),
        transaction.get(directory),
        transaction.get(actorProfile),
        transaction.get(recipient),
        transaction.get(recipientBlock),
      ]);

      assertAdminProfile(actorSnapshot);
      if (
        lockSnapshot.get('operationId') !== identity.operationId ||
        blockSnapshot.get('operationId') !== identity.operationId
      ) {
        throw new MutationError('aborted', 'The transfer lock was lost.');
      }
      assertUserProfile(recipientSnapshot, 'The proposed owner');
      if (recipientBlockSnapshot.exists) {
        throw new MutationError(
          'failed-precondition',
          'The proposed owner is blocked by a security workflow.'
        );
      }
      if (!aquariumSnapshot.exists) {
        throw new MutationError('not-found', 'Aquarium not found.');
      }

      const currentOwnerId = readString(aquariumSnapshot.get('ownerId'));
      if (
        currentOwnerId !== previousOwnerId &&
        currentOwnerId !== input.newOwnerUid
      ) {
        throw new MutationError(
          'aborted',
          'Aquarium ownership changed during the operation.'
        );
      }

      if (currentOwnerId !== input.newOwnerUid) {
        const recipientData = recipientSnapshot.data() ?? {};
        const ownerName =
          readString(recipientData.full_name) ??
          readString(recipientData.name) ??
          'User';
        const updatedAt = new Date().toISOString();
        transaction.update(aquarium, {
          ownerId: input.newOwnerUid,
          ownerName,
          updatedAt,
          directorySchemaVersion: AQUARIUM_DIRECTORY_SCHEMA_VERSION,
        });
        transaction.set(
          directory,
          directoryOwnerUpdate(
            aquariumSnapshot.data() ?? {},
            input.newOwnerUid,
            ownerName,
            updatedAt
          )
        );
      }
      transaction.set(
        operation,
        { status: 'canonical_updated', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
      if (!directorySnapshot.exists) {
        transaction.set(
          auditRef(dependencies.firestore, identity.operationId, 'directory_repaired'),
          {
            operationId: identity.operationId,
            stage: 'directory_repaired',
            actorUid: actor.uid,
            resourceId: input.aquariumId,
            recordedAt: FieldValue.serverTimestamp(),
          }
        );
      }
    });

    await runStep(
      dependencies,
      'after-canonical-write',
      identity.operationId,
      input.aquariumId
    );
    await assertEnabledAuthAccount(dependencies.auth, input.newOwnerUid);
    await runStep(
      dependencies,
      'before-activation',
      identity.operationId,
      input.aquariumId
    );
    await syncAquariumAuthorization(dependencies, input.aquariumId, {
      transitionBeforeActivation: true,
      authorizedMutationId: identity.operationId,
    });
    await runStep(
      dependencies,
      'before-completion',
      identity.operationId,
      input.aquariumId
    );
    const result = await releaseAquariumOperation(
      dependencies,
      identity.operationId,
      input.aquariumId,
      actor.uid,
      'completed'
    );
    await syncAquariumAuthorization(dependencies, input.aquariumId, {
      transitionBeforeActivation: true,
    });
    return result;
  } catch (error) {
    if (operationStarted) {
      await markRecoveryRequired(
        dependencies,
        identity.operationId,
        'aquarium-transfer',
        actor.uid,
        input.aquariumId,
        error
      );
    }
    throw error;
  }
}

export async function prepareAquariumDeletion(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor,
  input: { aquariumId: string; idempotencyKey: string }
): Promise<TrustedMutationResult> {
  await assertVerificationEligible(dependencies, actor);
  assertIdentifier(input.aquariumId, 'Aquarium ID');
  await assertEnabledAuthAccount(dependencies.auth, actor.uid);
  const identity = operationIdentity(
    actor.uid,
    input.idempotencyKey,
    'aquarium-deletion-preparation',
    { aquariumId: input.aquariumId }
  );
  let operationStarted = false;

  try {
    const terminal = await dependencies.firestore.runTransaction(
      async (transaction) => {
        const operation = operationRef(
          dependencies.firestore,
          identity.operationId
        );
        const lock = aquariumLockRef(
          dependencies.firestore,
          input.aquariumId
        );
        const block = aquariumBlockRef(
          dependencies.firestore,
          input.aquariumId
        );
        const preparation = deletionPreparationRef(
          dependencies.firestore,
          input.aquariumId
        );
        const actorProfile = dependencies.firestore.doc(`users/${actor.uid}`);
        const aquarium = dependencies.firestore.doc(
          `aquariums/${input.aquariumId}`
        );
        const [operationSnapshot, lockSnapshot, blockSnapshot,
          preparationSnapshot, actorSnapshot, aquariumSnapshot] =
          await Promise.all([
            transaction.get(operation),
            transaction.get(lock),
            transaction.get(block),
            transaction.get(preparation),
            transaction.get(actorProfile),
            transaction.get(aquarium),
          ]);

        const existing = existingTerminalResult(
          operationSnapshot,
          actor.uid,
          identity.fingerprint
        );
        if (existing) {
          return existing;
        }
        assertUserProfile(actorSnapshot, 'The requester');
        assertAvailableLock(lockSnapshot, identity.operationId);
        assertNoForeignBlock(blockSnapshot, identity.operationId);
        if (
          preparationSnapshot.exists &&
          preparationSnapshot.get('operationId') !== identity.operationId
        ) {
          throw new MutationError(
            'failed-precondition',
            'Aquarium deletion has already been prepared.'
          );
        }
        if (!aquariumSnapshot.exists) {
          throw new MutationError('not-found', 'Aquarium not found.');
        }
        if (aquariumSnapshot.get('ownerId') !== actor.uid) {
          throw new MutationError(
            'permission-denied',
            'Only the aquarium owner may prepare its deletion.'
          );
        }

        transaction.set(lock, {
          operationId: identity.operationId,
          type: 'aquarium-deletion-preparation',
          status: 'held',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(block, {
          operationId: identity.operationId,
          reason: 'deletion-preparation',
          updatedAt: FieldValue.serverTimestamp(),
        });
        transaction.set(
          operation,
          {
            actorUid: actor.uid,
            fingerprint: identity.fingerprint,
            type: 'aquarium-deletion-preparation',
            resourceId: input.aquariumId,
            status: 'started',
            createdAt: operationSnapshot.exists
              ? operationSnapshot.get('createdAt')
              : FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
        return null;
      }
    );
    if (terminal) {
      return terminal;
    }
    operationStarted = true;

    await runStep(
      dependencies,
      'before-rtdb-revocation',
      identity.operationId,
      input.aquariumId
    );
    await transitionAquariumMirror(
      dependencies.database,
      input.aquariumId,
      identity.operationId,
      'revoked',
      true
    );
    await runStep(
      dependencies,
      'after-rtdb-revocation',
      identity.operationId,
      input.aquariumId
    );

    await runStep(
      dependencies,
      'before-canonical-write',
      identity.operationId,
      input.aquariumId
    );

    const result: TrustedMutationResult = {
      operationId: identity.operationId,
      resourceId: input.aquariumId,
      status: 'prepared',
    };
    const batch = dependencies.firestore.batch();
    const retainedAquariumFields = {
      ownerId: '',
      ownerName: 'Unassigned (deletion prepared)',
      lifecycleState: 'deletion_prepared',
      updatedAt: FieldValue.serverTimestamp(),
    };
    batch.update(
      dependencies.firestore.doc(`aquariums/${input.aquariumId}`),
      retainedAquariumFields
    );
    batch.update(
      dependencies.firestore.doc(`aquarium_directory/${input.aquariumId}`),
      retainedAquariumFields
    );
    batch.set(deletionPreparationRef(dependencies.firestore, input.aquariumId), {
      operationId: identity.operationId,
      aquariumId: input.aquariumId,
      ownerUid: actor.uid,
      status: 'prepared',
      disposition: 'pending-approved-retention-policy',
      preparedAt: FieldValue.serverTimestamp(),
    });
    batch.set(
      operationRef(dependencies.firestore, identity.operationId),
      {
        status: 'prepared',
        result,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(
      aquariumLockRef(dependencies.firestore, input.aquariumId),
      {
        operationId: identity.operationId,
        status: 'prepared',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    batch.set(auditRef(dependencies.firestore, identity.operationId, 'prepared'), {
      operationId: identity.operationId,
      stage: 'prepared',
      actorUid: actor.uid,
      resourceId: input.aquariumId,
      recordedAt: FieldValue.serverTimestamp(),
    });
    await batch.commit();
    await runStep(
      dependencies,
      'after-canonical-write',
      identity.operationId,
      input.aquariumId
    );
    return result;
  } catch (error) {
    if (operationStarted) {
      await markRecoveryRequired(
        dependencies,
        identity.operationId,
        'aquarium-deletion-preparation',
        actor.uid,
        input.aquariumId,
        error
      );
    }
    throw error;
  }
}

async function beginUserMutation(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor,
  identity: OperationIdentity,
  type: 'user-role-update' | 'user-revocation',
  targetUid: string,
  targetRole?: UserRole
) {
  return dependencies.firestore.runTransaction(async (transaction) => {
    const operation = operationRef(
      dependencies.firestore,
      identity.operationId
    );
    const lock = userLockRef(dependencies.firestore, targetUid);
    const block = userBlockRef(dependencies.firestore, targetUid);
    const actorProfile = dependencies.firestore.doc(`users/${actor.uid}`);
    const targetProfile = dependencies.firestore.doc(`users/${targetUid}`);
    const ownedQuery = dependencies.firestore
      .collection('aquariums')
      .where('ownerId', '==', targetUid);
    const [operationSnapshot, lockSnapshot, blockSnapshot, actorSnapshot,
      targetSnapshot, ownedSnapshot] = await Promise.all([
      transaction.get(operation),
      transaction.get(lock),
      transaction.get(block),
      transaction.get(actorProfile),
      transaction.get(targetProfile),
      transaction.get(ownedQuery),
    ]);

    const existing = existingTerminalResult(
      operationSnapshot,
      actor.uid,
      identity.fingerprint
    );
    if (existing) {
      return { terminal: existing, aquariumIds: [] as string[] };
    }
    assertAdminProfile(actorSnapshot);
    if (actor.uid === targetUid) {
      throw new MutationError(
        'permission-denied',
        'Administrators cannot apply this operation to their own account.'
      );
    }
    if (!targetSnapshot.exists || !readRole(targetSnapshot.get('role'))) {
      throw new MutationError('not-found', 'Target user profile not found.');
    }
    assertAvailableLock(lockSnapshot, identity.operationId);
    assertNoForeignBlock(blockSnapshot, identity.operationId);

    const aquariumIds = ownedSnapshot.docs.map((document) => document.id);
    const aquariumLocks = await Promise.all(
      aquariumIds.map((aquariumId) =>
        transaction.get(aquariumLockRef(dependencies.firestore, aquariumId))
      )
    );
    const aquariumBlocks = await Promise.all(
      aquariumIds.map((aquariumId) =>
        transaction.get(aquariumBlockRef(dependencies.firestore, aquariumId))
      )
    );
    aquariumLocks.forEach((snapshot) =>
      assertAvailableLock(snapshot, identity.operationId)
    );
    aquariumBlocks.forEach((snapshot) =>
      assertNoForeignBlock(snapshot, identity.operationId)
    );

    const operationData = operationSnapshotData(operationSnapshot);
    const currentRole = readRole(targetSnapshot.get('role')) as UserRole;
    const previousRole = operationData.previousRole ?? currentRole;
    if (
      type === 'user-role-update' &&
      !operationSnapshot.exists &&
      currentRole === targetRole
    ) {
      throw new MutationError(
        'failed-precondition',
        'The target account already has the requested role.'
      );
    }
    if (
      type === 'user-role-update' &&
      currentRole === 'Admin' &&
      targetRole === 'User'
    ) {
      const admins = await transaction.get(
        dependencies.firestore.collection('users').where('role', '==', 'Admin')
      );
      if (admins.docs.filter((document) => document.id !== targetUid).length === 0) {
        throw new MutationError(
          'failed-precondition',
          'The final Administrator account cannot be demoted.'
        );
      }
    }

    transaction.set(lock, {
      operationId: identity.operationId,
      type,
      status: 'held',
      updatedAt: FieldValue.serverTimestamp(),
    });
    transaction.set(block, {
      operationId: identity.operationId,
      reason: type,
      permanent: type === 'user-revocation',
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const aquariumId of aquariumIds) {
      transaction.set(aquariumLockRef(dependencies.firestore, aquariumId), {
        operationId: identity.operationId,
        type,
        status: 'held',
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(aquariumBlockRef(dependencies.firestore, aquariumId), {
        operationId: identity.operationId,
        reason: type,
        permanent: type === 'user-revocation',
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    transaction.set(
      operation,
      {
        actorUid: actor.uid,
        fingerprint: identity.fingerprint,
        type,
        resourceId: targetUid,
        previousRole,
        targetRole: targetRole ?? null,
        aquariumIds,
        status: 'started',
        createdAt: operationSnapshot.exists
          ? operationSnapshot.get('createdAt')
          : FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return { terminal: null, aquariumIds, previousRole };
  });
}

async function releaseUserMutation(
  dependencies: TrustedMutationDependencies,
  operationId: string,
  actorUid: string,
  targetUid: string,
  aquariumIds: string[],
  status: 'completed' | 'revoked',
  keepBlocks: boolean
) {
  const result: TrustedMutationResult = {
    operationId,
    resourceId: targetUid,
    status,
  };
  const batch = dependencies.firestore.batch();
  batch.set(
    operationRef(dependencies.firestore, operationId),
    { status, result, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  batch.set(
    userLockRef(dependencies.firestore, targetUid),
    {
      operationId,
      status: keepBlocks ? 'revoked' : 'released',
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
  if (!keepBlocks) {
    batch.delete(userBlockRef(dependencies.firestore, targetUid));
  }
  for (const aquariumId of aquariumIds) {
    batch.set(
      aquariumLockRef(dependencies.firestore, aquariumId),
      {
        operationId,
        status: keepBlocks ? 'revoked' : 'released',
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    if (!keepBlocks) {
      batch.delete(aquariumBlockRef(dependencies.firestore, aquariumId));
    }
  }
  batch.set(auditRef(dependencies.firestore, operationId, status), {
    operationId,
    stage: status,
    actorUid,
    resourceId: targetUid,
    aquariumIds,
    recordedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
  return result;
}

export async function updateUserRoleTrusted(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor,
  input: { targetUid: string; role: UserRole; idempotencyKey: string }
): Promise<TrustedMutationResult> {
  await assertVerificationEligible(dependencies, actor);
  assertIdentifier(input.targetUid, 'Target UID');
  if (input.role !== 'User' && input.role !== 'Admin') {
    throw new MutationError('invalid-argument', 'Role is invalid.');
  }
  await Promise.all([
    assertEnabledAuthAccount(dependencies.auth, actor.uid),
    assertEnabledAuthAccount(dependencies.auth, input.targetUid),
  ]);
  const identity = operationIdentity(
    actor.uid,
    input.idempotencyKey,
    'user-role-update',
    { targetUid: input.targetUid, role: input.role }
  );
  let aquariumIds: string[] = [];
  let operationStarted = false;

  try {
    const beginning = await beginUserMutation(
      dependencies,
      actor,
      identity,
      'user-role-update',
      input.targetUid,
      input.role
    );
    if (beginning.terminal) {
      return beginning.terminal;
    }
    operationStarted = true;
    aquariumIds = beginning.aquariumIds;

    await runStep(
      dependencies,
      'before-rtdb-revocation',
      identity.operationId,
      input.targetUid
    );
    await revokeUserAndAquariums(
      dependencies.database,
      input.targetUid,
      aquariumIds,
      identity.operationId,
      'transitioning',
      false
    );
    await runStep(
      dependencies,
      'after-rtdb-revocation',
      identity.operationId,
      input.targetUid
    );
    await dependencies.firestore.runTransaction(async (transaction) => {
      const actorSnapshot = await transaction.get(
        dependencies.firestore.doc(`users/${actor.uid}`)
      );
      const target = dependencies.firestore.doc(`users/${input.targetUid}`);
      const targetSnapshot = await transaction.get(target);
      const lockSnapshot = await transaction.get(
        userLockRef(dependencies.firestore, input.targetUid)
      );
      assertAdminProfile(actorSnapshot);
      if (lockSnapshot.get('operationId') !== identity.operationId) {
        throw new MutationError('aborted', 'The user mutation lock was lost.');
      }
      if (!targetSnapshot.exists) {
        throw new MutationError('not-found', 'Target user profile not found.');
      }
      const currentRole = readRole(targetSnapshot.get('role'));
      const previousRole = beginning.previousRole as UserRole;
      if (currentRole !== previousRole && currentRole !== input.role) {
        throw new MutationError('aborted', 'The target role changed concurrently.');
      }
      if (currentRole !== input.role) {
        transaction.update(target, { role: input.role });
      }
      transaction.set(
        operationRef(dependencies.firestore, identity.operationId),
        { status: 'canonical_updated', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    });
    await runStep(
      dependencies,
      'after-canonical-write',
      identity.operationId,
      input.targetUid
    );
    await runStep(
      dependencies,
      'before-auth-revocation',
      identity.operationId,
      input.targetUid
    );
    await dependencies.auth.revokeRefreshTokens(input.targetUid);
    await runStep(
      dependencies,
      'before-activation',
      identity.operationId,
      input.targetUid
    );
    await syncUserAuthorization(dependencies, input.targetUid, {
      authorizedMutationId: identity.operationId,
    });
    const result = await releaseUserMutation(
      dependencies,
      identity.operationId,
      actor.uid,
      input.targetUid,
      aquariumIds,
      'completed',
      false
    );
    await syncUserAuthorization(dependencies, input.targetUid);
    await Promise.all(
      aquariumIds.map((aquariumId) =>
        syncAquariumAuthorization(dependencies, aquariumId, {
          transitionBeforeActivation: true,
        })
      )
    );
    return result;
  } catch (error) {
    if (operationStarted) {
      await markRecoveryRequired(
        dependencies,
        identity.operationId,
        'user-role-update',
        actor.uid,
        input.targetUid,
        error
      );
    }
    throw error;
  }
}

export async function revokeUserAccount(
  dependencies: TrustedMutationDependencies,
  actor: MutationActor,
  input: { targetUid: string; idempotencyKey: string }
): Promise<TrustedMutationResult> {
  await assertVerificationEligible(dependencies, actor);
  assertIdentifier(input.targetUid, 'Target UID');
  await assertEnabledAuthAccount(dependencies.auth, actor.uid);
  const identity = operationIdentity(
    actor.uid,
    input.idempotencyKey,
    'user-revocation',
    { targetUid: input.targetUid }
  );
  let aquariumIds: string[] = [];
  let operationStarted = false;

  try {
    const beginning = await beginUserMutation(
      dependencies,
      actor,
      identity,
      'user-revocation',
      input.targetUid
    );
    if (beginning.terminal) {
      return beginning.terminal;
    }
    operationStarted = true;
    aquariumIds = beginning.aquariumIds;

    await runStep(
      dependencies,
      'before-rtdb-revocation',
      identity.operationId,
      input.targetUid
    );
    await revokeUserAndAquariums(
      dependencies.database,
      input.targetUid,
      aquariumIds,
      identity.operationId,
      'revoked',
      true
    );
    await runStep(
      dependencies,
      'after-rtdb-revocation',
      identity.operationId,
      input.targetUid
    );
    await runStep(
      dependencies,
      'before-auth-revocation',
      identity.operationId,
      input.targetUid
    );
    try {
      await dependencies.auth.updateUser(input.targetUid, { disabled: true });
      await dependencies.auth.revokeRefreshTokens(input.targetUid);
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error
          ? String(error.code)
          : '';
      if (code !== 'auth/user-not-found') {
        throw error;
      }
    }

    return releaseUserMutation(
      dependencies,
      identity.operationId,
      actor.uid,
      input.targetUid,
      aquariumIds,
      'revoked',
      true
    );
  } catch (error) {
    if (operationStarted) {
      await markRecoveryRequired(
        dependencies,
        identity.operationId,
        'user-revocation',
        actor.uid,
        input.targetUid,
        error
      );
    }
    throw error;
  }
}
