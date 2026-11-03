# SmartAqua Pro Phase 4 Trusted Mutation API

## Status and scope

Phase 4 is IMPLEMENTED AND VERIFIED IN LOCAL FIREBASE EMULATORS. Nothing in this document or the repository has been deployed. The implementation adds trusted, revocation-first backend workflows for ownership transfer, deletion preparation, role changes, and account revocation while preserving Firestore as the canonical source for ownership and roles.

This phase deliberately does not integrate the web or mobile clients, permanently delete retained records, modify ESP32 firmware, change sensor schemas or classifications, or deploy Firebase configuration.

## Security invariants

- A callable request must have a Firebase Auth identity with a verified email and a matching enabled Auth account.
- Administrative mutations also require the caller's current Firestore profile role to be `Admin`; client claims alone are not authority.
- Aquarium ownership remains canonical at `aquariums/{aquariumId}.ownerId`.
- User role remains canonical at `users/{uid}.role`.
- Revocation or a transition is written before a canonical ownership or role mutation.
- Security block documents prevent stale triggers and reconciliation from restoring access during or after a protected workflow.
- Operations are idempotent per actor and idempotency key. Reusing a key for a different request is rejected.
- Per-resource locks serialize conflicting ownership and user operations.
- Uncertain or failed post-lock work stays denied and is marked `recovery_required`.
- A request rejected before acquiring a trusted lock does not create a privileged recovery record.
- `account_status` is informational and is not used for authorization.
- Admin status does not grant access to RTDB telemetry, history, recommendations, or equipment control.

## Callable operations

| Callable | Authorized actor | Input | Result | Canonical data outcome |
| --- | --- | --- | --- | --- |
| `transferAquariumOwnership` | Admin | `aquariumId`, `newOwnerUid`, `idempotencyKey` | `completed` | Atomically updates aquarium and directory ownership, then activates only the eligible new User |
| `prepareAquariumDeletion` | Current User owner | `aquariumId`, `idempotencyKey` | `prepared` | Revokes access and records a deletion preparation; does not delete aquarium data |
| `updateUserRoleTrusted` | Admin, excluding self | `targetUid`, `role`, `idempotencyKey` | `completed` | Revokes first, changes the canonical role, revokes refresh tokens, then resynchronizes eligibility |
| `revokeUserAccount` | Admin, excluding self | `targetUid`, `idempotencyKey` | `revoked` | Revokes user/aquarium access, disables Auth, revokes refresh tokens, and retains canonical records |

The final remaining Administrator cannot be demoted. Transfers require an enabled Auth account and a canonical Firestore `User` profile for the recipient. One User may own multiple aquariums; user-level workflows enumerate and lock all currently owned aquariums.

## Revocation-first workflows

### Ownership transfer

1. Revalidate the caller, recipient, current owner, existing operation, lock, and block.
2. Acquire an aquarium lock and create a temporary Firestore access block.
3. Set the RTDB aquarium mirror to `transitioning` before changing ownership.
4. In a Firestore transaction, update both `aquariums/{id}` and `aquarium_directory/{id}`.
5. Confirm the recipient Auth account remains enabled and synchronize the mirror with an operation-scoped bypass.
6. Release the lock and temporary block, then synchronize once more without the bypass.

Neither the old nor new owner has RTDB access while the mirror is `transitioning`. A stale trigger cannot reactivate the aquarium while its security block exists.

### Aquarium deletion preparation

The current owner may prepare deletion. The workflow creates a permanent aquarium block, revokes the RTDB mirror, records `security_aquarium_deletion_preparations/{aquariumId}`, and marks the retained aquarium and directory records `lifecycleState: "deletion_prepared"`. The retained records are disassociated from the former owner by clearing `ownerId`; this prevents a blocked record from making the former owner's complete owner query fail while preserving the record for approved retention and recovery. Structured history and related records remain retained. A separate finalization operation is MISSING by design.

### Role change

The workflow locks the target user and every aquarium currently owned by that user, blocks access, makes the RTDB user/aquarium projection transitioning or revoked, changes the canonical role, revokes refresh tokens, and resynchronizes authorization. Promotion to Admin leaves owned aquariums revoked because Admins do not receive live aquarium access.

### User account revocation

The workflow permanently blocks the user and every currently owned aquarium, removes the user RTDB mirror, revokes aquarium mirrors, disables the Firebase Auth account, and revokes refresh tokens. Firestore user, aquarium, directory, and historical records are retained. This is secure revocation, not permanent deletion.

## Trusted workflow records

| Collection | Purpose | Client access |
| --- | --- | --- |
| `security_mutation_operations` | Idempotency fingerprint, progress, terminal result, and recovery state | Denied |
| `security_mutation_locks` | User and aquarium serialization locks | Denied |
| `security_user_blocks` | Immediate Firestore and synchronization deny marker | Denied |
| `security_aquarium_blocks` | Immediate Firestore and synchronization deny marker | Denied |
| `security_aquarium_deletion_preparations` | Retained deletion-preparation record | Denied |
| `security_audit_events` | Append-style workflow stage evidence | Denied |

The Admin SDK owns these collections. Firestore rules contain no client grants for them.

## Firestore rule hardening

The draft Firestore rules now deny verified users when a matching user or aquarium security block exists. Direct client deletion of `aquariums/{id}` and `aquarium_directory/{id}` is denied, including paired batches. Direct role changes, user deletion, and ownership transfer remain denied. Admins retain directory read access only and are still denied aquarium records and alert records.

Phase 5 replaces the legacy web `deleteAquarium()` client mutation with `prepareAquariumDeletion` and reports a prepared/pending-retention state. Direct client deletion remains denied.

## Concurrency, idempotency, and recovery

- A deterministic operation ID is derived from the actor and caller-supplied idempotency key.
- A request fingerprint binds the operation to its mutation type and payload.
- Duplicate identical requests return the stored terminal result.
- A reused key with different input is rejected.
- Locks reject simultaneous conflicting operations; they are intentionally fail-closed and do not expire automatically.
- Failures after lock acquisition set the operation to `recovery_required` while access blocks remain in force.
- Recovery uses the same actor, payload, and idempotency key; manual lock deletion is not an approved recovery method.
- Trigger synchronization and reconciliation consult blocks and therefore cannot silently reactivate protected resources.

Operational alerting, lock-age monitoring, an operator recovery tool, audit retention, and disaster-recovery runbooks remain required before production.

## Token revocation boundary

Refresh-token revocation and Auth disablement prevent new sessions and refreshes, but an already issued Firebase ID token may remain cryptographically valid until expiry. The Firestore security blocks and RTDB authorization revocation provide the immediate data-access boundary tested in this phase. Production token timing and client sign-out behavior are NOT VERIFIED.

## Client and hardware compatibility

No web or mobile source was changed in Phase 4. Existing monitoring subscriptions and equipment-command payloads were not modified. The new callables are not yet invoked by either client. No ESP32 firmware, device claim, telemetry protocol, or physical command behavior was changed or verified.

The approved current Admin scope remains directory-only: users and the aquariums listed under them, without live readings or aquarium control. The repository manuscript contains broader Admin-monitoring language and still references ammonia in places, while the approved project clarification excludes ammonia. These are documented source conflicts; Phase 4 does not rewrite the manuscript or sensor logic.

## Production blockers

- Complete and approve any pending Admin role, revocation, or ownership-transfer UI before exposing those operations to users.
- Decide whether ownership transfer is exposed only to Admins or through a separately approved process.
- Define permanent deletion, retention, export, device reassignment, and legal/audit requirements.
- Add App Check enforcement and an approved rollout strategy for callable clients.
- Select the Functions region and least-privilege runtime service account.
- Add monitoring for `recovery_required`, stale locks, failed revocation, and reconciliation drift.
- Verify token lifecycle and client behavior in an isolated non-production Firebase project.
- Run realistic concurrent and long-duration testing; local emulator tests do not prove production capacity or reliability.
- Complete device provisioning and ESP32 authentication design.
- Obtain explicit authorization before any deployment.
