import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  TRUSTED_MUTATION_FUNCTIONS,
  buildAquariumDeletionRequest,
  buildRoleUpdateRequest,
  buildTransferRequest,
  buildUserRevocationRequest,
  createIdempotencyKey,
  readTrustedMutationResult,
} from '../../src/services/trustedMutationContracts.ts';

test('CLIENT-01 callable names match the Phase 4 exports', () => {
  assert.deepEqual(TRUSTED_MUTATION_FUNCTIONS, {
    transferAquariumOwnership: 'transferAquariumOwnership',
    prepareAquariumDeletion: 'prepareAquariumDeletion',
    updateUserRole: 'updateUserRoleTrusted',
    revokeUserAccount: 'revokeUserAccount',
  });
});

test('CLIENT-02 request builders preserve the exact callable payload contracts', () => {
  assert.deepEqual(buildTransferRequest('aquarium-a', 'user-b', 'transfer-key'), {
    aquariumId: 'aquarium-a',
    newOwnerUid: 'user-b',
    idempotencyKey: 'transfer-key',
  });
  assert.deepEqual(buildAquariumDeletionRequest('aquarium-a', 'delete-key'), {
    aquariumId: 'aquarium-a',
    idempotencyKey: 'delete-key',
  });
  assert.deepEqual(buildRoleUpdateRequest('user-b', 'Admin', 'role-key'), {
    targetUid: 'user-b',
    role: 'Admin',
    idempotencyKey: 'role-key',
  });
  assert.deepEqual(buildUserRevocationRequest('user-b', 'revoke-key'), {
    targetUid: 'user-b',
    idempotencyKey: 'revoke-key',
  });
});

test('CLIENT-03 idempotency keys remain unique and operation-scoped', () => {
  const first = createIdempotencyKey('aquarium-deletion', 'aquarium-a');
  const second = createIdempotencyKey('aquarium-deletion', 'aquarium-a');
  assert.match(first, /^aquarium-deletion-aquarium-a-/);
  assert.notEqual(first, second);
});

test('CLIENT-04 terminal results are validated before the UI reports success', () => {
  assert.deepEqual(
    readTrustedMutationResult({
      operationId: 'operation-a',
      resourceId: 'aquarium-a',
      status: 'prepared',
    }),
    {
      operationId: 'operation-a',
      resourceId: 'aquarium-a',
      status: 'prepared',
    }
  );
  assert.throws(
    () => readTrustedMutationResult({ status: 'success' }),
    /invalid response/
  );
});

test('CLIENT-05 sensitive web services do not retain legacy direct delete mutations', async () => {
  const [userService, aquariumService] = await Promise.all([
    readFile(new URL('../../src/services/userService.ts', import.meta.url), 'utf8'),
    readFile(new URL('../../src/services/aquariumService.ts', import.meta.url), 'utf8'),
  ]);

  assert.doesNotMatch(userService, /deleteDoc\s*\(/);
  assert.doesNotMatch(aquariumService, /batch\.delete\s*\(/);
  assert.match(userService, /updateUserRoleTrusted/);
  assert.match(userService, /revokeUserAccountTrusted/);
  assert.match(aquariumService, /prepareAquariumDeletionTrusted/);
});
