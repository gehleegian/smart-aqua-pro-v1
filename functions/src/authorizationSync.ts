import { ServerValue, type Database } from 'firebase-admin/database';
import { FieldValue } from 'firebase-admin/firestore';
import type {
  DocumentSnapshot,
  Firestore,
  QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

export type UserRole = 'User' | 'Admin';
export type AquariumAuthorizationState = 'active' | 'revoked' | 'transitioning';

export type SyncOperation = {
  kind: 'user' | 'aquarium';
  id: string;
  action: 'delete' | 'revoke' | 'transition' | 'upsert';
};

export type SyncDependencies = {
  firestore: Firestore;
  database: Database;
  beforeMirrorWrite?: (operation: SyncOperation) => void | Promise<void>;
};

export type SyncResult = {
  id: string;
  status: 'active' | 'deleted' | 'revoked' | 'unchanged' | UserRole;
  sourceUpdatedAt: string | null;
};

export type ReconciliationResult = {
  usersProcessed: number;
  aquariumsProcessed: number;
  orphanedUsersRemoved: number;
  orphanedAquariumsRevoked: number;
};

const MAX_STABILITY_ATTEMPTS = 3;
const RTDB_FORBIDDEN_KEY_CHARACTERS = ['.', '#', '$', '[', ']', '/'];

type UserSource = {
  exists: boolean;
  role: UserRole | null;
  emailVerificationRequired: boolean;
  authorizationBlocked: boolean;
  sourceUpdatedAt: string | null;
};

type AquariumSource = {
  exists: boolean;
  ownerUid: string | null;
  ownerRole: UserRole | null;
  authorizationBlocked: boolean;
  sourceUpdatedAt: string | null;
};

type AquariumMirror = {
  ownerUid?: string;
  state?: AquariumAuthorizationState;
  deviceUids?: Record<string, boolean>;
  activeMutationId?: string;
  sourceUpdatedAt?: string;
  syncedAt?: number;
};

function assertRtdbKey(value: string, label: string) {
  if (
    !value ||
    RTDB_FORBIDDEN_KEY_CHARACTERS.some((character) => value.includes(character))
  ) {
    throw new Error(`${label} cannot be represented safely as an RTDB key.`);
  }
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRole(value: unknown): UserRole | null {
  return value === 'User' || value === 'Admin' ? value : null;
}

function sourceVersion(snapshot: DocumentSnapshot): string | null {
  return snapshot.exists ? snapshot.updateTime?.toDate().toISOString() ?? null : null;
}

function sameUserSource(left: UserSource, right: UserSource) {
  return (
    left.exists === right.exists &&
    left.role === right.role &&
    left.emailVerificationRequired === right.emailVerificationRequired &&
    left.authorizationBlocked === right.authorizationBlocked &&
    left.sourceUpdatedAt === right.sourceUpdatedAt
  );
}

function sameAquariumSource(left: AquariumSource, right: AquariumSource) {
  return (
    left.exists === right.exists &&
    left.ownerUid === right.ownerUid &&
    left.ownerRole === right.ownerRole &&
    left.authorizationBlocked === right.authorizationBlocked &&
    left.sourceUpdatedAt === right.sourceUpdatedAt
  );
}

function blockApplies(
  block: DocumentSnapshot,
  authorizedMutationId?: string
) {
  if (!block.exists) {
    return false;
  }

  return (
    !authorizedMutationId ||
    block.get('operationId') !== authorizedMutationId
  );
}

async function runBeforeWrite(
  dependencies: SyncDependencies,
  operation: SyncOperation
) {
  await dependencies.beforeMirrorWrite?.(operation);
}

async function readUserSource(
  firestore: Firestore,
  uid: string,
  authorizedMutationId?: string
): Promise<UserSource> {
  const [snapshot, block, verificationPolicy] = await Promise.all([
    firestore.doc(`users/${uid}`).get(),
    firestore.doc(`security_user_blocks/${uid}`).get(),
    firestore.doc(`authorization_user_policies/${uid}`).get(),
  ]);

  return {
    exists: snapshot.exists,
    role: snapshot.exists ? readRole(snapshot.get('role')) : null,
    emailVerificationRequired:
      verificationPolicy.exists &&
      verificationPolicy.get('emailVerificationRequired') === false
        ? false
        : true,
    authorizationBlocked: blockApplies(block, authorizedMutationId),
    sourceUpdatedAt: sourceVersion(snapshot),
  };
}

async function readAquariumSource(
  firestore: Firestore,
  aquariumId: string,
  authorizedMutationId?: string
): Promise<AquariumSource> {
  const [aquariumSnapshot, aquariumBlock] = await Promise.all([
    firestore.doc(`aquariums/${aquariumId}`).get(),
    firestore.doc(`security_aquarium_blocks/${aquariumId}`).get(),
  ]);

  if (!aquariumSnapshot.exists) {
    return {
      exists: false,
      ownerUid: null,
      ownerRole: null,
      authorizationBlocked: blockApplies(
        aquariumBlock,
        authorizedMutationId
      ),
      sourceUpdatedAt: null,
    };
  }

  const ownerUid = readNonEmptyString(aquariumSnapshot.get('ownerId'));
  const [ownerSnapshot, ownerBlock] = ownerUid
    ? await Promise.all([
        firestore.doc(`users/${ownerUid}`).get(),
        firestore.doc(`security_user_blocks/${ownerUid}`).get(),
      ])
    : [null, null];

  return {
    exists: true,
    ownerUid,
    ownerRole: ownerSnapshot?.exists ? readRole(ownerSnapshot.get('role')) : null,
    authorizationBlocked:
      blockApplies(aquariumBlock, authorizedMutationId) ||
      Boolean(ownerBlock && blockApplies(ownerBlock, authorizedMutationId)),
    sourceUpdatedAt: sourceVersion(aquariumSnapshot),
  };
}

async function readAquariumMirror(
  database: Database,
  aquariumId: string
): Promise<AquariumMirror | null> {
  const snapshot = await database
    .ref(`authorization/aquariums/${aquariumId}`)
    .get();
  const value = snapshot.val();

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as AquariumMirror)
    : null;
}

function userMirrorMatches(
  mirror: unknown,
  role: UserRole,
  emailVerificationRequired: boolean,
  sourceUpdatedAt: string | null
) {
  if (!mirror || typeof mirror !== 'object' || Array.isArray(mirror)) {
    return false;
  }

  const record = mirror as Record<string, unknown>;
  return (
    record.role === role &&
    record.emailVerificationRequired === emailVerificationRequired &&
    record.sourceUpdatedAt === sourceUpdatedAt
  );
}

function aquariumMirrorMatches(
  mirror: AquariumMirror | null,
  desired: Pick<AquariumMirror, 'ownerUid' | 'state' | 'sourceUpdatedAt'>
) {
  return (
    mirror?.ownerUid === desired.ownerUid &&
    mirror?.state === desired.state &&
    mirror?.sourceUpdatedAt === desired.sourceUpdatedAt
  );
}

async function listOwnedAquariumIds(firestore: Firestore, uid: string) {
  const snapshot = await firestore
    .collection('aquariums')
    .where('ownerId', '==', uid)
    .get();

  return snapshot.docs.map((document) => document.id);
}

async function writeUserMirror(
  dependencies: SyncDependencies,
  uid: string,
  source: UserSource
) {
  const mirrorRef = dependencies.database.ref(`authorization/users/${uid}`);
  const current = (await mirrorRef.get()).val();

  if (!source.exists || !source.role || source.authorizationBlocked) {
    if (current === null) {
      return false;
    }

    await runBeforeWrite(dependencies, {
      kind: 'user',
      id: uid,
      action: 'delete',
    });
    await mirrorRef.remove();
    return true;
  }

  if (
    userMirrorMatches(
      current,
      source.role,
      source.emailVerificationRequired,
      source.sourceUpdatedAt
    )
  ) {
    return false;
  }

  await runBeforeWrite(dependencies, {
    kind: 'user',
    id: uid,
    action: 'upsert',
  });
  await mirrorRef.set({
    role: source.role,
    emailVerificationRequired: source.emailVerificationRequired,
    sourceUpdatedAt: source.sourceUpdatedAt,
    syncedAt: ServerValue.TIMESTAMP,
  });
  return true;
}

export async function ensureUserVerificationPolicy(
  firestore: Firestore,
  uid: string
): Promise<boolean> {
  assertRtdbKey(uid, 'User UID');
  const policyRef = firestore.doc(`authorization_user_policies/${uid}`);

  return firestore.runTransaction(async (transaction) => {
    const policy = await transaction.get(policyRef);
    if (policy.exists) {
      return policy.get('emailVerificationRequired') !== false;
    }

    transaction.create(policyRef, {
      emailVerificationRequired: true,
      policyVersion: 1,
      source: 'registration-default',
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
}

async function writeAquariumMirror(
  dependencies: SyncDependencies,
  aquariumId: string,
  source: AquariumSource,
  transitionBeforeActivation: boolean
) {
  const mirrorRef = dependencies.database.ref(
    `authorization/aquariums/${aquariumId}`
  );
  const current = await readAquariumMirror(dependencies.database, aquariumId);
  const eligible =
    source.exists &&
    !source.authorizationBlocked &&
    Boolean(source.ownerUid) &&
    source.ownerRole === 'User';

  const desired: AquariumMirror = eligible
    ? {
        ownerUid: source.ownerUid ?? undefined,
        state: 'active',
        sourceUpdatedAt: source.sourceUpdatedAt ?? undefined,
      }
    : {
        ...(source.ownerUid ? { ownerUid: source.ownerUid } : {}),
        state: 'revoked',
        ...(source.sourceUpdatedAt
          ? { sourceUpdatedAt: source.sourceUpdatedAt }
          : {}),
      };

  if (aquariumMirrorMatches(current, desired) && !current?.activeMutationId) {
    return false;
  }

  if (
    eligible &&
    transitionBeforeActivation &&
    current?.state === 'active' &&
    (current.ownerUid !== desired.ownerUid ||
      current.sourceUpdatedAt !== desired.sourceUpdatedAt)
  ) {
    await runBeforeWrite(dependencies, {
      kind: 'aquarium',
      id: aquariumId,
      action: 'transition',
    });
    await mirrorRef.update({
      state: 'transitioning',
      syncedAt: ServerValue.TIMESTAMP,
    });
  }

  await runBeforeWrite(dependencies, {
    kind: 'aquarium',
    id: aquariumId,
    action: eligible ? 'upsert' : 'revoke',
  });
  await mirrorRef.transaction((value) => {
    const existing =
      value && typeof value === 'object' && !Array.isArray(value)
        ? (value as AquariumMirror)
        : {};
    const next: AquariumMirror = {
      ...existing,
      ...desired,
      syncedAt: ServerValue.TIMESTAMP as unknown as number,
    };

    if (!source.exists) {
      delete next.ownerUid;
      delete next.deviceUids;
      delete next.sourceUpdatedAt;
    }
    delete next.activeMutationId;

    return next;
  });
  return true;
}

export async function syncAquariumAuthorization(
  dependencies: SyncDependencies,
  aquariumId: string,
  options: {
    transitionBeforeActivation?: boolean;
    authorizedMutationId?: string;
  } = {}
): Promise<SyncResult> {
  assertRtdbKey(aquariumId, 'Aquarium ID');

  for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt += 1) {
    const source = await readAquariumSource(
      dependencies.firestore,
      aquariumId,
      options.authorizedMutationId
    );
    const changed = await writeAquariumMirror(
      dependencies,
      aquariumId,
      source,
      options.transitionBeforeActivation ?? false
    );
    const confirmation = await readAquariumSource(
      dependencies.firestore,
      aquariumId,
      options.authorizedMutationId
    );

    if (sameAquariumSource(source, confirmation)) {
      return {
        id: aquariumId,
        status: changed
          ? source.exists && source.ownerUid && source.ownerRole === 'User'
            ? 'active'
            : 'revoked'
          : 'unchanged',
        sourceUpdatedAt: source.sourceUpdatedAt,
      };
    }
  }

  await runBeforeWrite(dependencies, {
    kind: 'aquarium',
    id: aquariumId,
    action: 'transition',
  });
  await dependencies.database
    .ref(`authorization/aquariums/${aquariumId}`)
    .update({ state: 'transitioning', syncedAt: ServerValue.TIMESTAMP });
  throw new Error(
    `Aquarium ${aquariumId} changed repeatedly during synchronization; access remains transitioning for retry.`
  );
}

export async function syncUserAuthorization(
  dependencies: SyncDependencies,
  uid: string,
  options: {
    cascadeAquariums?: boolean;
    authorizedMutationId?: string;
  } = {}
): Promise<SyncResult> {
  assertRtdbKey(uid, 'User UID');

  for (let attempt = 1; attempt <= MAX_STABILITY_ATTEMPTS; attempt += 1) {
    const source = await readUserSource(
      dependencies.firestore,
      uid,
      options.authorizedMutationId
    );
    const changed = await writeUserMirror(dependencies, uid, source);
    const confirmation = await readUserSource(
      dependencies.firestore,
      uid,
      options.authorizedMutationId
    );

    if (!sameUserSource(source, confirmation)) {
      continue;
    }

    if (options.cascadeAquariums ?? true) {
      const aquariumIds = await listOwnedAquariumIds(dependencies.firestore, uid);
      for (const aquariumId of aquariumIds) {
        await syncAquariumAuthorization(dependencies, aquariumId, {
          transitionBeforeActivation: source.role !== 'User',
          authorizedMutationId: options.authorizedMutationId,
        });
      }
    }

    return {
      id: uid,
      status: changed
        ? source.authorizationBlocked
          ? 'revoked'
          : source.exists && source.role
          ? source.role
          : 'deleted'
        : 'unchanged',
      sourceUpdatedAt: source.sourceUpdatedAt,
    };
  }

  await dependencies.database.ref(`authorization/users/${uid}`).remove();
  throw new Error(
    `User ${uid} changed repeatedly during synchronization; its mirror was removed for retry.`
  );
}

function validDocumentIds(
  documents: QueryDocumentSnapshot[]
): QueryDocumentSnapshot[] {
  return documents.filter(
    (document) =>
      Boolean(document.id) &&
      !RTDB_FORBIDDEN_KEY_CHARACTERS.some((character) =>
        document.id.includes(character)
      )
  );
}

export async function reconcileAuthorization(
  dependencies: SyncDependencies
): Promise<ReconciliationResult> {
  const [usersSnapshot, aquariumsSnapshot, mirrorUsersSnapshot, mirrorAquariumsSnapshot] =
    await Promise.all([
      dependencies.firestore.collection('users').get(),
      dependencies.firestore.collection('aquariums').get(),
      dependencies.database.ref('authorization/users').get(),
      dependencies.database.ref('authorization/aquariums').get(),
    ]);

  const users = validDocumentIds(usersSnapshot.docs);
  const aquariums = validDocumentIds(aquariumsSnapshot.docs);
  const canonicalUserIds = new Set(users.map((document) => document.id));
  const canonicalAquariumIds = new Set(aquariums.map((document) => document.id));
  const mirroredUserIds = Object.keys(mirrorUsersSnapshot.val() ?? {});
  const mirroredAquariumIds = Object.keys(mirrorAquariumsSnapshot.val() ?? {});

  for (const user of users) {
    await ensureUserVerificationPolicy(dependencies.firestore, user.id);
    await syncUserAuthorization(dependencies, user.id, {
      cascadeAquariums: false,
    });
  }

  for (const uid of mirroredUserIds) {
    if (!canonicalUserIds.has(uid)) {
      await syncUserAuthorization(dependencies, uid, {
        cascadeAquariums: false,
      });
    }
  }

  for (const aquarium of aquariums) {
    await syncAquariumAuthorization(dependencies, aquarium.id);
  }

  for (const aquariumId of mirroredAquariumIds) {
    if (!canonicalAquariumIds.has(aquariumId)) {
      await syncAquariumAuthorization(dependencies, aquariumId);
    }
  }

  return {
    usersProcessed: users.length,
    aquariumsProcessed: aquariums.length,
    orphanedUsersRemoved: mirroredUserIds.filter(
      (uid) => !canonicalUserIds.has(uid)
    ).length,
    orphanedAquariumsRevoked: mirroredAquariumIds.filter(
      (aquariumId) => !canonicalAquariumIds.has(aquariumId)
    ).length,
  };
}
