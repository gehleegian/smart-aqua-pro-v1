import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onValueWritten } from 'firebase-functions/v2/database';
import { defineString } from 'firebase-functions/params';
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

    if (
      event.data?.before.exists &&
      event.data.after.exists &&
      beforeOwner === afterOwner
    ) {
      return;
    }

    try {
      const result = await syncAquariumAuthorization(
        dependencies,
        event.params.aquariumId,
        { transitionBeforeActivation: true }
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

// Device contract decision 6: sampled, validated history from live telemetry.
// Writes Firestore sensor_readings (flat + nested) with a validity summary.
export const ingestDeviceTelemetry = onValueWritten(
  { ref: '/devices/{aquariumId}/telemetry' },
  async (event) => {
    if (!event.data.after.exists()) {
      return;
    }
    const aquariumId = event.params.aquariumId;
    const result = await ingestTelemetry({ firestore: dependencies.firestore }, aquariumId, event.data.after.val());
    if (result.written) {
      logger.info('Telemetry history row written.', { aquariumId, docId: result.docId, sampleReason: result.sampleReason });
    } else if (result.reason !== 'rate_limited') {
      logger.warn('Telemetry not ingested.', { aquariumId, reason: result.reason });
    }
  }
);
