import { FirebaseError } from 'firebase/app';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import type { UserRole } from '../types/user';
import {
  TRUSTED_MUTATION_FUNCTIONS,
  buildAquariumDeletionRequest,
  buildRoleUpdateRequest,
  buildTransferRequest,
  buildUserRevocationRequest,
  readTrustedMutationResult,
  type TrustedMutationResult,
} from './trustedMutationContracts';

export class TrustedMutationClientError extends Error {
  readonly code: string;
  readonly recoveryRequired: boolean;

  constructor(
    code: string,
    message: string,
    recoveryRequired = false
  ) {
    super(message);
    this.name = 'TrustedMutationClientError';
    this.code = code;
    this.recoveryRequired = recoveryRequired;
  }
}

function mapCallableError(error: unknown): TrustedMutationClientError {
  const code = error instanceof FirebaseError ? error.code : '';
  const messages: Record<string, string> = {
    'functions/unauthenticated': 'Your session has expired. Please sign in again.',
    'functions/permission-denied': 'You are not authorized to perform this operation.',
    'functions/invalid-argument': 'The submitted operation details are invalid.',
    'functions/not-found': 'The requested account or aquarium was not found.',
    'functions/already-exists': 'This request conflicts with an existing operation.',
    'functions/aborted': 'Another operation is already in progress. Please refresh and try again.',
    'functions/failed-precondition':
      'The operation could not be completed in its current state. Administrative review may be required.',
    'functions/unavailable': 'The secure service is temporarily unavailable. Please try again.',
    'functions/internal':
      'The secure operation could not be completed. Administrative recovery may be required.',
  };

  return new TrustedMutationClientError(
    code || 'functions/unknown',
    messages[code] || 'The secure operation could not be completed. Please try again.',
    code === 'functions/failed-precondition' || code === 'functions/internal'
  );
}

async function callTrustedMutation(
  name: string,
  payload: Record<string, unknown>
): Promise<TrustedMutationResult> {
  try {
    const callable = httpsCallable<Record<string, unknown>, unknown>(functions, name);
    const response = await callable(payload);
    return readTrustedMutationResult(response.data);
  } catch (error) {
    if (error instanceof TrustedMutationClientError) {
      throw error;
    }

    if (error instanceof Error && error.message === 'The trusted operation returned an invalid response.') {
      throw new TrustedMutationClientError(
        'functions/invalid-response',
        'The secure service returned an unexpected response. Please refresh before continuing.',
        true
      );
    }

    throw mapCallableError(error);
  }
}

export function transferAquariumOwnershipTrusted(
  aquariumId: string,
  newOwnerUid: string,
  idempotencyKey: string
) {
  return callTrustedMutation(
    TRUSTED_MUTATION_FUNCTIONS.transferAquariumOwnership,
    buildTransferRequest(aquariumId, newOwnerUid, idempotencyKey)
  );
}

export function prepareAquariumDeletionTrusted(
  aquariumId: string,
  idempotencyKey: string
) {
  return callTrustedMutation(
    TRUSTED_MUTATION_FUNCTIONS.prepareAquariumDeletion,
    buildAquariumDeletionRequest(aquariumId, idempotencyKey)
  );
}

export function updateUserRoleTrusted(
  targetUid: string,
  role: UserRole,
  idempotencyKey: string
) {
  return callTrustedMutation(
    TRUSTED_MUTATION_FUNCTIONS.updateUserRole,
    buildRoleUpdateRequest(targetUid, role, idempotencyKey)
  );
}

export function revokeUserAccountTrusted(
  targetUid: string,
  idempotencyKey: string
) {
  return callTrustedMutation(
    TRUSTED_MUTATION_FUNCTIONS.revokeUserAccount,
    buildUserRevocationRequest(targetUid, idempotencyKey)
  );
}
