import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onValueWritten } from 'firebase-functions/v2/database';
import { defineSecret, defineString } from 'firebase-functions/params';
import {
  reconcileAuthorization,
  ensureUserVerificationPolicy,
  syncAquariumAuthorization,
  syncUserAuthorization,
  type SyncDependencies,
} from './authorizationSync.js';
import {
  MutationError,
  prepareAquariumDeletion as prepareAquariumDeletionCore,
  revokeUserAccount as revokeUserAccountCore,
  transferAquariumOwnership as transferAquariumOwnershipCore,
  updateUserRoleTrusted as updateUserRoleTrustedCore,
  type MutationActor,
  type TrustedMutationDependencies,
} from './trustedMutations.js';
import { ingestTelemetry } from './telemetryIngest.js';
import {
  acceptInvite as acceptInviteCore,
  claimDevice as claimDeviceCore,
  createInvite as createInviteCore,
  removeMember as removeMemberCore,
  revokeInvite as revokeInviteCore,
  setMemberRole as setMemberRoleCore,
  setOrganizationStatus as setOrganizationStatusCore,
  updateCaretakerAssignments as updateCaretakerAssignmentsCore,
  type OrgActor,
  type OrgDependencies,
} from './orgAccess.js';
import { checkDeviceHeartbeats, refreshCleaningSchedule, runDailyCleaningCheck } from './scheduledChecks.js';

if (getApps().length === 0) {
  initializeApp();
}

const dependencies: SyncDependencies = {
  firestore: getFirestore(),
  database: getDatabase(),
};

const trustedMutationDependencies: TrustedMutationDependencies = {
  ...dependencies,
  auth: getAuth(),
};

const supportEmail = defineString('SMARTAQUA_SUPPORT_EMAIL', {
  description: 'Gmail address that receives SmartAqua Pro user support messages.',
  default: 'smartaquapro98@gmail.com',
});

type CallableData = Record<string, unknown>;

function requireCallableActor(request: CallableRequest<CallableData>): MutationActor {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }

  return {
    uid: request.auth.uid,
    emailVerified: request.auth.token.email_verified === true,
  };
}

function requireCallableString(
  data: CallableData,
  field: string
) {
  const value = data[field];
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpsError('invalid-argument', `${field} is required.`);
  }
  return value.trim();
}

function callableFailure(error: unknown): never {
  if (error instanceof HttpsError) {
    throw error;
  }
  if (error instanceof MutationError) {
    throw new HttpsError(error.code, error.message);
  }

  logger.error('Trusted mutation failed unexpectedly.', { error });
  throw new HttpsError('internal', 'The trusted operation could not be completed.');
}

const callableOptions = {
  timeoutSeconds: 60,
  maxInstances: 10,
  concurrency: 10,
};

export const transferAquariumOwnership = onCall<CallableData>(
  callableOptions,
  async (request) => {
    const actor = requireCallableActor(request);
    try {
      const result = await transferAquariumOwnershipCore(
        trustedMutationDependencies,
        actor,
        {
          aquariumId: requireCallableString(request.data, 'aquariumId'),
          newOwnerUid: requireCallableString(request.data, 'newOwnerUid'),
          idempotencyKey: requireCallableString(request.data, 'idempotencyKey'),
        }
      );
      logger.info('Trusted aquarium ownership transfer completed.', {
        actorUid: actor.uid,
        ...result,
      });
      return result;
    } catch (error) {
      return callableFailure(error);
    }
  }
);

export const prepareAquariumDeletion = onCall<CallableData>(
  callableOptions,
  async (request) => {
    const actor = requireCallableActor(request);
    try {
      const result = await prepareAquariumDeletionCore(
        trustedMutationDependencies,
        actor,
        {
          aquariumId: requireCallableString(request.data, 'aquariumId'),
          idempotencyKey: requireCallableString(request.data, 'idempotencyKey'),
        }
      );
      logger.info('Trusted aquarium deletion preparation completed.', {
        actorUid: actor.uid,
        ...result,
      });
      return result;
    } catch (error) {
      return callableFailure(error);
    }
  }
);

export const updateUserRoleTrusted = onCall<CallableData>(
  callableOptions,
  async (request) => {
    const actor = requireCallableActor(request);
    const role = requireCallableString(request.data, 'role');
    if (role !== 'User' && role !== 'Admin') {
      throw new HttpsError('invalid-argument', 'role is invalid.');
    }
    try {
      const result = await updateUserRoleTrustedCore(
        trustedMutationDependencies,
        actor,
        {
          targetUid: requireCallableString(request.data, 'targetUid'),
          role,
          idempotencyKey: requireCallableString(request.data, 'idempotencyKey'),
        }
      );
      logger.info('Trusted user role update completed.', {
        actorUid: actor.uid,
        ...result,
      });
      return result;
    } catch (error) {
      return callableFailure(error);
    }
  }
);

export const revokeUserAccount = onCall<CallableData>(
  callableOptions,
  async (request) => {
    const actor = requireCallableActor(request);
    try {
      const result = await revokeUserAccountCore(
        trustedMutationDependencies,
        actor,
        {
          targetUid: requireCallableString(request.data, 'targetUid'),
          idempotencyKey: requireCallableString(request.data, 'idempotencyKey'),
        }
      );
      logger.info('Trusted user revocation completed.', {
        actorUid: actor.uid,
        ...result,
      });
      return result;
    } catch (error) {
      return callableFailure(error);
    }
  }
);

// ---------------------------------------------------------------------------
// Sprint 3: organizations, device claiming, caretaker invites (orgAccess.ts)
// ---------------------------------------------------------------------------

// HMAC pepper for device claim codes. Set with
// `firebase functions:secrets:set CLAIM_CODE_PEPPER`; the emulator reads
// functions/.secret.local (gitignored). Never commit it.
const claimCodePepper = defineSecret('CLAIM_CODE_PEPPER');

function requireOrgActor(request: CallableRequest<CallableData>): OrgActor {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required.');
  }
  const token = request.auth.token;
  if (token.principalType === 'device') {
    throw new HttpsError('permission-denied', 'Devices cannot call this operation.');
  }
  return {
    uid: request.auth.uid,
    email: typeof token.email === 'string' ? token.email : null,
    emailVerified: token.email_verified === true,
    platformAdmin: token.platformAdmin === true,
  };
}

function orgDependencies(): OrgDependencies {
  return { ...trustedMutationDependencies, claimCodePepper: claimCodePepper.value() };
}

function orgCallable<T>(
  name: string,
  handler: (dependencies: OrgDependencies, actor: OrgActor, data: CallableData) => Promise<T>
) {
  return onCall<CallableData>({ ...callableOptions, secrets: [claimCodePepper] }, async (request) => {
    const actor = requireOrgActor(request);
    try {
      const result = await handler(orgDependencies(), actor, request.data ?? {});
      logger.info(`${name} completed.`, { actorUid: actor.uid });
      return result;
    } catch (error) {
      return callableFailure(error);
    }
  });
}

export const claimDevice = orgCallable('claimDevice', (deps, actor, data) =>
  claimDeviceCore(deps, actor, {
    deviceId: data.deviceId,
    claimCode: data.claimCode,
    aquariumName: data.aquariumName,
    orgName: data.orgName,
    orgId: data.orgId,
  })
);

export const createInvite = orgCallable('createInvite', (deps, actor, data) =>
  createInviteCore(deps, actor, { orgId: data.orgId, email: data.email, aquariumIds: data.aquariumIds })
);

export const acceptInvite = orgCallable('acceptInvite', (deps, actor, data) =>
  acceptInviteCore(deps, actor, { token: data.token })
);

export const revokeInvite = orgCallable('revokeInvite', (deps, actor, data) =>
  revokeInviteCore(deps, actor, { inviteId: data.inviteId })
);

export const removeMember = orgCallable('removeMember', (deps, actor, data) =>
  removeMemberCore(deps, actor, { orgId: data.orgId, uid: data.uid })
);

export const setMemberRole = orgCallable('setMemberRole', (deps, actor, data) =>
  setMemberRoleCore(deps, actor, { orgId: data.orgId, uid: data.uid, role: data.role })
);

export const updateCaretakerAssignments = orgCallable('updateCaretakerAssignments', (deps, actor, data) =>
  updateCaretakerAssignmentsCore(deps, actor, { orgId: data.orgId, uid: data.uid, aquariumIds: data.aquariumIds })
);

export const setOrganizationStatus = orgCallable('setOrganizationStatus', (deps, actor, data) =>
  setOrganizationStatusCore(deps, actor, { orgId: data.orgId, status: data.status, reason: data.reason })
);

// Backup path for the RTDB access mirror: the callables above already sync
// it before returning; these catch any write made another way.
export const syncOrganizationAuthorizationMirror = onDocumentWritten(
  { document: 'organizations/{orgId}', retry: true },
  async (event) => {
    if (event.data?.before.get('status') === event.data?.after.get('status')) return;
    const aquariums = await dependencies.firestore
      .collection('aquariums')
      .where('orgId', '==', event.params.orgId)
      .get();
    for (const aquarium of aquariums.docs) {
      await syncAquariumAuthorization(dependencies, aquarium.id);
    }
  }
);

export const syncMemberAuthorizationMirror = onDocumentWritten(
  { document: 'organizations/{orgId}/members/{uid}', retry: true },
  async (event) => {
    const before = event.data?.before.get('role');
    const after = event.data?.after.get('role');
    if (before === after) return;
    // An owner change touches every tank's coOwnerUids (Sprint 4 co-owners).
    const byOrg = dependencies.firestore.collection('aquariums').where('orgId', '==', event.params.orgId);
    const aquariums = await (before === 'owner' || after === 'owner'
      ? byOrg
      : byOrg.where('caretakerIds', 'array-contains', event.params.uid)
    ).get();
    for (const aquarium of aquariums.docs) {
      await syncAquariumAuthorization(dependencies, aquarium.id);
    }
  }
);

export const queueSupportMessageEmail = onDocumentCreated(
  {
    document: 'support_threads/{threadId}/messages/{messageId}',
    retry: true,
  },
  async (event) => {
    const message = event.data?.data();
    if (!message || message.senderRole !== 'User') {
      return;
    }

    const threadSnapshot = await dependencies.firestore
      .collection('support_threads')
      .doc(event.params.threadId)
      .get();

    if (!threadSnapshot.exists) {
      logger.warn('Support email was not queued because its thread was missing.', {
        eventId: event.id,
        threadId: event.params.threadId,
      });
      return;
    }

    const thread = threadSnapshot.data() ?? {};
    const destination = supportEmail.value().trim();
    if (!destination) {
      logger.error('SMARTAQUA_SUPPORT_EMAIL is not configured.', {
        eventId: event.id,
        threadId: event.params.threadId,
      });
      throw new Error('The SmartAqua Pro support email destination is not configured.');
    }

    const ownerName = readString(thread.ownerName) ?? 'SmartAqua Pro user';
    const ownerEmail = readString(thread.ownerEmail);
    const subject = readString(thread.subject) ?? 'Support request';
    const body = readString(message.body) ?? '';

    await dependencies.firestore.collection('mail').doc(event.id).set({
      to: [destination],
      ...(ownerEmail ? { replyTo: ownerEmail } : {}),
      message: {
        subject: `[SmartAqua Pro Support] ${subject}`,
        text: [
          `From: ${ownerName}${ownerEmail ? ` <${ownerEmail}>` : ''}`,
          `Ticket: ${event.params.threadId}`,
          '',
          body,
          '',
          'Reply from the SmartAqua Pro admin support inbox so the user receives an in-app notification.',
        ].join('\n'),
      },
      supportThreadId: event.params.threadId,
      supportMessageId: event.params.messageId,
    });

    logger.info('Support message queued for email delivery.', {
      eventId: event.id,
      threadId: event.params.threadId,
      messageId: event.params.messageId,
    });
  }
);

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function readRole(value: unknown) {
  return value === 'User' || value === 'Admin' ? value : null;
}

export const syncUserAuthorizationMirror = onDocumentWritten(
  {
    document: 'users/{uid}',
    retry: true,
  },
  async (event) => {
    const beforeRole = readRole(event.data?.before.get('role'));
    const afterRole = readRole(event.data?.after.get('role'));

    if (event.data?.before.exists && event.data.after.exists && beforeRole === afterRole) {
      return;
    }

    try {
      if (event.data?.after.exists) {
        await ensureUserVerificationPolicy(dependencies.firestore, event.params.uid);
      }
      const result = await syncUserAuthorization(dependencies, event.params.uid);
      logger.info('User authorization mirror synchronized.', {
        eventId: event.id,
        ...result,
      });
    } catch (error) {
      logger.error('User authorization mirror synchronization failed.', {
        eventId: event.id,
        uid: event.params.uid,
        error,
      });
      throw error;
    }
  }
);

export const syncUserVerificationPolicyMirror = onDocumentWritten(
  {
    document: 'authorization_user_policies/{uid}',
    retry: true,
  },
  async (event) => {
    try {
      const result = await syncUserAuthorization(dependencies, event.params.uid);
      logger.info('User verification policy authorization mirror synchronized.', result);
    } catch (error) {
      logger.error('User verification policy mirror synchronization failed.', {
        uid: event.params.uid,
        error,
      });
      throw error;
    }
  }
);

export const syncAquariumAuthorizationMirror = onDocumentWritten(
  {
    document: 'aquariums/{aquariumId}',
    retry: true,
  },
  async (event) => {
    const beforeOwner = readString(event.data?.before.get('ownerId'));
    const afterOwner = readString(event.data?.after.get('ownerId'));
    const accessKey = (snapshot: { get(field: string): unknown } | undefined) =>
      JSON.stringify([
        readString(snapshot?.get('orgId')),
        [...((snapshot?.get('caretakerIds') as string[] | undefined) ?? [])].sort(),
      ]);
    const ownerChanged = beforeOwner !== afterOwner;

    if (
      event.data?.before.exists &&
      event.data.after.exists &&
      !ownerChanged &&
      accessKey(event.data.before) === accessKey(event.data.after)
    ) {
      return;
    }

    try {
      // A caretaker/org change only narrows or widens one list; only an owner
      // change needs the transitioning step.
      const result = await syncAquariumAuthorization(
        dependencies,
        event.params.aquariumId,
        { transitionBeforeActivation: ownerChanged }
      );
      logger.info('Aquarium authorization mirror synchronized.', {
        eventId: event.id,
        ...result,
      });
    } catch (error) {
      logger.error('Aquarium authorization mirror synchronization failed.', {
        eventId: event.id,
        aquariumId: event.params.aquariumId,
        error,
      });
      throw error;
    }
  }
);

export const reconcileAuthorizationMirror = onSchedule(
  {
    schedule: 'every 24 hours',
    retryCount: 3,
    maxInstances: 1,
    timeoutSeconds: 540,
  },
  async (event) => {
    try {
      const result = await reconcileAuthorization(dependencies);
      logger.info('Authorization mirror reconciliation completed.', {
        scheduleTime: event.scheduleTime,
        ...result,
      });
    } catch (error) {
      logger.error('Authorization mirror reconciliation failed.', {
        scheduleTime: event.scheduleTime,
        error,
      });
      throw error;
    }
  }
);

// Device contract decision 6 + Sprint 2 rules engine: validate, evaluate,
// reconcile alerts/recommendations, sampled history, condition summary.
// See docs/rule-engine.md. Firestore is written only when something changes.
export const ingestDeviceTelemetry = onValueWritten(
  { ref: '/devices/{aquariumId}/telemetry' },
  async (event) => {
    if (!event.data.after.exists()) {
      return;
    }
    const aquariumId = event.params.aquariumId;
    const result = await ingestTelemetry({ firestore: dependencies.firestore }, aquariumId, event.data.after.val());
    if (!result.ingested) {
      logger.warn('Telemetry not ingested.', { aquariumId, reason: result.reason });
    } else if (result.firestoreWrites > 0) {
      logger.info('Telemetry evaluated.', {
        aquariumId,
        classification: result.classification,
        sampleReason: result.sampleReason,
        alertOperations: result.alertOperations,
        firestoreWrites: result.firestoreWrites,
      });
    }
  }
);

// Every minute: device_offline alerts from a stale RTDB updatedAt (60 s window).
export const checkDeviceHeartbeat = onSchedule(
  { schedule: 'every 1 minutes', retryCount: 0, maxInstances: 1, timeoutSeconds: 50 },
  async () => {
    const result = await checkDeviceHeartbeats(dependencies);
    if (result.opened > 0 || result.resolved > 0) {
      logger.info('Device heartbeat changes.', result);
    }
  }
);

// Daily: next-cleaning schedule and cleaning_due recommendations.
export const checkCleaningSchedule = onSchedule(
  { schedule: 'every day 06:00', timeZone: 'Asia/Manila', retryCount: 1, maxInstances: 1, timeoutSeconds: 300 },
  async () => {
    const result = await runDailyCleaningCheck({ firestore: dependencies.firestore });
    logger.info('Cleaning schedule check completed.', result);
  }
);

// A logged cleaning starts a new cleaning cycle (logging UI arrives in Sprint 4;
// maintenance_actions are trusted-writes only until then).
export const onMaintenanceActionLogged = onDocumentCreated(
  { document: 'maintenance_actions/{actionId}' },
  async (event) => {
    const action = event.data?.data();
    if (!action || action.actionType !== 'cleaning' || typeof action.aquariumId !== 'string') {
      return;
    }
    await refreshCleaningSchedule({ firestore: dependencies.firestore }, action.aquariumId, { resolvePendingCleaning: true });
  }
);
