# SmartAqua Pro Trusted Authorization Synchronization Backend

## Status and decision

The Phase 3 backend is IMPLEMENTED IN SOFTWARE and VERIFIED IN LOCAL EMULATORS. It has not been deployed. Firestore remains authoritative for `users/{uid}.role` and `aquariums/{aquariumId}.ownerId`; RTDB contains only the authorization projection consumed by the existing default-deny rules.

The backend uses second-generation Firebase Cloud Functions and the Firebase Admin SDK in `functions/`. Privileged SDK code is not imported by the web app, mobile app, or firmware. No service-account key is stored in the repository.

| Area | Status | Result |
| --- | --- | --- |
| User role synchronization | IMPLEMENTED | Create, role change, deletion, missing profile, and invalid role handled |
| Aquarium ownership synchronization | IMPLEMENTED | Create, assignment, transfer event, deletion, missing/invalid owner handled |
| Duplicate and stale event protection | IMPLEMENTED | Handlers reread Firestore; current mirrors are not rewritten |
| Failed-write retry behavior | IMPLEMENTED | Event triggers enable retry and the core is idempotent |
| Reconciliation | IMPLEMENTED | Daily scheduled handler and directly testable reconciliation core |
| Immediate cross-database revocation | PARTIAL | Trigger processing is fail-closed once invoked, but Firestore and RTDB are not atomic |
| Trusted ownership and revocation mutation API | IMPLEMENTED | Phase 4 callables and core workflows passed local emulator tests; client integration and deployment remain pending |
| Device provisioning | MISSING | Deliberately deferred pending firmware and credential design |
| Production deployment | NOT VERIFIED | Prohibited and not attempted |

## Backend architecture

`syncUserAuthorizationMirror` listens only to `users/{uid}` create, delete, or role changes. Updates that do not change the role, including `account_status`, return without an RTDB write.

`syncAquariumAuthorizationMirror` listens only to `aquariums/{aquariumId}` create, delete, or owner changes. Aquarium profile, threshold, automation, and manual-status updates do not recreate the authorization mirror.

Both triggers use `retry: true`. The synchronization core rereads the current Firestore document instead of trusting event payload data. It writes `sourceUpdatedAt` and `syncedAt`, compares the mirror before writing, and rereads the source after writing. If the source changes repeatedly during three attempts, the user mirror is removed or the aquarium remains `transitioning`, and the function throws so the platform may retry.

`reconcileAuthorizationMirror` runs on the proposed `every 24 hours` schedule with one maximum instance. It compares current Firestore users and aquariums with RTDB mirrors, repairs missing or stale mappings, removes orphan user mirrors, and leaves orphan aquariums revoked. The schedule is a draft operational choice and must be approved with billing, region, monitoring, and retention requirements before deployment.

## Authorization outcomes

### User profile

- Valid `User`: project `role: "User"` and metadata.
- Valid `Admin`: project `role: "Admin"`; synchronize owned aquariums to revoked because Admins do not receive live RTDB access.
- Missing or invalid role: remove the user mirror and revoke Firestore aquariums still naming that UID.
- `account_status`: ignored for authorization, as required.

### Aquarium

- Existing aquarium with a non-empty `ownerId` and a canonical owner whose role is `User`: project `ownerUid`, `state: "active"`, and metadata.
- Owner change: change the mirror to `transitioning` before activating the new canonical owner when the existing mirror differs. Preserve `deviceUids` because devices belong to the aquarium, not the human owner.
- Missing owner, missing owner profile, invalid owner role, or Admin owner: set `state: "revoked"`.
- Deleted aquarium: retain a revoked tombstone and remove `ownerUid`, `deviceUids`, and source metadata.

All RTDB authorization paths reject identifiers containing characters that RTDB cannot use as keys.

## Idempotency, ordering, and recovery

- Duplicate delivery is safe because a mirror whose role, owner, state, and source update time already match Firestore is not rewritten.
- Out-of-order events are safe against stale restoration because handlers ignore event data as authority and reread current Firestore state.
- Concurrent changes are retried against a fresh source snapshot. Repeated instability leaves access denied and raises an error.
- Transient failures are surfaced through structured Cloud Functions logs with the event ID and affected UID or aquarium ID, then rethrown for platform retry.
- Reconciliation repairs drift that remains after exhausted retries or operational outages.
- RTDB rules continue to deny all client reads and writes under `/authorization`; only the Admin SDK bypasses rules in the trusted runtime.

## Revocation-first mutation status

Firestore and RTDB cannot be updated atomically. Phase 4 therefore added trusted revocation-first mutations: the workflow places Firestore security blocks and writes RTDB `transitioning` or `revoked` state before changing canonical ownership or role data. The synchronization triggers and reconciliation now consult those blocks, preventing stale events from restoring access. Failures after a lock is acquired remain denied and are recorded as `recovery_required`.

Phase 5 routes the web aquarium deletion action through the trusted `prepareAquariumDeletion` callable. No web or mobile ownership-transfer interface currently exists; the web service exposes only the trusted callable boundary for a future approved interface. The trusted ownership transfer and deletion workflows:

1. authenticates and authorizes the requester;
2. writes RTDB `state: "transitioning"` or `"revoked"` first;
3. performs the Firestore ownership or deletion transaction, including `aquarium_directory` consistency;
4. rereads canonical Firestore records;
5. activates only a valid User owner;
6. leaves access denied and creates an operational alert on failure.

The API is now implemented locally and documented in `docs/security/trusted-mutation-api.md`, but web/mobile integration is intentionally deferred. The existing web direct-delete path remains a production blocker and will be denied by the Phase 4 draft Firestore rules.

## Web and mobile compatibility

The web application still reads and writes the established RTDB paths:

- `/devices/{aquariumId}/telemetry`
- `/devices/{aquariumId}/control`
- `/devices/{aquariumId}/commands/latest`
- date-specific `/devices/{aquariumId}/history/{dateKey}`

The mobile application uses the same telemetry, control, and latest-command paths and checks Firestore ownership before subscribing. No web or mobile source file was changed in Phase 3. The optimized web listeners and their cleanup behavior remain intact.

Phase 5 replaces the legacy direct Admin service mutations with `updateUserRoleTrusted` and `revokeUserAccount`. The current directory UI remains read-only, so those operations are available at the service boundary but are not exposed through a newly invented Admin interface.

## Device provisioning boundary

Device authorization remains deferred. A future provisioning service must create one revocable Firebase identity per device, issue the trusted `principalType: "device"` claim, assign only that UID under the correct aquarium, support replacement and revocation, and keep Admin credentials and service-account keys out of firmware. The telemetry and device-history protocol, token renewal, offline behavior, replay protection, and physical credential storage still require approval and hardware testing.

## Local execution

Install and validate only in the repository:

```powershell
cd C:\new\smart-aqua-pro-v1
npm install --prefix functions
npm run build:functions
npm run lint:functions
npm run test:auth-sync
npm run test:auth-sync-trigger
npm run test:rtdb-rules
```

Do not run `firebase deploy`. The emulator scripts use only `demo-smartaqua-auth-sync` and `demo-smartaqua-rtdb-auth`.

## Production prerequisites

- Review the locally implemented ownership transfer, deletion preparation, role change, and account-revocation workflows.
- Migrate existing client mutations to the trusted callables without breaking web/mobile behavior.
- Choose the Cloud Functions region to match Firestore and RTDB locations.
- Enable and fund required Cloud Functions, Eventarc, Artifact Registry, Cloud Build, Pub/Sub, and Cloud Scheduler services as applicable.
- Assign a least-privilege runtime service account that can read canonical Firestore documents and write only the required RTDB authorization paths. The default broad Admin SDK privilege should not be accepted without IAM review.
- Approve reconciliation frequency, pagination, tombstone retention, alerting, dashboards, and incident response.
- Test in an isolated non-production Firebase project with realistic account and aquarium records.
- Backfill and reconcile the mirror before enabling RTDB rules in any live environment.
- Verify rollback steps and export the currently deployed rules before any change.
- Obtain explicit production deployment authorization.

## Emulator results on October 18, 2026

- Backend TypeScript compilation: PASS.
- Backend targeted lint: PASS.
- Backend production dependency audit: PASS, 0 known vulnerabilities reported.
- Synchronization core: 11 passed, 0 failed.
- Functions trigger dispatch: 1 passed, 0 failed.
- Existing RTDB authorization regression: 40 passed, 0 failed.
- RTDB rule corrections: none required.
- Production resources modified: none.

The separate web production dependency audit still reports four pre-existing transitive findings through the web Firebase dependency: one moderate, two high, and one critical advisory across `@grpc/grpc-js`, `@protobufjs/utf8`, `protobufjs`, and `websocket-driver`. Phase 3 did not modify the web Firebase dependency tree. Remediation requires a separately reviewed dependency update and regression test; `npm audit fix` was not run automatically.

The Functions emulator used host Node.js 24.15.0 and warned that the declared deployment runtime is Node.js 22. The function definitions were discovered successfully, including retry-enabled Firestore triggers. The scheduled function was discovered but not invoked because Pub/Sub was intentionally not started; its reconciliation core was verified directly by SYNC-11.

These results validate the tested software behavior in local emulators. They do not prove production delivery timing, immediate revocation, long-duration stability, multi-user capacity, real-device authentication, or ESP32 behavior.
