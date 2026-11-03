# Phase 4 Trusted Mutation Emulator Test Plan

## Isolation and toolchain

The tests run only against disposable Firebase Emulator Suite processes and `demo-*` project IDs. They use local Auth, Firestore, RTDB, and Functions emulators. Fixtures exist only in emulator memory and are not application telemetry.

Verified environment on October 18, 2026:

- Eclipse Temurin OpenJDK 21.0.12.1 LTS
- Firebase CLI 15.34.0
- Node.js 24.15.0 on the development host
- Functions deployment runtime declaration: Node.js 22

The Functions emulator warns about the host/runtime Node mismatch and uses Node.js 24 locally. Production Node.js 22 execution is therefore NOT VERIFIED.

## Executed suites

| Suite | Command | Scenarios | Result |
| --- | --- | ---: | --- |
| Trusted mutation core | `npm run test:trusted-mutations` | 23 | PASS |
| Callable endpoint integration | `npm run test:trusted-mutation-callables` | 11 | PASS |
| Firestore Phase 4 rules | `npm run test:firestore-rules` | 8 | PASS |

Current trusted-mutation and Firestore-rules subtotal: 42 passed, 0 failed, 0 skipped.

Phase 5 combined security suite (`npm run test:security`): 99 passed, 0 failed, 0 skipped (5 client contract, 11 authorization synchronization, 1 trigger dispatch, 23 trusted mutation core, 11 callable endpoint, 8 Firestore rules, and 40 RTDB rules).

Earlier callable-suite attempts encountered transient Firebase Functions discovery/startup failures (`TypeError: fetch failed` and an SDK-version-check timeout) before the Functions definitions loaded. The endpoint fixtures were also decoupled from background trigger timing so this suite tests callable authorization independently; trigger dispatch remains covered by its dedicated suite. The final Phase 5 run against the exact compiled source passed 11/11. The earlier startup failures remain a local-emulator tooling limitation, not application test failures.

## Core mutation coverage

- Authorized and unauthorized ownership transfer.
- RTDB revocation occurs before canonical owner mutation.
- Only the eligible new owner is activated.
- Simultaneous transfers are serialized.
- Duplicate requests are idempotent.
- A failure after revocation remains denied and can be retried.
- Stale synchronization cannot reactivate a blocked aquarium.
- Unrelated aquariums and owners remain isolated.
- Owner-authorized deletion preparation retains canonical data.
- Non-owner deletion preparation is rejected.
- Reconciliation cannot reactivate a deletion-prepared aquarium.
- Admin role promotion and demotion, ordinary-user denial, self-change denial, and final-Admin protection.
- Authorized and unauthorized account revocation, retained canonical records, idempotency, and reconciliation denial.
- Idempotency-key misuse and invalid identifiers are rejected.
- `account_status` remains informational.
- Pre-lock authorization failures do not create trusted recovery-operation records.

## Callable endpoint coverage

- Unauthenticated callable request is rejected.
- Authenticated ordinary User cannot transfer ownership.
- Missing required payload fields are rejected.
- Authenticated Admin transfer succeeds through the Functions endpoint with Auth, Firestore, RTDB, and trigger emulators active.
- A duplicate transfer returns the stored terminal result.
- An ordinary User cannot update a role.
- An Admin can update another User's role.
- An Admin can revoke an account while retaining its canonical records and disabling Firebase Auth access.
- An owner can prepare deletion while retaining and disassociating the canonical aquarium records.
- A duplicate deletion-preparation request returns the stored result.
- A former owner is denied access after deletion preparation.

Callable integration coverage now exercises all four trusted endpoints. It is not exhaustive for every injected failure stage; the mutation core supplies the broader workflow coverage.

## Firestore rule coverage

- A verified, unblocked owner can read and atomically update aquarium and directory metadata.
- Direct aquarium deletion is denied, including a paired aquarium/directory batch.
- Direct client ownership transfer is denied.
- Direct client role update and user deletion are denied.
- Aquarium blocks deny owner aquarium and alert access.
- User blocks deny self-profile and aquarium access.
- Admin can read the directory but cannot read aquarium or alert records.
- Trusted workflow collections cannot be read or written by clients.

## Security corrections found during testing

1. The normal owner-update fixture originally changed only the aquarium record. Existing rules correctly rejected it because SmartAqua Pro requires aquarium and directory metadata to remain consistent in one atomic batch. The test was corrected; the application contract was not weakened.
2. Denied pre-lock requests originally entered the recovery-record path. Recovery logging was restricted to workflows that successfully acquired their trusted lock, preventing unauthorized audit/operation-record creation.

## Regression requirements

Before review, run:

```powershell
cd C:\new\smart-aqua-pro-v1
npm run build:functions
npm run lint:functions
npm run test:auth-sync
npm run test:auth-sync-trigger
npm run test:trusted-mutations
npm run test:trusted-mutation-callables
npm run test:firestore-rules
npm run test:rtdb-rules
npm run build
git diff --check
```

Also run the mobile TypeScript and targeted lint checks from `C:\new\smart-aqua-mobile`. Do not run `firebase deploy`.

## Not proven by these tests

- Production deployment correctness, IAM, billing, region, quotas, or latency.
- Long-duration reliability or simultaneous-user capacity.
- Real network partitions, crash recovery, or multi-region failures.
- App Check enforcement.
- Expired-token and already-issued-token behavior on real clients.
- Permanent deletion and retention workflows.
- Real ESP32 authentication, telemetry, command acknowledgement, or UPS behavior.
- Physical sensor accuracy or any ammonia capability.
