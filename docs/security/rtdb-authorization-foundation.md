# SmartAqua Pro RTDB Authorization Foundation

## Status and scope

This document defines the draft Firebase Realtime Database authorization contract for SmartAqua Pro. It is a design and non-production validation artifact. The rules registered in `database.rules.json` are not deployed, no production authorization records have been created, and synchronization is not operational.

This phase preserves the existing division of responsibilities:

- Cloud Firestore is authoritative for users, roles, aquarium profiles, aquarium ownership, structured history, alerts, reports, and other application records.
- `aquariums/{aquariumId}.ownerId` is the canonical ownership field.
- `users/{uid}.role` is the canonical role field.
- RTDB continues to use `/devices/{aquariumId}/telemetry`, `/control`, `/commands/latest`, and `/history` for live device-oriented information.
- `account_status` remains informational and is not part of an authorization decision.
- The web and mobile application logic, listener optimization, Firestore rules, firmware, thresholds, and rule-based prescriptive analytics are unchanged.

Adding the `database.rules.json` reference to `firebase.json` does not deploy the draft. Do not run `firebase deploy`, `firebase deploy --only database`, or a broader Firebase deployment until every prerequisite in this document is complete and explicit production deployment approval has been granted.

| Area | Status | Meaning |
| --- | --- | --- |
| Draft RTDB rules and Firebase configuration reference | IMPLEMENTED | Present in the repository only; not deployed |
| Authorization contract, permission matrix, and synchronization design | IMPLEMENTED | Documented and ready for review |
| Web/mobile operation compatibility assessment | IMPLEMENTED | Statically checked against current source |
| Rules JSON parsing | IMPLEMENTED | Parsed successfully on the development machine |
| RTDB rules compilation and emulator authorization tests | IMPLEMENTED | Rules compiled; 40 tests passed in two consecutive isolated runs |
| Trusted backend synchronization | IMPLEMENTED | Phase 3 Cloud Functions and reconciliation logic exist locally and passed emulator tests; not deployed |
| Trusted ownership and revocation mutations | IMPLEMENTED | Phase 4 callables, blocks, locks, idempotency, and local emulator tests exist; client integration and deployment remain pending |
| ESP32 authentication and protocol | MISSING | Deliberately deferred pending firmware/provisioning approval |
| Administrator manuscript scope | CONFLICTING | Manuscript wording is broader than current approved Admin behavior |
| Production deployment | NOT VERIFIED | Prohibited and not attempted |

## Governing sources and current conflict

The repository source of truth is the current implementation plus `AGENTS.md`. The repository also contains `Chapter 1 And 2 - updated schema.docx` and `manuscriopt-analysis.docx`. The updated-schema document was treated as the current manuscript source because it contains the revised schema and assigned-aquarium language; the repository does not contain independent approval metadata.

The manuscript consistently requires assigned-aquarium isolation and states that User/Caretaker sessions receive real-time readings, alerts, recommendations, history, and supported equipment controls. Some manuscript passages also broadly state that System Administrators receive monitoring information or can view updated sensor readings. That conflicts with the current approved application behavior and this implementation directive: Admins can see Firestore directory information but cannot read live RTDB telemetry or control equipment. The draft rules preserve the current directory-only Admin scope. The manuscript wording should be reconciled separately before any future expansion of Admin permissions.

## Architecture decision

The draft uses a hybrid authorization design:

1. Firebase Authentication identifies a human or device principal.
2. Firestore remains authoritative for human roles and aquarium ownership.
3. A future trusted backend projects only the facts required by RTDB rules.
4. RTDB rules evaluate the authenticated identity against the projection.
5. Future ESP32 devices use distinct Firebase identities with a trusted `principalType: "device"` custom claim.

Custom claims are intentionally limited to coarse principal classification. Aquarium IDs are not stored in claims because ownership is dynamic, claims are size-limited, and changes are not visible until an ID token refreshes. The RTDB mirror provides dynamic resource authorization while Firestore remains the source of truth.

The browser and mobile Firestore ownership checks remain useful for user experience but are not the security boundary. RTDB rules enforce the final decision.

## Authorization contract

The future trusted backend will maintain this structure:

```text
authorization/
  users/
    {uid}/
      role: "User" | "Admin"
      sourceUpdatedAt: "<Firestore update time>"
      syncedAt: <server timestamp>

  aquariums/
    {aquariumId}/
      ownerUid: "{firebase-auth-uid}"
      state: "active" | "revoked" | "transitioning"
      deviceUids/
        {deviceUid}: true
      sourceUpdatedAt: "<Firestore update time>"
      syncedAt: <server timestamp>
```

`sourceUpdatedAt` and `syncedAt` are recommended synchronization metadata. They are not used to grant access. They support auditing, stale-event detection, reconciliation, and operational recovery.

The mirror follows these invariants:

- Only a trusted backend using the Firebase Admin SDK or an equivalently privileged server may write the mirror.
- Ordinary users, Admin UI clients, and devices cannot read or write `/authorization` directly.
- A human is eligible for aquarium access only when the mirrored role is `User`, the aquarium state is `active`, the mirrored `ownerUid` equals `auth.uid`, and the Firebase token reports a verified email.
- An Admin mirror role never grants access to `/devices`.
- A device is eligible only when its signed token contains `principalType: "device"`, the aquarium state is `active`, and its UID appears under that aquarium's `deviceUids`.
- Missing, revoked, or transitioning records fail closed.
- Device and human identities are independent. A device credential is never shared with a human account.

RTDB rules cannot query Firestore. The mirror is therefore required before these rules can safely be deployed.

## Draft rule structure

The draft is default-deny at the database root. It does not grant access at `/devices`, `/devices/{aquariumId}`, or `/authorization`. Permissions are attached only to the required child paths.

### Telemetry

- Verified, mirrored User owner: read.
- Admin: denied.
- Assigned claimed device: write.
- Human browser/mobile clients: write denied.
- Known telemetry field names and types are validated.
- No numerical water-quality thresholds are enforced because thresholds belong to the approved analysis configuration, not the transport schema.
- The legacy `waterQualityPercent` field remains accepted for compatibility with the current web normalizer.

The telemetry draft requires `temperatureC`, `waterLevelPercent`, `updatedAt`, and `online`, matching the current web `DeviceTelemetry` contract and normalization requirements. The physical device payload remains unverified; these requirements must be confirmed during the firmware protocol phase.

### Control

- Verified, mirrored User owner: read and write.
- Assigned claimed device: read only.
- Admin: denied.
- The established web/mobile control fields are the only accepted fields.
- Mode, booleans, schedule strings, current supported equipment states, update timestamp, and the existing 1-to-24-hour filtration runtime constraint are validated.
- The web payload may omit `lightOnTime` and `lightOffTime`; the mobile payload may include them. Both remain valid.

### Commands

- Verified, mirrored User owner: read and submit `commands/latest`.
- Assigned claimed device: read only.
- Admin: denied.
- The command's `aquariumId` must match the path and `requestedBy` must match `auth.uid`.
- `feed_now`, `set_filter_state`, `set_light_state`, and the existing web type `sync_control` are the only accepted types.
- Type-specific state and duration combinations are validated.
- Devices cannot create human-issued commands.

The existing `/commands/latest` model is last-write-wins and has no acknowledgement schema. The rules do not solve command ordering, loss, retry, or completion reporting.

### History

- Verified, mirrored User owner: read only at `/history/{dateKey}`.
- Broad reads at `/history`, `/devices/{aquariumId}`, and `/devices` are not granted.
- User, Admin, and device writes are denied in this draft.

Device history append remains intentionally disabled because the firmware entry key, timestamp authority, retry behavior, duplicate policy, and immutable entry schema are not approved. A later rules revision may grant create-only access at `/history/{dateKey}/{entryId}` after that protocol is specified and tested.

## Permission matrix

| Path | User owner | Admin | Assigned device | Trusted backend |
| --- | --- | --- | --- | --- |
| `/authorization/**` | Deny read/write | Deny read/write | Deny read/write | Read/write through privileged SDK |
| `/devices/{id}/telemetry` | Read | Deny | Write | Read/write as operationally required |
| `/devices/{id}/control` | Read/write approved fields | Deny | Read | Read/write as operationally required |
| `/devices/{id}/commands/latest` | Read/write approved command | Deny | Read | Read/write as operationally required |
| `/devices/{id}/history/{dateKey}` | Read | Deny | Deny in this draft | Read/write as operationally required |
| Unknown RTDB paths | Deny | Deny | Deny | Privileged SDK only when explicitly required |

## Trusted backend synchronization specification

The Phase 3 backend is implemented under `functions/` and documented in `docs/security/trusted-authorization-sync-backend.md`. It remains non-production and undeployed. It must use least-privilege IAM, keep service-account material out of all client and firmware repositories, and record enough operational context to audit every authorization change.

### User creation

After the verified Firestore user profile exists, read the current profile and upsert `/authorization/users/{uid}` with the canonical role and synchronization metadata. A missing mirror record denies RTDB access until synchronization succeeds.

### User role change

Role changes must pass through a trusted backend operation. Revoke the user's RTDB eligibility first, update Firestore, reread the canonical profile, then write the new mirrored role. A transition to `Admin` must immediately remove User eligibility even if the user still appears as an aquarium owner in stale data.

### Aquarium creation and assignment

After the Firestore aquarium transaction succeeds, reread the aquarium and user profile, verify that the owner exists and has role `User`, then create an `active` mirror record. Creation may temporarily fail closed while the mirror is absent.

### Ownership transfer

Ownership transfer must not be a direct client write. Use a revocation-first workflow:

1. Set the mirror state to `transitioning` so neither owner is authorized.
2. Update Firestore ownership through the trusted operation.
3. Reread the current Firestore aquarium and new owner profile.
4. Replace `ownerUid` and synchronization metadata.
5. Set state to `active` only after all checks succeed.

If any step fails, leave access denied, retry safely, and require reconciliation. Never restore an owner from an old event payload without rereading Firestore.

### Aquarium deletion

Set the mirror state to `revoked` before deleting Firestore ownership records. Remove device assignments and complete any approved data-retention process before deleting the mirror. An asynchronous delete trigger alone is insufficient because failure could leave a stale owner authorized.

### User deletion

The trusted workflow must revoke the user mirror and every owned aquarium first. Each aquarium must be deleted or transferred through its approved workflow. Only then should it delete the Firebase Auth user and Firestore profile. Deleting only `users/{uid}` is not sufficient.

### Device provisioning

Provision a unique Firebase Auth identity for each physical device through trusted infrastructure. Issue the `principalType: "device"` claim and add the device UID only to its assigned aquarium. Never embed a Firebase Admin credential, service-account key, or permanent privileged secret in firmware.

### Device reassignment and revocation

Remove or revoke the old device mapping before activating a replacement assignment. Reassignment must be fail-closed during transition. Token revocation and mirror removal are separate controls and should both be applied where supported.

### Duplicate and out-of-order events

Firestore event handlers are at-least-once and ordering is not guaranteed. Every handler must be idempotent and must reread current Firestore state before writing RTDB. An old event must not overwrite a projection derived from newer canonical data. `sourceUpdatedAt` provides an additional stale-write check and audit reference.

### Synchronization failure and reconciliation

- Missing or uncertain state denies access.
- Failed activation remains `transitioning` or absent.
- Failed revocation is a security incident and must be retried and surfaced operationally.
- A periodic reconciliation job must compare every mirror record with current Firestore role and ownership data, create missing projections, correct mismatches, and revoke orphaned records.
- Reconciliation actions and manual recovery must be auditable.

RTDB rules can enforce the current mirror state, identity, path, and payload shape. They cannot make Firestore and RTDB updates atomic, create the mirror, order backend events, provision devices, revoke Firebase Auth tokens, or reconcile stale projections. Those are trusted-backend responsibilities.

## Web compatibility

| Operation | Current function | Draft result | Decision |
| --- | --- | --- | --- |
| Read telemetry/control/command | `subscribeToDeviceShadow()` in `src/services/deviceService.ts` | Allowed for verified mirrored owner | Preserve |
| Write control | `syncDeviceControlProfile()` | Allowed for verified mirrored owner; current payload validates | Preserve |
| Write latest command | `publishDeviceCommand()` | Allowed for verified mirrored owner; current payload validates | Preserve |
| Browser telemetry write | `writeDeviceTelemetry()` | Denied because the human is not a claimed assigned device | Retire or migrate to trusted ingestion; no current UI callers |
| Date-specific history read | `getDeviceTelemetryHistory()` | Allowed for verified mirrored owner | Preserve |
| Whole-history backfill read | `backfillSensorReadingsFromDeviceHistory()` | Denied because `/history` has no parent read grant | Move to trusted backend; no normal UI callers |

The optimized child listeners and shared server-time-offset cleanup remain unchanged.

## Mobile compatibility

| Operation | Current function | Draft result | Decision |
| --- | --- | --- | --- |
| Read telemetry | `subscribeToAquariumTelemetry()` in `src/services/firebase-service.ts` | Allowed for verified mirrored owner | Preserve |
| Read control | `subscribeToControlProfile()` | Allowed for verified mirrored owner | Preserve |
| Write control | `syncDeviceControlProfile()` | Allowed; mobile optional light schedule fields validate | Preserve |
| Write command | `publishDeviceCommand()` | Allowed; path, requester, type, state, and duration validate | Preserve |
| Admin directory | `getAdminDirectory()` uses Firestore | Unaffected | Preserve |

The mobile application currently has no RTDB history write or telemetry write operation.

## Future ESP32 authentication requirements

The current firmware does not initialize networking, Firebase, RTDB, or Firebase Authentication. Device authorization is therefore MISSING and requires a separately approved design covering:

- unique device identity and secure provisioning;
- secure acquisition and renewal of Firebase credentials;
- claim issuance by trusted infrastructure;
- offline and reconnect behavior;
- clock and timestamp authority;
- telemetry schema and validation error handling;
- immutable history entry keys and duplicate prevention;
- command receipt, acknowledgement, replay protection, and completion status;
- device replacement, reassignment, and revocation;
- secure storage appropriate to the ESP32 platform.

No physical device behavior is verified by this phase.

## Validation and testing status

Validation used Temurin OpenJDK `21.0.12.1`, Firebase CLI `15.34.0`, Node.js `24.15.0`, `@firebase/rules-unit-testing` `5.0.2`, and the isolated project ID `demo-smartaqua-rtdb-auth`. The draft rules compiled and loaded successfully. All 40 authorization tests passed in two consecutive runs with the database cleared and fixtures recreated before each test.

The emulator verified user/aquarium isolation, verified-email enforcement, Admin denial, control and command validation, device assignment, authorization states, ownership transfer, history restrictions, unknown-path denial, and parent/multi-location bypass prevention. Emulator fixtures were deterministic and existed only inside the disposable local emulator. No application telemetry or production data was created.

The Firebase CLI attempted to look up the intentionally nonexistent `demo-*` project and received `403 PERMISSION_DENIED`, then correctly continued with the local demo configuration. No production Firebase resource was read or modified. The complete test implementation and scenario list are maintained in `tests/rtdb/database.rules.test.mjs` and `docs/security/rtdb-emulator-test-plan.md`.

The web production build, targeted web lint, mobile TypeScript check, and targeted mobile lint pass. A read-only `npm audit` reports 13 dependency advisories overall; `npm audit --omit=dev` reports four production transitive packages through Firebase 12 (`@grpc/grpc-js`, `protobufjs`, `@protobufjs/utf8`, and `websocket-driver`). The newly added rules-testing package has no additional runtime dependency tree and did not create those findings. Dependency remediation requires a separately reviewed Firebase/dependency upgrade and was not performed in this security-rules phase.

No correction to `database.rules.json` was required by the executed tests. This means the tested authorization contract behaved as drafted; it does not prove the future trusted synchronization backend, real Firebase Authentication token lifecycle, or ESP32 protocol.

## Safe deployment prerequisites

- [ ] Reconcile the manuscript's broad Administrator-monitoring wording with the approved directory-only Admin scope.
- [ ] Export, review, and archive the currently deployed RTDB rules.
- [x] Install and select JDK 21 or newer for the currently installed Firebase CLI.
- [x] Add an approved rules test runner and `@firebase/rules-unit-testing` dependency.
- [x] Pass every current test in the emulator test plan using a `demo-*` project.
- [ ] Complete a web and mobile integration run against the emulator.
- [ ] Approve the exact telemetry and device-history protocol.
- [x] Implement and test the trusted synchronization backend in isolated local emulators.
- [x] Implement and test trusted ownership transfer, deletion preparation, role-change, and account-revocation workflows locally.
- [ ] Review the Phase 4 mutation design and migrate web/mobile client mutations to the callables.
- [ ] Define and implement approved permanent-deletion and data-retention finalization.
- [ ] Backfill the authorization mirror in a controlled non-production environment.
- [ ] Reconcile every mirrored role, owner, state, and device assignment against Firestore.
- [ ] Implement and test unique ESP32 device authentication before enabling physical device writes.
- [ ] Document rollback, incident response, and recovery procedures.
- [ ] Review the exact Firebase deployment command and target project.
- [ ] Obtain explicit production deployment authorization.

Until all items are complete, the rules remain a non-production draft and SmartAqua Pro must not be described as fully secure, production-ready, or proven for multi-user or long-duration operation.

## Firebase references

- [Realtime Database Security Rules core syntax](https://firebase.google.com/docs/database/security/core-syntax)
- [Realtime Database rule conditions and validation](https://firebase.google.com/docs/database/security/rules-conditions)
- [Local Emulator Suite installation and rules configuration](https://firebase.google.com/docs/emulator-suite/install_and_configure)
- [Security Rules unit testing](https://firebase.google.com/docs/rules/unit-tests)
