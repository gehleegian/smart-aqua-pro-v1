# SmartAqua Pro Phase 6 staging-readiness verification

Date: 2026-10-18

## 1. Executive summary

Phase 6 is **PARTIAL** as a staging-readiness gate. The security foundation, trusted mutation backend, client contracts, optimized RTDB subscriptions, and emulator test suite are implemented and locally validated. All 99 automated tests passed under Node.js 22.23.3, Firebase CLI 15.34.0, and Eclipse Temurin Java 21.0.12.1. The web production build, web lint, Functions build/lint, mobile TypeScript check, mobile lint, JSON validation, and Git whitespace checks passed.

The system is not production-ready. No Firebase resources were deployed or modified. App Check enforcement, authenticated browser/mobile end-to-end tests, physical ESP32 authentication, real-device telemetry, two-device soak testing, and long-duration reliability remain unverified.

## 2. Initial repository assessment

- **IMPLEMENTED:** Firestore remains authoritative for users, roles, aquarium ownership, and structured/historical application data.
- **IMPLEMENTED:** RTDB remains scoped to authorization projections and the existing `/devices/{aquariumId}` runtime paths.
- **IMPLEMENTED:** Admin directory access is read-only in the current UI and does not expose live RTDB telemetry or equipment controls (`src/pages/Users.tsx`).
- **IMPLEMENTED:** One user may own multiple aquariums; subscriptions are created per authorized aquarium ID (`src/hooks/useDashboardController.ts`, `src/hooks/useMonitoringController.ts`, and the mobile `src/hooks/use-mobile-data.ts`).
- **CONFLICTING:** The accepted outline excludes ammonia, while the older manuscript and repository compatibility fields still mention it. No ammonia migration was performed in this phase.
- **NOT VERIFIED:** The repository was already substantially modified before Phase 6. Existing unrelated modifications were preserved.

## 3. Files created and modified in Phase 6

Created:

- `docs/security/phase6-staging-readiness-verification.md`

Modified to satisfy the current React hooks lint rules without changing application behavior:

- `src/hooks/useAlertsController.ts`
- `src/hooks/useDataLogsController.ts`
- `src/pages/Settings.tsx`

The changes defer initial asynchronous state updates to a zero-delay timer and clear the timer on unmount. No security rules, command protocol, Firebase production configuration, firmware, or sensor thresholds were changed.

## 4. Authorization architecture and rationale

- **IMPLEMENTED:** Firebase Authentication establishes the human identity.
- **IMPLEMENTED:** Firestore `users/{uid}.role` and `aquariums/{aquariumId}.ownerId` remain canonical.
- **IMPLEMENTED:** Trusted Functions project only minimal authorization records to RTDB.
- **IMPLEMENTED:** RTDB rules independently require authentication, verified email for human users, mirrored `User` role, active aquarium state, matching owner UID, and a distinct device principal claim where applicable.
- **IMPLEMENTED:** Admin status does not imply access to live RTDB device data.
- **IMPLEMENTED:** Missing, revoked, or transitioning authorization fails closed.
- **IMPLEMENTED:** Trusted mutation locks, idempotency records, audit records, and recovery-required states protect ownership and role transitions.

## 5. Draft RTDB rules structure

The rules remain default-deny at the root and narrowly authorize:

- `/devices/{aquariumId}/telemetry`
- `/devices/{aquariumId}/control`
- `/devices/{aquariumId}/commands/latest`
- `/devices/{aquariumId}/history/{dateKey}`

Authorization records are not client-readable or client-writable. Parent reads and multi-location writes cannot bypass child restrictions. The existing optional `ammoniaPpm` validation field is classified as legacy compatibility and was not expanded or used to introduce ammonia functionality.

## 6. Permission matrix result

| Principal | Telemetry | Control | Latest command | History | Authorization mirror |
|---|---|---|---|---|---|
| Authorized verified User owner | Read | Read/write approved schema | Read/write approved commands | Read dated history | Denied |
| Other User | Denied | Denied | Denied | Denied | Denied |
| Admin | Denied | Denied | Denied | Denied | Denied |
| Assigned device principal | Write approved telemetry | Read | Read | Write denied pending protocol approval | Denied |
| Unassigned/revoked device | Denied | Denied | Denied | Denied | Denied |
| Trusted Admin SDK backend | Administrative workflow only | Administrative workflow only | Administrative workflow only | Administrative workflow only | Synchronize/reconcile |

## 7. Web application compatibility

- **VALIDATED:** `subscribeToDeviceShadow()` preserves the `DeviceShadow` result while subscribing only to `telemetry`, `control`, and `commands/latest` (`src/services/deviceService.ts`).
- **VALIDATED:** Dashboard and monitoring hooks derive a stable sorted aquarium-ID key and clean up every per-aquarium subscription when ownership, role, or component lifecycle changes.
- **VALIDATED:** The shared `.info/serverTimeOffset` listener is reference-counted and removed after the last active device subscription closes.
- **VALIDATED:** A failed Firestore authorization precheck or RTDB listener error closes all child listeners and releases the server-time listener.
- **VALIDATED:** Live profile revocation signs the web session out and component cleanup removes downstream subscriptions (`src/components/layout/Layout.tsx`).
- **IMPLEMENTED:** Aquarium deletion preparation is connected to the owner-facing aquarium UI.
- **PARTIAL:** Trusted transfer, role-change, and user-revocation client services exist, but the Admin directory is intentionally read-only and exposes no corresponding mutation controls.
- **NOT VERIFIED:** Authenticated browser workflows were not executed. The local Vite server started, but the browser-control runtime failed before a tab could be created.

## 8. Mobile application compatibility

- **VALIDATED:** Mobile uses the same Firebase project environment contract and the same RTDB child paths for telemetry, control, and `commands/latest`.
- **VALIDATED:** Mobile telemetry and control hooks return listener cleanup callbacks and recreate subscriptions when the authorized aquarium set changes.
- **VALIDATED:** The mobile auth context listens to the user profile and signs out after profile loss or permission denial.
- **PARTIAL:** The mobile client does not expose trusted Admin mutation workflows, which is consistent with the current read-only Admin experience.
- **NOT VERIFIED:** No physical phone, Expo development build, background/foreground cycle, or network interruption test was executed in Phase 6.

## 9. Future ESP32 authentication requirements

- **MISSING:** A provisioning service that creates one Firebase identity per device.
- **MISSING:** Trusted issuance and revocation of the `principalType: "device"` claim.
- **MISSING:** Secure per-device credential storage and credential rotation.
- **MISSING:** A finalized device-history append protocol.
- **NOT VERIFIED:** Physical sensor payloads, clock behavior, offline buffering, power-interruption alerts, and reconnect behavior.

No service-account key or permanent privileged credential may be embedded in firmware.

## 10. Trusted backend dependencies

- **IMPLEMENTED:** Firestore-triggered user and aquarium mirror synchronization.
- **IMPLEMENTED:** Idempotent aquarium transfer, deletion preparation, role update, and user revocation cores.
- **IMPLEMENTED:** Callable wrappers perform authentication and payload validation.
- **IMPLEMENTED:** Scheduled reconciliation code exists, but the scheduled function was ignored in emulator runs because the Pub/Sub emulator was not started.
- **PARTIAL:** App Check tokens are not yet required by callable Functions.
- **NOT DEPLOYED:** None of the Functions or rules in this repository were deployed during Phase 6.

## 11. Security validation and test results

Environment independently observed by the Firebase CLI:

- Node.js: 22.23.3
- Firebase CLI: 15.34.0
- Java: Eclipse Temurin OpenJDK 21.0.12.1 LTS
- Projects: isolated `demo-*` emulator project IDs

Automated tests:

| Suite | Result |
|---|---:|
| Client callable contracts | 5/5 passed |
| Authorization synchronization core | 11/11 passed |
| Firestore-trigger integration | 1/1 passed |
| Trusted mutation core | 23/23 passed |
| Callable endpoint integration | 11/11 passed |
| Firestore rules | 8/8 passed |
| RTDB rules | 40/40 passed |
| **Total** | **99/99 passed** |

The first combined run failed because Functions source discovery exceeded the Firebase emulator's default 10-second limit. Re-running the Functions suites with the local-only `FUNCTIONS_DISCOVERY_TIMEOUT=30` setting loaded the same build and all affected tests passed. This environment setting was not added to production configuration.

Quality checks:

- Web `npm run build`: passed; Vite reported only the existing large-chunk warning.
- Web `npm run lint`: passed.
- Functions TypeScript build under Node 22: passed.
- Functions lint under Node 22: passed.
- Mobile `npx tsc --noEmit`: passed.
- Mobile `npm run lint`: passed.
- `firebase.json`, `database.rules.json`, root `package.json`, and `functions/package.json`: valid JSON.
- Web and mobile `git diff --check`: passed; Git emitted line-ending conversion warnings only.

## 12. Existing functionality preserved

- Login, signup, verified-email flow, and profile listeners were not functionally changed.
- The optimized RTDB listener paths and cleanup behavior remain intact.
- Equipment writes still use `/devices/{aquariumId}/commands/latest`.
- Existing control payloads, telemetry normalization, sensor classification, history schemas, and rule-based recommendations were not changed.
- Admins still see user/aquarium directory information without live readings or controls.
- No mock application telemetry was created.
- No ESP32 firmware was changed.

## 13. Ammonia scope audit

The accepted outline is treated as the current approved scope and excludes ammonia. The older manuscript contains ammonia references, producing a documentation conflict that requires later document reconciliation.

| Area | Classification | Phase 6 action |
|---|---|---|
| Accepted outline | APPROVED, no ammonia | Preserved |
| Older manuscript and both `AGENTS.md` files | CONFLICTING | Reported, not rewritten |
| RTDB rule/type/normalization fields | LEGACY COMPATIBILITY | Preserved to avoid an unapproved schema migration |
| Mobile dashboard ammonia card | LEGACY UI | Reported, not changed |
| Firmware | ABSENT / NOT VERIFIED | No implementation found; no firmware change |

Removing the legacy fields requires a separately approved compatibility migration covering web, mobile, rules, historical records, tests, and any real device payloads.

## 14. App Check readiness

- **PARTIAL:** Web App Check initializes only when `VITE_FIREBASE_APP_CHECK_SITE_KEY` is present and enables token auto-refresh (`src/firebase.ts`).
- **MISSING:** Mobile App Check setup.
- **MISSING:** Callable `enforceAppCheck: true` configuration (`functions/src/index.ts`).
- **VALIDATED:** No committed App Check debug token reference was found outside dependency/build output.
- **BLOCKER:** Enforcement must remain disabled until legitimate web, mobile development-build, and future device traffic has valid tokens and emulator/staging tests confirm no lockout.

## 15. Remaining risks and limitations

- Emulator correctness does not prove production IAM, deployed rule versions, indexes, App Check registration, quotas, or environment variables.
- Two simultaneous authenticated browser sessions and two physical aquarium devices were not run end to end.
- Long-duration listener stability, reconnection, bandwidth use, and memory behavior were not soak-tested.
- Recovery-required backend records are tested at the core level, but no Admin recovery console exists.
- The Admin UI does not expose transfer, role update, or revocation workflows even though secure services exist.
- The scheduled reconciliation export exists but was not exercised with a Pub/Sub emulator in this phase.
- A production-sized historical dataset and query/index performance were not tested.
- Real ESP32 device authentication and provisioning are not implemented.
- Browser automation was unavailable due to the local tool error: `failed to write kernel assets: The system cannot find the path specified. (os error 3)`.

## 16. Required work before staging or production deployment

1. Reconcile the approved outline, manuscript, and both repository `AGENTS.md` files regarding ammonia.
2. Create a dedicated non-production Firebase staging project and inventory every project ID and environment variable.
3. Configure web App Check and implement mobile App Check in an Expo development build.
4. Add App Check emulator/staging tests, observe metrics, then separately approve enforcement.
5. Add reviewed Admin UI for transfer, role update, revocation, and recovery visibility if these workflows are required for the demonstration.
6. Run authenticated two-user/two-aquarium browser and phone tests against staging.
7. Provision two distinct device identities and validate each device can access only its assigned aquarium.
8. Run power-loss, Wi-Fi-loss, reconnect, duplicate-command, and long-duration soak tests with real hardware.
9. Review Firebase indexes, quotas, logging, alerting, backups, and rollback procedures.
10. Require an explicit deployment approval after reviewing an exact rules/Functions diff and a rollback plan.

## 17. Recommended next implementation phase

Proceed with a **non-production staging integration phase**, not production deployment. The next phase should add safe client-to-emulator/staging configuration, App Check for both supported clients, the missing reviewed Admin mutation UI where required, two-account/two-aquarium end-to-end tests, and individually provisioned test-device identities. Physical hardware and soak testing must follow before any claim of multi-user reliability or long-duration stability.
