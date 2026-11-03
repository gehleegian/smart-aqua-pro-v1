# SmartAqua Pro Authorization Synchronization Emulator Test Plan

## Purpose

This plan validates the non-production trusted backend that projects canonical Firestore user roles and aquarium ownership into the RTDB authorization mirror. It uses only `demo-*` project IDs and local Firebase emulators. It does not deploy functions or rules, access production data, provision devices, or add telemetry to either application.

## Environment

- OpenJDK 21 or newer for the Firestore and RTDB emulators.
- Firebase CLI 15.34.0 or a compatible later version.
- Node.js 22 for the declared Cloud Functions runtime. The October 18, 2026 local run used host Node.js 24.15.0 because the Functions emulator uses the installed host runtime and reported this difference as a warning.
- Firebase Admin SDK and Firebase Functions dependencies installed only in `functions/`.
- Isolated project ID `demo-smartaqua-auth-sync`.

The Firestore and RTDB Admin SDK clients must receive `FIRESTORE_EMULATOR_HOST` and `FIREBASE_DATABASE_EMULATOR_HOST` from `firebase emulators:exec`. Never set these emulator variables in a production runtime.

## Test groups

### Synchronization core

Run:

```powershell
npm run test:auth-sync
```

| ID | Scenario | Expected result |
| --- | --- | --- |
| SYNC-01 | Create canonical User profile | User role mirror is created; `account_status` is not projected |
| SYNC-02 | Change User role to Admin | User mirror becomes Admin and owned aquarium mirror is revoked |
| SYNC-03 | Create aquarium for a valid User | Active owner mapping is created |
| SYNC-04 | Change aquarium owner | New canonical owner replaces old owner; aquarium device assignment is preserved |
| SYNC-05 | Delete aquarium | Revoked tombstone remains and device assignments are removed |
| SYNC-06 | Delete user profile | User mirror is removed and owned aquariums are revoked |
| SYNC-07 | Deliver the same state more than once | Processing is idempotent and current mirrors are not rewritten |
| SYNC-08 | Invoke synchronization after a stale event | Current Firestore data is reread and an old owner is not restored |
| SYNC-09 | Inject a transient mirror-write failure | First attempt fails; retry produces the correct active mapping |
| SYNC-10 | Canonical record is missing or invalid | Mirror is missing or revoked; access fails closed |
| SYNC-11 | Reconcile stale and orphan mirrors | Canonical mirrors are repaired, orphan users removed, and orphan aquariums revoked |

### Trigger wiring

Run:

```powershell
npm run test:auth-sync-trigger
```

`TRIGGER-01` starts Firestore, RTDB, and Functions emulators; creates User profiles and an aquarium in Firestore; verifies automatic RTDB projection; changes ownership; verifies the new owner; deletes the aquarium; and verifies revocation.

The scheduled reconciliation handler is discovered by the Functions emulator but is not invoked because the Pub/Sub emulator is intentionally not part of this test. The reconciliation core itself is executed by SYNC-11.

### Existing RTDB authorization regression

Run:

```powershell
npm run test:rtdb-rules
```

The existing 40 tests continue to cover ordinary-client denial at `/authorization`, cross-aquarium isolation, two sessions for one user, verified email, Admin denial, equipment control validation, command validation, assigned-device permissions, revoked and transitioning states, parent-path denial, and default deny.

## Pass criteria

- All synchronization tests pass.
- The Functions emulator discovers both Firestore triggers with retry enabled.
- The trigger integration test passes.
- All 40 RTDB rules tests pass without modifying `database.rules.json`.
- Backend TypeScript compilation and targeted lint pass.
- No emulator command uses a production project ID.
- No Firebase deployment command is run.

## Limitations

Emulator tests do not prove production IAM, billing, Cloud Scheduler operation, regional latency, Eventarc delivery timing, Firebase Authentication token refresh, device credential storage, ESP32 connectivity, or immediate revocation across Firestore and RTDB. Those require separate staging and hardware validation.
