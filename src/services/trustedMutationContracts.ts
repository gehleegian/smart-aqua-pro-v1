import type { UserRole } from '../types/user';

export const TRUSTED_MUTATION_FUNCTIONS = {
  transferAquariumOwnership: 'transferAquariumOwnership',
  prepareAquariumDeletion: 'prepareAquariumDeletion',
  updateUserRole: 'updateUserRoleTrusted',
  revokeUserAccount: 'revokeUserAccount',
} as const;

export type TrustedMutationStatus = 'completed' | 'prepared' | 'revoked';

export type TrustedMutationResult = {
  operationId: string;
  resourceId: string;
  status: TrustedMutationStatus;
};

export function createIdempotencyKey(operation: string, resourceId: string) {
  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${operation}-${resourceId}-${randomPart}`;
}

export function buildTransferRequest(
  aquariumId: string,
  newOwnerUid: string,
  idempotencyKey: string
) {
  return { aquariumId, newOwnerUid, idempotencyKey };
}

export function buildAquariumDeletionRequest(
  aquariumId: string,
  idempotencyKey: string
) {
  return { aquariumId, idempotencyKey };
}

export function buildRoleUpdateRequest(
  targetUid: string,
  role: UserRole,
  idempotencyKey: string
) {
  return { targetUid, role, idempotencyKey };
}

export function buildUserRevocationRequest(
  targetUid: string,
  idempotencyKey: string
) {
  return { targetUid, idempotencyKey };
}

export function readTrustedMutationResult(value: unknown): TrustedMutationResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('The trusted operation returned an invalid response.');
  }

  const result = value as Record<string, unknown>;
  const status = result.status;

  if (
    typeof result.operationId !== 'string' ||
    typeof result.resourceId !== 'string' ||
    (status !== 'completed' && status !== 'prepared' && status !== 'revoked')
  ) {
    throw new Error('The trusted operation returned an invalid response.');
  }

  return {
    operationId: result.operationId,
    resourceId: result.resourceId,
    status,
  };
}
