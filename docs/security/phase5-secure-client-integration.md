# SmartAqua Pro Phase 5 Secure Client Integration

## Executive summary

Phase 5 integrates the web application with the Phase 4 trusted callable functions while preserving the mobile application's existing scope. Sensitive role, account-revocation, ownership-transfer, and aquarium-deletion operations no longer have an insecure direct Firestore implementation in the web services. The existing aquarium deletion action now prepares deletion and revokes access without claiming permanent record deletion.

This implementation is local and emulator-only. No Functions, rules, App Check enforcement, application build, or data was deployed.

## Repository assessment

The web application previously contained direct role update, user-document deletion, and aquarium/directory deletion methods. Hardened Firestore rules deny those writes. The web aquarium page exposed deletion to an aquarium owner, while the Admin directory was already intentionally read-only and had no approved role-change, revocation, or ownership-transfer controls.

The mobile application exposes User aquarium monitoring/control and an Admin read-only directory. It does not expose role changes, user revocation, aquarium deletion, or ownership transfer, so callable mutation integration is not applicable to its current UI.

Both repositories contained unrelated uncommitted work before Phase 5. It was preserved.

## Trusted callable integration

The web Firebase initialization uses the existing Firebase app and selects `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` (default `asia-southeast1`), matching the region every Function is deployed to (`functions/src/region.ts`). `src/services/trustedMutationContracts.ts` defines the exact callable names, request payload builders, response status validation, and idempotency-key generation. `src/services/trustedMutationService.ts` invokes:

- `transferAquariumOwnership`
- `prepareAquariumDeletion`
- `updateUserRoleTrusted`
- `revokeUserAccount`

The client never accepts an Admin flag as proof of authorization. The server remains authoritative. Callable errors are mapped to safe user messages for expired authentication, denial, validation failure, concurrency, unavailable service, and possible recovery-required conditions. There is no insecure direct-write fallback.

## Web application behavior

`src/services/userService.ts` routes role updates and account revocation through trusted callables. Account revocation is named and described as revocation rather than permanent deletion. The current Admin directory remains read-only, so no new privileged UI was invented.

`src/services/aquariumService.ts` routes the existing owner deletion action through `prepareAquariumDeletion`. `src/hooks/useAquariumsController.ts` reports that access was revoked, deletion was prepared, and records remain retained. Ownership transfer is available only as a trusted service operation pending a separately approved interface.

Deletion preparation retains the aquarium and directory records, sets `lifecycleState` to `deletion_prepared`, clears the former ownership fields, and keeps the permanent security block. Disassociation prevents the blocked retained record from poisoning subsequent `where('ownerId', '==', uid)` owner queries.

## Mobile application behavior

No callable mutation UI or service was added because the mobile application has no existing matching operation. Its monitoring, controls, command protocol, telemetry paths, and Admin directory behavior remain unchanged.

The mobile Auth context now subscribes to the authenticated user's Firestore profile. A role change refreshes the profile used by role-based navigation. A permission-denied profile listener, as expected after trusted revocation, clears the profile and signs out. Protected aquarium, directory, and telemetry state is cleared when the profile disappears.

## Authentication and session handling

The web layout and mobile Auth context maintain one profile listener per authenticated session and clean it up when the Auth user changes or the component unmounts. Role changes update visible permissions. Trusted revocation makes the profile unreadable through the security block, causing the client to clear protected state and sign out. `account_status` remains informational and is not evaluated by these listeners.

Firestore and RTDB rules remain the security boundary. UI visibility and client-side role checks are defense-in-depth only.

## Multi-user and realtime compatibility

The implementation does not alter the optimized RTDB paths:

- `/devices/{aquariumId}/telemetry`
- `/devices/{aquariumId}/control`
- `/devices/{aquariumId}/commands/latest`

No whole-device subscription was introduced. Existing listener cleanup on aquarium change, sign-out, authorization failure, and unmount remains in place. Admins remain denied live device data and equipment control.

Emulator fixtures use distinct Users and aquariums. Security-rule tests cover cross-user denial, two sessions for one User, Admin RTDB denial, former-owner revocation, control and command authorization, and parent-path default denial. These are functional isolation tests, not concurrent load or long-duration capacity tests.

## App Check assessment

The web client contains optional local preparation for reCAPTCHA Enterprise App Check. It initializes only when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is supplied and automatically refreshes tokens. With no site key, current development behavior is unchanged. A production site key must be created and registered for the correct web Firebase App and allowed domains. Local development must use an approved debug-provider process; no debug token is stored in this repository.

The Functions callables do not yet set `enforceAppCheck: true`. Enforcement must remain off until every legitimate web and mobile client sends valid tokens and request metrics have been reviewed.

The Firebase JavaScript SDK supports React Native App Check only through a custom provider that performs native device attestation. The current Expo Go workflow cannot be assumed to provide Play Integrity or App Attest. Native mobile App Check therefore requires an approved Expo development-build/native-module strategy or a reviewed custom provider, separate Android and Apple Firebase App registrations, and platform credentials. It is MISSING by design in this phase.

App Check supplements Firebase Authentication and Security Rules; it does not replace either.

## Recovery and error handling

The web client recognizes successful terminal statuses only: `completed`, `prepared`, and `revoked`. Invalid responses do not produce success feedback. Duplicate requests use operation-scoped idempotency keys, and the backend returns the stored result for an identical retry.

Permission and validation failures produce non-sensitive messages. Aborted requests tell the user another operation is active. Failed-precondition and internal failures warn that administrative recovery may be required. No privileged recovery UI was created.

Operations in `recovery_required`, stale locks, retention decisions, final deletion, and device disposition still require an approved operator runbook and backend tooling.

## App Check and Firebase migration plan

Before production deployment:

1. Create a staging Firebase project and register separate web, Android, and Apple apps.
2. Backfill and reconcile the RTDB authorization mirror for existing Users and aquariums.
3. Deploy the trusted backend and verify runtime IAM, Node 22, region, logging, and recovery alerts.
4. Release callable-compatible web and mobile clients while existing rules remain compatible.
5. Verify role change, revocation, transfer, and deletion preparation with staging accounts.
6. Activate hardened Firestore and RTDB rules as one coordinated change.
7. Register App Check providers, release token-capable clients, monitor metrics, and only then consider staged enforcement.
8. Define rollback procedures for callables, rules, clients, authorization mirrors, and retained records.
9. Approve retention, export, recovery, final deletion, and incident-response policies.
10. Provision distinct authenticated device identities only after the ESP32 protocol is approved.

Deploying only the hardened rules before callable-compatible clients would break legacy mutations. Enabling App Check before all supported clients are registered would block legitimate traffic.

## Approved requirements and conflicts

The approved outline requires small freshwater goldfish aquariums, two-tank separate-user demonstration, web and mobile access, authenticated aquarium isolation, rule-based classifications and recommendations, alerts, history, reports, and authorized feeder, filtration, and lighting controls. Phase 5 preserves those boundaries and does not change thresholds, analytics, telemetry schemas, equipment protocols, or hardware firmware.

The approved outline omits ammonia, while the older manuscript, `AGENTS.md`, telemetry types, and RTDB validation still contain `ammoniaPpm`. This is CONFLICTING and requires a separate approved schema review. Phase 5 does not add, remove, or reinterpret ammonia.

The approved current Admin decision is directory-only: Admins may view Users and the aquariums registered under them but not live readings, history, recommendations, alerts, or controls. The implementation preserves that decision even where older manuscript language is broader.

## Verification classifications

The complete isolated security command passed 99 tests with 0 failures and 0 skips: 5 client-contract tests, 11 authorization-synchronization tests, 1 trigger-integration test, 23 trusted-mutation tests, 11 callable-endpoint tests, 8 Firestore-rules tests, and 40 RTDB-rules tests. Java 21.0.12.1 and Firebase CLI 15.34.0 were used. The web production build, targeted Phase 5 web lint, Functions build/lint, mobile TypeScript check, mobile lint, JSON parsing, and tracked-file `git diff --check` passed.

The full web lint still reports four pre-existing `react-hooks/set-state-in-effect` errors in `useAlertsController.ts`, `useDataLogsController.ts` (two), and `Settings.tsx`. No Phase 5 file appears in that failure set. Vite also reports a non-fatal bundle-size warning for the approximately 902 kB JavaScript bundle. The Functions emulator uses host Node.js 24 even though the deployment runtime declares Node.js 22, so production Node.js 22 execution remains NOT VERIFIED.

| Area | Classification | Evidence boundary |
| --- | --- | --- |
| Web callable service integration | IMPLEMENTED | Compiled and contract-tested |
| Aquarium deletion preparation UI flow | IMPLEMENTED | Compiled and callable endpoint tested; browser clicks not automated |
| Admin role, revocation, transfer UI | MISSING | Trusted services exist; current approved directory UI is read-only |
| Mobile destructive operations | NOT APPLICABLE | No existing feature requires them |
| Web and mobile profile session refresh | IMPLEMENTED | Compiled and linted; physical multi-device UI timing not measured |
| Multi-user isolation | IMPLEMENTED | Emulator security and callable tests |
| App Check web preparation | PARTIAL | Optional client initialization; console registration and enforcement missing |
| App Check native mobile | MISSING | Expo/native attestation decision required |
| Real hardware behavior | NOT VERIFIED | No ESP32 or equipment test performed |
| Production deployment | NOT DEPLOYED | Explicitly prohibited |
