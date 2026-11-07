# SmartAqua Pro — Repository Audit

- **Date:** 2026-11-06
- **Branch audited:** `fix/device-shadow-commands` @ `d13bc31`. There is one uncommitted change, in `src/types/device.ts` (+2 lines adding `lightOnTime`/`lightOffTime` to the RTDB control profile).
- **Mode:** read-only. No source files were modified and nothing was written to Firebase. `npm ci` was run in the root and in `functions/` from the lockfiles. `next build` and `tsc` regenerated their ignored build output (`.next/`, `functions/lib/`).

---

## 1. TL;DR

- **Overall completion (estimate):**
  - Software only: **~40%** of FR1–FR22.
  - End to end (real sensor → Firebase → rules → alert/history → UI): **~10–15%**. The app and the hardware have never been connected in the current code.
- **IoT data verdict: REAL for Aquarium 1, MIXED overall** (revised 2026-11-06 after a read-only check of the live project; see §4.1).
  - Aquarium 1 receives real ESP32 telemetry on `devices/{aquariumId}/telemetry`, written by a provisioned device identity (`esp32-SAQ-7K3M-9R2X`, custom claim `principalType: device`, bound in `authorization/aquariums/{id}/deviceUids`).
  - The working firmware and the device-provisioning step live **outside this repo** (Gian). The repo still contains only a 78-line TDS bench test (`docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino`).
  - Boyto's telemetry is stale since 2026-06-03 (`ph: 0`); Halwan has never reported. Old Firestore readings (May) contain zero values and one 1997-epoch timestamp.
  - The in-browser dev simulator (`src/utils/monitoringSimulator.ts`) remains dev-only.
- **Build health is good for what exists.**
  - `tsc`, `eslint` (0 errors, 10 warnings in a test file), `next build`, the functions build, and the functions lint all pass.
  - All 97 local unit tests pass.
  - 1 test fails because it imports a mobile repo that isn't on disk.
  - The 6 emulator suites (rules and Cloud Functions) **could not run**: the Firebase CLI is not installed. *(Update 2026-11-06: CLI installed; all 7 emulator suites pass, 137 tests.)*
- **Security posture is the strongest part of the repo.**
  - Firestore and RTDB rules are default-deny and enforce per-aquarium ownership server-side. Neither is in test mode.
  - Admin-only actions go through Cloud Function callables with audit records.
  - No secrets are committed in HEAD. A Firebase *web* API key is in git history (`src/firebase.ts` at `ebcb3c9`, `f93d077`), which is low risk.
- **Blocker 1: there is no ESP32 → Firebase path.**
  - The firmware has to be rebuilt. A 1,117-line networked sketch existed in reverted commit `156e3c9`, and a 235-line multi-sensor sketch was overwritten in `6604b31`.
  - A device-provisioning function (custom token with `principalType: device` plus `deviceUids`) has to be written.
- **Blocker 2: there is no server-side pipeline.**
  - `functions/` contains only auth, role, and ownership plumbing. There is no ingest, classify, alert, history, or FCM function.
  - Every collection meant to be server-written (`sensor_readings`, `alert_records`, `monitoring_reports`, RTDB `history`) is `write: false` for clients and has no backend writer. History, alerts, and reports are therefore structurally empty.
- **Blocker 3: the rules engine is hardcoded and unapproved, and the Alerts page bypasses it.**
  - Thresholds and recommendations live in TypeScript (`src/utils/monitoringAssessmentCore.ts:54-61,158-178`), not in the DB (FR13).
  - Every row in `docs/threshold-approval-matrix.csv` is `APPROVAL_REQUIRED`/`TBD`.
  - The Alerts page runs its own separate rule set on static profile fields that default to `0` (`src/hooks/useAlertsController.ts:47-90`, `src/services/aquariumService.ts:213-215`), so it can raise **false temperature and water-level alerts when no data exists**.
- **Also missing:**
  - FCM push, maintenance actions, recommendation storage, the command log and acknowledgement, PDF reports, and MFA.
  - The admin UI is read-only: no role changes, no assignment.
  - The mobile app is not in this repo.

---

## 2. Inventory and how to run

| Part | Path | Stack and version | Run | Env vars (names only) |
|---|---|---|---|---|
| Web app | `/` (`src/`) | Next.js 16.4.4 (Turbopack), React 19.2, TypeScript 6.0, Tailwind 4, Firebase JS SDK 12.12 | `npm ci && npm run dev` (port 3000); `npm run build && npm start` | `NEXT_PUBLIC_FIREBASE_API_KEY`, `_AUTH_DOMAIN`, `_DATABASE_URL`, `_PROJECT_ID`, `_STORAGE_BUCKET`, `_MESSAGING_SENDER_ID`, `_APP_ID`, `_MEASUREMENT_ID`, `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION`, `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` (`.env.example:1-10`). Legacy `VITE_FIREBASE_*` names are mapped as a fallback (`next.config.mjs:6-24`). |
| Cloud Functions | `functions/` | firebase-functions 7.4 (v2 API), firebase-admin 14.5, Node **22** (`functions/package.json:8`) | `npm --prefix functions ci && npm run build:functions`; deploy with `firebase deploy --only functions` (not done) | `SMARTAQUA_SUPPORT_EMAIL` param (`functions/src/index.ts:41`) |
| Firestore rules | `firestore.rules` (722 lines) | rules_version 2 | `npm run test:firestore-rules` (emulator) | — |
| RTDB rules | `database.rules.json` (162 lines) | — | `npm run test:rtdb-rules` (emulator) | — |
| Firebase config | `firebase.json` | emulators: auth 9099, RTDB 9000, Firestore 8080, functions 5001 | — | — |
| Firmware | `docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino` | Arduino-ESP32; TDS ADC test only | Arduino IDE / PlatformIO (no `platformio.ini`) | Earlier versions included `secrets.h`, which is gitignored (`.gitignore:33`) |
| Mobile app | **not in repo** | Expo 54 / RN 0.81 existed in reverted commit `156e3c9` (`apps/mobile/`). The parity test now points at a sibling `../smart-aqua-mobile` that isn't on this machine. | — | — |
| Docs | `docs/` | Contracts, security phase reports, approval matrices (CSV) | — | — |

Other notes:

- **Firmware is present but is not the system firmware.**
  - The current sketch (`docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino:3-79`) reads one analog pin (GPIO32) and prints voltage to Serial. It has no Wi-Fi, no Firebase, no other sensors, and no actuation.
  - `git log` shows it went 1,117 lines (`156e3c9`, Wi-Fi plus Firebase REST, reverted in `85c0e8f`) → 235 lines (`f93d077`, multi-sensor serial) → 78 lines (`6604b31`, 2026-11-04).
  - `docs/hardware/esp32-firebase-interface-contract.md:13-36` still describes the 235-line version (RTC, ultrasonic, pH, turbidity, two DS18B20s), so **that doc is out of date with the code**.
- **Stray local artifacts (all gitignored):**
  - `dist/` is a stale Vite build. It has a Firebase web API key baked into `dist/assets/index-CoMSrq9E.js`; that is expected for a web key, but it's stale output.
  - `.env` uses the legacy `VITE_*` names; `.env.local` uses the `NEXT_PUBLIC_*` names.
- **Large binaries committed to the repo:** `Chapter 1 And 2 - updated schema.docx` (27 MB) and `manuscriopt-analysis.docx` (4.3 MB, filename typo).

---

## 3. Build health

| Step | Result | Notes |
|---|---|---|
| `npm ci` (root) | ✅ | 446 packages |
| `npm --prefix functions ci` | ✅ | Warns `EBADENGINE`: requires Node 22; local is Node 24.15 |
| `npx tsc --noEmit` | ✅ | 0 errors |
| `npm run lint` | ✅ | 0 errors, 10 warnings: unused `_legacy*` vars in `tests/firestore/firestore.rules.test.mjs:408-615` |
| `npm run build` (Next) | ✅ | One static route, `/` |
| `npm run build:functions` / `lint:functions` | ✅ / ✅ | |
| `test:client-contracts` | ✅ 5/5 | |
| `test:aquarium-profile` | ✅ 22/22 | |
| `test:monitoring-assessment` | ✅ 70/70 | |
| `test:monitoring-parity` | ❌ | `ERR_MODULE_NOT_FOUND ../../../smart-aqua-mobile/src/utils/monitoring-assessment.ts` (`tests/integration/monitoring-assessment-parity.test.mjs:6,8`). It depends on a sibling repo that isn't checked out. |
| `test:security` (6 emulator suites: firestore rules, RTDB rules, auth-sync, trigger, trusted mutations, callables, email verification) | ⚠️ **Not run** | `sh: firebase: command not found`. `firebase-tools` isn't a devDependency, so none of the rules tests were verified in this audit. |

**`npm audit`:**

- Root: 18 vulnerabilities (1 critical, 6 high, 10 moderate, 1 low).
  - **Critical:** `websocket-driver`, pulled in by `firebase` → `@firebase/database` → `faye-websocket`. In the browser it's mostly the Node fallback, so it's low real-world risk for this app.
  - **High:** `protobufjs` (via `@firebase/firestore` → grpc), `brace-expansion`, `browserslist`, `js-yaml`, `source-map-js`, `zod`. Most are dev/build-time.
- `functions/`: 13 vulnerabilities (1 high: `body-parser`; 12 moderate, mostly from typescript-eslint/minimatch, gaxios/rimraf).

**Dead code and unused items** (exported, but no caller in `src/`):

- `writeDeviceTelemetry`: `src/services/deviceService.ts:193`. It would also be denied by the rules.
- `backfillSensorReadingsFromDeviceHistory`: `src/services/deviceService.ts:346`.
- `syncAlertRecords`: `src/services/alertRecordsService.ts:61`. Denied by `firestore.rules:677`.
- `createMonitoringReport`, `getAlertRecordSummaryForRange`: `src/services/monitoringReportsService.ts:69,32`. Denied by `firestore.rules:682`.
- `readAlertHistory` and the dedup/renotify machinery: `src/utils/alertsHelpers.ts:23-26,289-400`.
- `updateUserRole`, `revokeUserAccess`: `src/services/userService.ts:158,209`. The backend callables exist, but no UI calls them.
- Admin `Aquariums` owner filter: `src/views/Aquariums.tsx:51-63`. Unreachable, because Admin's allowed pages don't include `aquariums` (`src/components/layout/Layout.tsx:57`).
- Vite leftovers: `src/App.css`, `src/assets/vite.svg`, `src/assets/react.svg`, `src/assets/hero.png` (none are imported).

**TODO/FIXME/HACK:** 0 occurrences in `src/`, `functions/src`, `tests/`, and firmware.

---

## 4. IoT data reality check

### Verdict: **REAL for Aquarium 1, MIXED overall** (originally PLACEHOLDER from the repo alone)

The repo-only audit concluded PLACEHOLDER because no firmware or device provisioning exists in the repo. A read-only check of the live `practice-smartaqua` project on 2026-11-06 showed that Gian's out-of-repo firmware does write real telemetry for Aquarium 1.

### 4.1 Live findings (read-only, 2026-11-06)

| Item | Finding |
|---|---|
| Live path | `devices/{aquariumId}/telemetry` (RTDB, keyed by Firestore aquarium ID) |
| Aquarium 1 | Live. `updatedAt` advanced across three reads (23:15:00, 23:16:14, 23:21:26 PST); pH 8.13→8.12→8.12, temperature 26.53→26.5 °C (1/16 °C steps), water level 16.7→15.7 %. Measured send interval **~7.4 s** (28 consecutive writes, 2026-11-06 23:47–23:51). |
| Payload (Aquarium 1) | `temperatureC, temperatureReadingValid, waterLevelPercent, waterPresent, ph, tdsReadingValid:false, filterState, equipmentStatus:"Unknown", powerStatus:"Unknown", online, updatedAt` (epoch ms, device clock). No `tdsPpm`, `turbidity`, or pH validity flag. |
| Boyto | Stale since 2026-06-03 12:21:56, `ph: 0`; RTDB history 05-16 to 06-03 (written before the current rules); no `deviceUids` binding. |
| Halwan | No telemetry; control and commands only. |
| Device auth | Custom-token UID `esp32-SAQ-7K3M-9R2X`, claim `principalType: "device"`, `claimOperationId: device-claim-SAQ-7K3M-9R2X`. Minting/storage of the token is undocumented (ask Gian). |
| Rules | Deployed RTDB rules are identical to `database.rules.json`. No Cloud Functions are deployed. |
| Commands | `commands/latest` written by the web (`feed_now`, `set_filter_state`). No acknowledgement exists; devices cannot write under `commands`. |
| Firestore history | `sensor_readings` 180 docs / nested `readings` 175 docs, newest 2026-05-29; `alert_records` 90 (newest 2026-06-03); `history` 0. Nothing writes history for the live device. |
| Test data to clean up (not deleted) | May readings with `temperatureC: 0`, `ph: 0`; one `recordedAtEpoch: 853755456` (1997-01-20 as seconds, or ~9.9 days as ms, which suggests `millis()` was sent). See `docs/device-contract.md` §7. |
| Freshness | Correction: an earlier "~74 s" figure was a sampling artifact. The firmware sends every ~7.4 s, inside both the old 30 s and the new 60 s window. |
| Profile vs readings | Aquarium 1 reads 26.5 °C (max 24), pH 8.1 (max 7.5), level ~16 % (min 70). Needs physical check / calibration. Profile 9×10×9 cm (~0.8 L) but `workingWaterVolumeLiters: 10`. |

### 4.2 Fixed on `feat/device-pipeline` (Sprint 0)

- Alerts page no longer uses its own threshold logic or stored profile values: alerts come from the shared assessment over fresh live telemetry (`src/hooks/useAlertsController.ts`, `src/utils/alertsHelpers.ts`).
- Shared sensor-fault rules (`getSensorFault`, `src/utils/monitoringAssessmentCore.ts`): pH 0 / outside 0–14, temperature 0/85/−127 °C, TDS 0 ppm, and 0 % level without `waterPresent: false` are sensor faults with no alert or recommendation.
- `backfillSensorReadingsFromDeviceHistory` reads `history/{dateKey}` per key instead of the denied history root (`src/services/deviceService.ts`).
- The mobile parity test skips when `../smart-aqua-mobile` is absent. The mobile copy of `monitoringAssessmentCore.ts` must be re-synced with the web copy.

### 4.3 Sprint 1 (same branch; nothing deployed)

- Contract: `docs/device-contract.md`. Firmware checklist: `docs/firmware-changes.md`. Switchover plan: `docs/migration-live.md`.
- RTDB rules: `phReadingValid`, `turbidityReadingValid`, `commandAck/latest` (bound device only, matching `commandId`, server `executedAt`), `deviceBindings/{deviceUid}`.
- Cloud Function `ingestDeviceTelemetry`: validated, sampled history in Firestore `sensor_readings` (emulator-tested only).
- App: 60 s stale window, "Sensor error" display, command status, Data Logs on the shared assessment.

### 4.4 Sprint 3: organizations, QR claiming, caretakers (same branch; nothing deployed)

- **Access model:** `docs/access-model.md`. Platform Admin (Admin role → `platformAdmin` claim, read-only plus suspend), Org Owner (first device claim creates the org), Caretaker (invite only, assigned tanks). This replaces the manuscript's Admin/User model, and FR2 ("Admin assigns aquariums") no longer applies: owners claim devices and assign caretakers.
- **Functions** (`functions/src/orgAccess.ts`): `claimDevice`, `createInvite`, `acceptInvite`, `revokeInvite`, `removeMember`, `updateCaretakerAssignments`, `setOrganizationStatus`. The existing RTDB mirror sync is extended with `orgId`, `caretakerUids` and a `suspended` state, and the existing `updateUserRoleTrusted` now also sets the `platformAdmin` claim.
- **Rules:**
  - Firestore is org-scoped: Owner reads every tank in the org, Caretaker only tanks in `caretakerIds`, the admin reads everything. Owner-only profile and threshold edits; client aquarium creation is removed.
  - RTDB: `caretakerUids` grant telemetry, command and history access; `control` stays owner-only; device rules are unchanged.
- **Device provisioning** (resolves §6 gap 2): `scripts/provision-device.ts` (device account, HMAC-hashed claim code, QR label, gitignored credentials header). Migration: `scripts/migrate-orgs.ts` (`docs/migration-live.md` step 7).
- **Verified on the emulator only:** `test:org-access`, `test:firestore-org-rules`, `test:rtdb-org-rules`, `test:migrate-orgs`, `test:sprint3-e2e`. ESP32 sign-in with the provisioned credentials needs hardware verification (Gian).

### 4.5 Sprint 4: notifications, maintenance, controls, admin (same branch; nothing deployed)

- **Clickable demo:** `npm run demo` (`docs/demo.md`) runs the emulators, an emulator-only seed (`scripts/seed-demo.ts`, refuses non-`demo-*` projects) and Next.js. Playwright smoke tests are in `tests/e2e`.
  - The seed telemetry is **demo data, requested for the demo**. It is deterministic, marked `demoSeed`, and fed through the real ingest pipeline. The app does not generate it.
- **Bugs the smoke tests found (all fixed):**
  - the header bell showed hard-coded **sample notifications** (now real alerts);
  - the TDS tile showed `100%` purity instead of ppm (dashboard and monitoring);
  - aquarium cards showed 0 °C / 0% without readings;
  - the Equipment card claimed Active/On without live data;
  - the text "X is no live data";
  - initials included punctuation;
  - the Automation page was **sample data with non-goldfish species** (now real per-tank schedules);
  - a race where telemetry ingest made a concurrent caretaker/org mirror sync fall to `transitioning` (access denied);
  - the demo needed one RTDB namespace (`DATABASE_URL`).
- **FR15 push:**
  - `notifyAlertRecord` sends on alert open or escalation only, to org owners plus the assigned caretakers, after their preferences. A sender interface: FCM / emulator outbox / test fake. Invalid tokens are deleted.
  - Web side: service worker, PWA manifest, "Turn on alerts". See `docs/notifications.md`. **Real delivery is not verified** (needs a deploy and the VAPID key).
- **FR20 maintenance:** the `logMaintenance` callable. Applied → log → recommendation applied → cleaning cycle reset (existing trigger). Per-tank history.
- **FR17/FR19:** the `command_logs` triggers plus a 30 s `no_response` check. Command history per tank; "No response" is neutral, since the live firmware does not ack.
- **FR18:** schedule validation (30-min feeding gap, 1–24 h, Asia/Manila), "Next scheduled", and a real Automation page. The device runs the schedules (`docs/firmware-changes.md` §11). Scheduled acks carry `source: "schedule"` (additive).
- **FR13 admin side:** the platform-admin Rules Editor (validate, preview, approve with a citation, export) through audited callables.
- **FR22:** audit-log viewer (owner: own org; admin: all orgs plus security events).
- **Co-owners:** `setMemberRole`, owner removal, the ≥1-owner guard, `coOwnerUids` in the mirror and RTDB rules.
- **Verified on the emulator only:** `test:sprint4-functions`, `test:org-access`, `test:firestore-org-rules`, `test:rtdb-org-rules`, `test:sprint4-e2e`, `test:smoke`. **Needs hardware:** scheduled actions, acks, NTP and offline behaviour (Gian).

### 4.6 Sprint 5: reports and PDF, MFA, the PR #8 registry converter, polish (same branch; nothing deployed)

- **FR21 reports:** the `generateMonitoringReport` callable (owners and assigned caretakers) and `weeklyMonitoringReports` / `monthlyMonitoringReports` (Mon 07:00 and the 1st 07:00, Asia/Manila).
  - Computed from `sensor_readings`, `alert_records`, `recommendations`, `maintenance_actions` and `command_logs`. Valid readings only; invalid and unvalidated rows are counted, never averaged.
  - Covers completeness, time in condition (overall and per parameter), alerts, recommendations vs action, maintenance and next cleaning, device activity and power interruptions, and the thresholds/rules in force with the draft note.
  - PDF (pdfkit, vector charts with the normal band) and CSV in Storage at `reports/{orgId}/{aquariumId}/`. The `monitoring_reports` shape is kept, plus `orgId`, `structured_summary`, `pdfPath` and `csvPath`. The Reports page is per tank.
  - Ingest rows now carry `parameterStatus` (additive).
- **Storage rules:** org-scoped, the same access as the tank. They can read only two Firestore docs, so `setOrganizationStatus` stamps `orgStatus` on member docs. Known gap: the Storage rules check `email_verified` but not `security_user_blocks` (access-model §9).
- **MFA (TOTP, no SMS):** Settings enrollment with a QR code, the sign-in challenge, the platform-admin gate in the app, and `REQUIRE_PLATFORM_ADMIN_MFA` for the callables (default off). It sits behind `NEXT_PUBLIC_MFA_TOTP_ENABLED` because the Auth emulator cannot run TOTP: tested with a fake SDK and an emulator-only mock. **Real TOTP is unverified** until Identity Platform is enabled (migration §8, access-model §10).
- **PR #8 registry converter** (`scripts/convert-pr8-registry.ts`, migration §7·0a):
  - claimed devices → our schema with org, binding and mirror;
  - unclaimed devices → a hashed claim code plus a label, keeping the pre-reserved aquarium ID (`claimDevice` honours `reservedAquariumId`, so Gian's firmware needs no reflash);
  - claims in progress → skipped;
  - all of his fields kept, plus `pr8Original`. Idempotent.
- **Bug found and fixed:** a tank with no saved schedule had the built-in default times pushed to the device **as an enabled schedule** on every manual light/filter toggle. It now sends automation OFF, and the panel says "No schedule set".
- **Polish:**
  - `scripts/cleanup-test-data.ts` (contract §7 only; dry-run; backup before delete; never run against live);
  - `npm run clean:emulator-secrets`;
  - security headers (CSP, HSTS, frame-ancestors) and `vercel.json`, with env names in `docs/deploy.md`;
  - accessibility: severity shapes, AA contrast for slate-500 text, skip link, `aria-expanded`;
  - no blank Monitoring page.
- **Defense docs:** `docs/testing-plan.md` (accuracy, FT-01..24, simulated conditions, performance, isolation, ISO 25010), `scripts/measure-latency.ts`, `docs/defense-demo-script.md`.
- **Verified on the emulator only.** Needs hardware or a deploy: real TOTP, Storage on the live bucket, the scheduled reports in Cloud Scheduler, latency on the real network, and the firmware ignoring default times while `automationEnabled` is false (Gian).

### Mocks and simulators found

| Location | What it is | Reaches prod? |
|---|---|---|
| `src/utils/monitoringSimulator.ts:9-61` | `createSimulatedTelemetry()`: deterministic normal/warning/critical values (e.g. `tdsPpm: 220`, `turbidity: 12`), no `Math.random` | Monitoring panel is gated `process.env.NODE_ENV !== 'production'` (`src/views/Monitoring.tsx:13`). Controls are disabled while it runs (`src/hooks/useMonitoringController.ts:490,616,793`). Never written to Firebase. |
| `src/views/Automation.tsx:8-40,84` | Hardcoded `feedingSchedules`, `automationRules`, `bioloadProfiles` (lists Tetras, Shrimp, Betta: **out of scope**, goldfish only) | **Yes.** Labeled "Sample data… not saved". |
| `src/components/layout/Header.tsx:25,143` | Hardcoded `notifications` array in the bell dropdown | **Yes.** Labeled "Sample data". |
| `src/views/Settings.tsx:190` | Notification preferences | **Yes.** Labeled "Sample data". |
| `src/hooks/useAlertsController.ts:47-90,133` | `buildStaticAlerts()` derives alerts from **Firestore profile fields** `temp`/`level`/`quality`, not telemetry. Fresh `Date.now()` timestamps on every load. | **Yes.** This is the actual Alerts page. See §6. |
| `setInterval` uses | `useMonitoringController.ts:177,185`, `useDashboardController.ts:99`, `Login.tsx:47`, `Signup.tsx:31` | Clock ticks only; none of them write readings. |
| `Math.random` | `src/services/trustedMutationContracts.ts:22` | Idempotency-key fallback only. |

### Screen → data source trace

| Screen | Component → hook/service | Firebase path | Mechanism |
|---|---|---|---|
| Dashboard (User) | `views/Dashboard` → `useDashboardController.ts:54,125` → `getDashboardData`, `subscribeToDeviceShadow` | Firestore `aquariums where ownerId==uid` (`aquariumService.ts:402-407`); RTDB `devices/{aquariumId}/telemetry`, `/control`, `/commands/latest` (`deviceService.ts:92,500-544`) | One-time `getDocs` for the profile; **live `onValue`** for telemetry |
| Dashboard (Admin) | `dashboardService.ts:18-19` | Firestore `aquarium_directory`, `users` | One-time `getDocs`. Admin **cannot** read telemetry: RTDB requires `role == 'User'` (`database.rules.json:12`). |
| Monitoring | `useMonitoringController.ts:235-268,292-300` → `subscribeToDeviceShadow` | RTDB `devices/{aquariumId}/{telemetry,control,commands/latest}` | **Live `onValue`**, or the simulator in dev |
| Data Logs / history | `useDataLogsController.ts:105` → `getDeviceTelemetryHistory` (`deviceService.ts:297-337`) | Firestore `sensor_readings where aquariumId,dateKey` (`sensorReadingsService.ts:290-295`), falling back to RTDB `devices/{id}/history/{dateKey}` | One-time `getDocs`/`get`. **Always empty**: no writer exists. |
| Alerts | `useAlertsController.ts:122-133` → `getAlertsPageData` (`alertsService.ts:5-20`) | Firestore `aquariums` only | One-time fetch; alerts are computed in the browser from profile fields |
| Header bell | `Header.tsx:25,44` | none | Static array |
| Users (Admin) | `Users.tsx:51-52` | Firestore `users`, `aquarium_directory` | One-time `getDocs` |

### ESP32 write paths vs. what the app reads

There is **no current firmware write to compare against** (`SmartAquaPhase1.ino` only uses `Serial`).

For reference, the reverted networked sketch at `156e3c9` used:

| Firmware `156e3c9` | App/rules today | Mismatch |
|---|---|---|
| `PUT /devices/{AQUARIUM_ID}/telemetry` with `temperatureC, temperatureReadingValid, waterLevelPercent, waterPresent, tdsPpm, tdsPercent, tdsReadingValid, filterState, ph, online, updatedAt{.sv}` | `database.rules.json:11-66` accepts exactly those keys | ✅ Names match. ❌ The firmware never sent `turbidity`, `equipmentStatus`, or `powerStatus`. |
| `PUT /devices/{id}/history/{dateKey}/{timeKey}` | `database.rules.json:146-148`: `$entryId .write: false` | ❌ **Rejected** by current rules |
| Auth: email/password `signInWithPassword` with `DEVICE_EMAIL`/`DEVICE_PASSWORD` | Telemetry write requires `auth.token.principalType == 'device'` and `authorization/aquariums/{id}/deviceUids/{uid} == true` (`database.rules.json:13`) | ❌ **Rejected**: a password user has no custom claim. Nothing in `functions/src` sets claims or populates `deviceUids`; it only deletes them (`authorizationSync.ts:386`, `trustedMutations.ts:378`). |
| Reads `/devices/{id}/control` and `/commands/latest` | Device read allowed (`database.rules.json:68,110`) | ✅ Compatible, but there's no ack path (see §6) |

Data-model mismatches with the manuscript:

- **RTDB is keyed by `aquariumId`, not `deviceId`** (`deviceService.ts:92`; `database.rules.json:10`). The manuscript specifies `devices/{deviceId}`.
- `sensor_readings.device_id` is just a copy of `aquariumId` (`src/services/sensorReadingsService.ts:155,191`; `alertRecordsService.ts:40`). No real device ID exists anywhere.

### Does anything copy RTDB telemetry into Firestore `sensor_readings`?

**No.**

- The only code that does it is client-side (`deviceService.ts:193-235,346-416`). It is never called and would be denied by `firestore.rules:666-668` (`write: false`).
- There is no Cloud Function trigger on RTDB. `functions/src/index.ts` exports only Firestore triggers, callables, and a schedule (§6).

### Live database check

**Unknown.** The Firebase CLI is not installed and no service credentials are configured, so no read-only query was possible. Unauthenticated REST reads are denied by the rules by design.

---

### 4.4 Sprint 2 (2026-11-07): rule engine, recommendations, alerts — emulator only, nothing deployed

The rows of §5 below are the original audit snapshot. Status after Sprint 2 (software only; verified on the emulator, not in production):

| FR | Now | Evidence |
|---|---|---|
| FR5 Bioload | ✅ (draft bands) | `computeBioload()` light/moderate/heavy from g/L; `docs/bioload.md` (DRAFT, citation needed) |
| FR6 Per-aquarium thresholds | ✅ (draft values) | `species/goldfish` defaults → profile limits → admin `thresholdOverrides` (`resolveThresholds`, `readAquariumOverrides`). No admin editor UI yet. |
| FR8 Validation | ✅ | Sprint 1 validity feeds the engine; faults → one `sensor_fault` recommendation, never water advice |
| FR11 Classification | ✅ (draft) | `evaluateAquarium()`; persisted as `aquariums/{id}.condition` and `sensor_readings.classification` |
| FR12 Rule → recommendation | ✅ (draft rules) | 27 rules with action / basis / preCheck; stored in `recommendations` |
| FR13 Rules in DB | ✅ | `rules/*`, `species/*` in Firestore; seeded by `scripts/seed-rules.ts`; no admin editor UI yet |
| FR14 Alerts | ✅ except FCM | `alert_records` written by the functions for warn/crit, power interruption (`mainsPresent`), device offline, sensor fault |
| FR15 Push | ❌ | Alerts carry `notifyRequestedAt`; no FCM sender |
| FR16 Dedup/cooldown | ✅ | Server-side: one open alert per aquarium+parameter, 15 min cooldown, auto-resolve after 3 normals (`planAlertChanges`) |
| FR20 Maintenance log | 🟡 | `maintenance_actions` collection + rules + trigger; logging UI is Sprint 4 |

**Removed hardcoded thresholds:** the old severity margins and turbidity 5/10 NTU (`MONITORING_SEVERITY_MARGINS`), the 500/300 ppm and 85/65 % label helpers (`monitoringHelpers.ts`), the form preset (20–24 °C etc.), the simulator's 6.5/7.5 defaults, and the Automation page's sample rule list. All values now come from Firestore.

**Behaviour changes to know about:**
- Unknown/missing power or equipment is "Not monitored" and no longer blocks NORMAL.
- A sensor fault no longer makes the overall condition UNAVAILABLE; the remaining valid parameters decide it.
- With the draft rules, Aquarium 1's live pH 8.1 is WARNING (critical above 8.25), not CRITICAL as before.
- Until `species`/`rules` are seeded, the app shows "rules not loaded" instead of a classification.

**Docs:** `docs/rule-engine.md`, `docs/rule-matrix.md` (generated from the seed), `docs/bioload.md`; `mainsPresent` added to `docs/device-contract.md` and `docs/firmware-changes.md`; migration steps 1c/1d/2 updated.

**Overlap resolved (Sprint 3):** `docs/rule-matrix.md` is the sign-off document. `docs/threshold-approval-matrix.csv` and `docs/recommendation-approval-matrix.csv` are marked superseded (kept, not deleted).

## 5. Feature status matrix

Legend: ✅ Done · 🟡 Partial · 🧪 Stubbed/mocked · ❌ Missing. "Rules tests not run" means the emulator suite exists but couldn't run in this audit.

| FR | Status | Evidence | What's missing |
|---|---|---|---|
| FR1 Login + roles | 🟡 | `authService.ts:143,152,172` (email/password + email verification); role forced to `'User'` on signup (`authService.ts:72`, `firestore.rules:80`); `roleHelpers.ts:3-11` | Roles are `Admin`/`User`, not Admin/Owner/Caretaker. Admin bootstrap is manual (no documented seed). Open self-signup. |
| FR2 Admin manages users / assigns aquariums | 🟡 | Read-only directory `Users.tsx:51-52,171-235`; callables `updateUserRoleTrusted`, `revokeUserAccount`, `transferAquariumOwnership` (`functions/src/index.ts:88,137,166`) | **No UI** for role change, revoke, or assignment (no callers of `userService.ts:158,209` or `aquariumService.ts:577`). Users create their own aquariums (`firestore.rules:616-621`). No `user_aquarium_assignments`. |
| FR3 Isolation in rules | ✅ (rules tests not run) | Firestore `ownsAquarium()` `firestore.rules:40-48`, applied at `:602-614,631-637,666-682`; RTDB owner and device checks `database.rules.json:12-13,68-69,110-111,145`; tests `tests/firestore/*.mjs`, `tests/rtdb/*.mjs` | Single-owner model only (one `ownerId`), so no caretaker sharing. |
| FR4 Aquarium profile CRUD | ✅ | Create/update `aquariumService.ts:455,486`; fields `src/types/aquarium.ts` (tankType, L/W/H, workingWaterVolumeLiters, hasFiltrationSystem, species, fishCount, fishWeightsG); delete via `prepareAquariumDeletion` callable (`functions/src/index.ts:113`, `useAquariumsController.ts:212`) | Delete is soft/"prepared" only. Species is free text with a goldfish preset. |
| FR5 Bioload | ✅ | `aquariumProfileCalculations.ts:10-26` (biomass g / working volume L = g/L); 22 tests pass | No bioload category thresholds (THR-BIOLOAD-001 `TBD`). Not used by any rule. |
| FR6 Per-aquarium thresholds | 🟡 | Per-aquarium `minTemp/maxTemp/minPh/maxPh/minLevel/minQuality` (`types/aquarium.ts`); preset `aquariumManagementHelpers.ts:19-24`; severity margins hardcoded `monitoringAssessmentCore.ts:54-61` | **No admin override**: Admin is denied aquarium writes (`!isAdmin()`, `firestore.rules:616-627`). No species-defaults table. All values `APPROVAL_REQUIRED` (`docs/threshold-approval-matrix.csv`). |
| FR7 ESP32 sends tagged readings | ❌ | `SmartAquaPhase1.ino:1-79` (serial TDS only) | Wi-Fi, auth, telemetry PUT, interval, device provisioning. |
| FR8 Validation / sensor fault | 🟡 | Range checks `monitoringAssessmentCore.ts` (`bounded()`, `assessAquariumCondition` `:339+`); stale >30 s → offline (`:103`); invalid → `unavailable`, no recommendation (70 tests pass); RTDB type validation `database.rules.json:14-65` | **No stuck-value detection** (no code). Client-side only, not server-side. No sensor-fault alert or record. No validity flags for pH, turbidity, or level. |
| FR9 Live dashboard | 🟡 | `onValue` listeners `deviceService.ts:500-544`; `useDashboardController.ts:125`; `dashboardHelpers.ts:112-121` | Works only when data exists, and none does. Dashboard collapses CRITICAL and "unavailable" into `'warning'` (`dashboardHelpers.ts:47,121`). |
| FR10 History charts with date range | 🟡 | `HistoryLineChart`, `WeeklyQualityChart` (`views/DataLogs.tsx:4,7,71`); ranges 24h/7d/30d/90d (`DataLogsToolbar.tsx:26`) | Data source is always empty (no writer for `sensor_readings` or RTDB `history`). |
| FR11 NORMAL/WARNING/CRITICAL | 🟡 | `monitoringAssessmentCore.ts:4,339+`, computed in the browser | Not persisted. Thresholds unapproved. TDS is classified on a project-specific "purity %", not ppm (`:126-145` of the assess functions). |
| FR12 Rule → recommendation | 🟡 | `maintenanceActions` + `selectRecommendation` with `recommendationRuleId` (`monitoringAssessmentCore.ts:158-178`) | One generic sentence per parameter (no low/high distinction). No `basis` field. **Not stored** (no `recommendations` collection). Rules unapproved (`docs/recommendation-approval-matrix.csv`). |
| FR13 Rules in DB, editable | ❌ | Hardcoded TS (`monitoringAssessmentCore.ts:54-61,158-167`) | No `prescriptive_rules` or `threshold_settings` collection, no admin editor. |
| FR14 Alerts (warn/crit, power, offline, fault) | 🧪 | `useAlertsController.ts:47-90` uses profile fields defaulting to `0` (`aquariumService.ts:213-214`) and its own `tdsPpm > 500` rule (`useAlertsController.ts:78`) | Not driven by telemetry or the rules engine. No power-loss, offline, or sensor-fault alerts. `alert_records` has no writer (`firestore.rules:677`). |
| FR15 FCM + in-app read/resolved | ❌ | No `firebase/messaging`, no service worker, no token storage, no sender (grep: 0 hits). `isRead` update rule exists (`firestore.rules:673-676`), unused. Bell is static (`Header.tsx:25`). | All of it. |
| FR16 Dedup/cooldown | ❌ (code exists, unwired) | `alertsHelpers.ts:23-26` (`ALERT_RENOTIFY_MS` 15 min, grace 5 min) and `:289-400`: localStorage-based, never called | Wire it server-side. A per-browser localStorage cooldown doesn't meet the requirement. |
| FR17 Manual feeder/filter/light | 🟡 | UI → `publishDeviceCommand` → RTDB `commands/latest` (`deviceService.ts:164-186`, `useMonitoringController.ts:591-612,656-690`); rules `database.rules.json:108-142` | Firmware doesn't read commands. No ack. The UI optimistically writes Firestore `manualStatus` and then auto-resets the feeder on a timer. |
| FR18 Feeding/lighting schedules | 🟡 | Editor `AutomationSettingsModal.tsx:68-88` → Firestore `automationSettings` + RTDB `control` (`types/device.ts:242-256`); light times are added only in the **uncommitted** diff | Firmware doesn't execute schedules. The `Automation` page is fake (`Automation.tsx:8-40,84`). |
| FR19 Command log + ack | ❌ | Single overwritten node `commands/latest`; all other children denied (`database.rules.json:108-141`); device cannot write anything under `commands` | Command history, device acknowledgement path, who/when log in Firestore. |
| FR20 Maintenance actions vs recommendation | ❌ | No `maintenance_actions` anywhere (grep: 0) | All of it. |
| FR21 Reports + PDF | ✅ (emulator) | Sprint 5: `functions/src/reports/*`, `src/views/Reports.tsx`, `storage.rules`; tests `test:report-summary` (11), `test:reports` (5), `test:storage-rules` (6), smoke | Deploy (Storage bucket, schedules); see §4.6 |
| FR22 Audit log | 🟡 | `security_audit_events` written by trusted mutations (`functions/src/trustedMutations.ts:134-139,291-300`) | No login audit. No audit of profile or threshold edits. No admin viewer. |
| MFA | 🧪 (mocked) | Sprint 5: `src/utils/mfa.ts`, `src/services/mfaService.ts`, `functions/src/mfaPolicy.ts`; behind `NEXT_PUBLIC_MFA_TOTP_ENABLED`; tests with a fake SDK and an emulator mock | Identity Platform + TOTP on the live project, then the manual check (access-model §10) |
| Power-interruption detection | 🟡 | `powerStatus` enum in rules and assessment (`database.rules.json:51-53`; `assessPower`); client-side staleness 30 s (`monitoringAssessmentCore.ts:103`) | No server `lastSeen`/heartbeat watchdog. No AC-sense input in firmware. No battery/UPS. No alert. |

---

## 6. Rules engine, alerts, device control

**Where does classification run?**

- **In the browser only**, in `src/utils/monitoringAssessmentCore.ts` (shared with mobile by copy, per its header comment at `:1-3`). It's called from `monitoringHelpers.ts:17` and `dashboardHelpers.ts:112`.
- It doesn't run in Cloud Functions or on the ESP32.
- Results are never persisted. Two users looking at the same tank compute the result independently, and nobody computes it when no browser is open.

**Thresholds: hardcoded or in the DB?**

- The *normal limits* are per-aquarium fields on the Firestore `aquariums` doc. The user edits them in the profile form (`AquariumFormModal.tsx:164-169`), with the preset from `aquariumManagementHelpers.ts:19-24`.
- The *severity bands* (critical deltas, turbidity 5/10 NTU) are **hardcoded** (`monitoringAssessmentCore.ts:54-61`).
- Nothing is stored in a rules or thresholds collection.

**Recommendations: generated and stored?**

- They are generated in memory as a string with a rule ID (`monitoringAssessmentCore.ts:170-178`).
- They are **not stored**. There's no `recommendations` collection, no status lifecycle (Pending/Applied/Resolved), and no link to maintenance.

**The Alerts page is a separate, conflicting rule set.**

- `buildStaticAlerts` (`useAlertsController.ts:47-90`) compares `aquarium.temp`, `aquarium.level`, and `aquarium.quality` (static Firestore fields, default `0`/`0`/`100` at `aquariumService.ts:213-215`) against the limits.
- For any aquarium without those legacy fields, `temp = 0 < minTemp` and `level = 0 < minLevel`, so every load raises a **temperature WARNING and a water-level CRITICAL from missing data**. That violates AGENTS.md §5.
- It also uses `tdsPpm > 500`, which comes from no approved source.

**FCM:** there is no service worker, no `getMessaging`/`getToken`, no token collection, and no sender function. It's **missing end to end**.

**`functions/` contents** (`functions/src/index.ts`):

| Export | Type | Purpose |
|---|---|---|
| `transferAquariumOwnership` | callable (`:88`) | Admin moves an aquarium to another user; locks, audit |
| `prepareAquariumDeletion` | callable (`:113`) | Owner revokes and blocks an aquarium, retains records |
| `updateUserRoleTrusted` | callable (`:137`) | Admin role change; protects the last admin (`trustedMutations.ts:1128`) |
| `revokeUserAccount` | callable (`:166`) | Admin disables a user and their aquariums |
| `queueSupportMessageEmail` | Firestore onCreate (`:190`) | Writes to the `mail` collection (Trigger Email extension pattern) |
| `syncUserAuthorizationMirror` | Firestore onWrite (`:263`) | Mirrors user role/state to RTDB `authorization/users` |
| `syncUserVerificationPolicyMirror` | Firestore onWrite (`:296`) | Mirrors the email-verification policy |
| `syncAquariumAuthorizationMirror` | Firestore onWrite (`:315`) | Mirrors aquarium owner/state to RTDB `authorization/aquariums` |
| `reconcileAuthorizationMirror` | schedule, every 24 h (`:353`) | Repairs mirror drift |

There is **no** telemetry ingest, classification, alerting, history, `lastSeen` watchdog, FCM, report, or device-provisioning function. Deploying any of this needs the Blaze plan (it is **Unknown** whether the project is on Blaze).

**Device control round trip:**

| Hop | Status | Evidence |
|---|---|---|
| UI button → RTDB `devices/{aquariumId}/commands/latest` | ✅ | `useMonitoringController.ts:591-612,671`; `deviceService.ts:164-186` |
| Schedules → RTDB `control` | ✅ (light times uncommitted) | `useMonitoringController.ts:569-583`; `types/device.ts:242-256` |
| Rules allow the device to read commands/control | ✅ | `database.rules.json:68,110` |
| ESP32 reads commands | ❌ | Current firmware has no networking |
| ESP32 actuates relay/servo | ❌ | Pins defined but held inactive (`SmartAquaPhase1.ino:6-18`) |
| ESP32 writes ack/state back | ❌ | No ack node exists; device writes under `commands` are denied (`database.rules.json:111,138-141`) |
| UI updates from the device state | 🟡 | The UI listens to `commands/latest` and telemetry `filterState`, but shows the *requested* state optimistically (`useMonitoringController.ts:631-690`) |

---

## 7. Security findings

### Critical
- *(none in code)*. The most serious security-adjacent issue is functional. A user cannot see that an aquarium is unmonitored, because the Alerts page fabricates alerts from missing data (`useAlertsController.ts:47-90`). The fix is listed under High.

### High
1. **Rules tests not verified in this audit.** All isolation claims depend on `tests/firestore` and `tests/rtdb`, which need the Firebase CLI (missing). Add `firebase-tools` as a devDependency and run `npm run test:security` before the defense.
2. **No device identity provisioning.** Real ESP32s can't be onboarded securely. If the team takes a shortcut (for example by loosening `database.rules.json:13` to accept password users), isolation breaks. Build a callable or admin script that mints custom tokens with `principalType: 'device'` and writes `deviceUids`.
3. **Business-rule duplication in the client.** Alerts (`useAlertsController.ts:78`) and the dashboard severity collapse (`dashboardHelpers.ts:121`) diverge from the canonical engine. That conflicts with AGENTS.md §13–14 and produces misleading safety information.

### Medium
4. **Client-computed classification.** A malicious or modified client can show whatever it wants. That's fine for display, but alerts, history, and reports must come from a server function.
5. **Open self-registration** (`authService.ts:135-160`, `firestore.rules:595`). Anyone can create a `User` account and aquariums. Acceptable for a demo, but document it or gate it with an admin invite.
6. **No MFA** even though the manuscript promises it. App Check is optional and off unless `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` is set (`src/firebase.ts:24-32`).
7. **Dependency vulnerabilities:** 1 critical and 6 high in root, 1 high in functions (§3). Mostly transitive or dev; run `npm audit fix` (non-breaking) and bump `firebase`.
8. **Functions runtime mismatch:** requires Node 22, developed on Node 24 (`functions/package.json:8`).

### Low
9. **Firebase web API key in git history:** `src/firebase.ts` at commits `ebcb3c9`, `f93d077`. Web keys are public identifiers, but restrict the key by HTTP referrer in the Google Cloud console.
10. **Stale build outputs** (`dist/`, `.next/`) contain the web config. They're ignored, so this is just housekeeping.
11. **Lockout is client-side** (`src/utils/authRateLimit.ts`, localStorage). It's UX only; Firebase Auth's server throttling is the real control.
12. **Admin-UI role checks** (`Layout.tsx:56-58`) are client-only. That's acceptable, because the data access behind them is enforced in rules (`isAdmin()`, `firestore.rules:34-38`) and in callables (`trustedMutations.ts:264`).

### Good practice observed
- Default-deny at both roots (`firestore.rules:718-720`; `database.rules.json:3-4,157-160`).
- No test-mode or expiry rules.
- The `authorization` mirror is unreadable by clients.
- Server-written collections are `write: false` for clients.
- Email verification is enforced in rules (`firestore.rules:9-25`).
- Idempotent, locked, audited admin mutations.
- `.env`, `.env.local`, and `secrets.h` are gitignored (`.gitignore:18,32-33`).
- No service-account JSON or Wi-Fi credentials anywhere in history (firmware used `#include "secrets.h"`).

---

## 8. Next.js migration and mobile status

**Next.js: done structurally, not idiomatically.**

- **Ported:** the build is Next 16 (`package.json:7-9`). There are no `vite` deps or `import.meta.env` uses left, the env names were migrated (`next.config.mjs`), and ESLint uses `eslint-config-next`.
- **How it was done:** the whole Vite SPA is mounted under a single route. `src/app/page.tsx` → `AppClient` (`'use client'`, `src/components/layout/AppClient.tsx:1`) → `Layout.tsx`, which switches "pages" with `useState` + `localStorage` (`Layout.tsx:62-81,273`).
  - There are no App Router routes, layouts per page, deep links, or server components.
  - The `src/views/` folder is the old Vite pages folder.
- **Still Vite-era:** `src/App.css` (`.vite` classes), `src/assets/{vite,react}.svg`, `hero.png`, and the stale `dist/` folder.
- **Duplication:** none between Vite and Next; the Vite entry was removed.

**SSR pitfalls:**

- `src/firebase.ts` initializes Auth, Firestore, RTDB, and Functions at module load. That runs during static prerender too. It doesn't crash (the build passed), but it's wasteful. App Check is correctly guarded with `typeof window` (`:27`).
- **Hydration mismatch risk:** `Layout.tsx:47-53,62-67` reads `localStorage` in `useState` initializers. On the server it returns `'dark'`/`'dashboard'`, and on the client it returns the saved value. For a returning user that will produce React hydration warnings or a flicker.
- `'use client'` appears only in `AppClient.tsx`. That's sufficient, because everything else is imported beneath it.

**Mobile app:**

- **Not in this repo.**
  - An Expo 54 / React Native 0.81 app existed under `apps/mobile/` in commit `156e3c9` and was reverted in `85c0e8f`.
  - `tests/integration/monitoring-assessment-parity.test.mjs:6,8` imports from `../smart-aqua-mobile/`, so a separate mobile repo is assumed. It isn't present on this machine.
  - The header of `monitoringAssessmentCore.ts:1-3` says mobile keeps a copy of the engine.
- **Completeness relative to web:** **Unknown.**

---

## 9. Manuscript vs. code mismatches

**Collections and paths:**

| Manuscript | Code | Note |
|---|---|---|
| `users` (role admin / caretaker/owner) | `users` with `role: 'Admin' \| 'User'` (`firestore.rules:80`, `roleHelpers.ts`) | Role names differ |
| `user_aquarium_assignments` | **absent**; single `aquariums.ownerId` | No many-to-many, no `role_in_aquarium` |
| `fish_species`, `tank_configuration` | Embedded in `aquariums` (`species[]`, `fishWeightsG`, `tankConfiguration`, `types/aquarium.ts`) | Not separate collections |
| `sensor_readings` (ph, tdsPpm, turbidity, temperatureC, waterLevelPercent, filterState, power, recordedAt) | `sensor_readings` and `aquariums/{id}/sensor_readings/{dateKey}/readings/{timeKey}` (`sensorReadingsService.ts:218-267`); mixed `aquariumId` and `aquarium_id`; `device_id = aquariumId` | Two locations; fake device ID; also carries `ammoniaPpm`, `waterQualityPercent` |
| `prescriptive_rules` / `threshold_settings` | **absent** (hardcoded TS) | FR13 |
| `alert_records` | Rules exist (`firestore.rules:671-678`), no writer | snake_case `aquarium_id`, unlike `sensor_readings` |
| `recommendations` | **absent** | |
| `maintenance_actions` | **absent** | |
| `monitoring_reports` | Rules exist, no writer | |
| RTDB `devices/{deviceId}/…` | `devices/{aquariumId}/…` | Keyed by aquarium; `commands` is a single `latest` node; no `lastSeen` |
| `history` written by the device | Device write **denied** (`database.rules.json:146-148`) | Intended to be written by a backend, which doesn't exist |

**In the code but not in the manuscript:**

- Support messaging (`support_threads`, `mail`, `src/views/Support.tsx`, `functions/src/index.ts:190`).
- The `aquarium_directory` admin projection.
- `security_*` collections and the RTDB `authorization/` mirror.
- `authorization_user_policies` (email-verification policy).
- The Landing marketing page.
- The dev telemetry simulator.
- Non-goldfish species and generic bioload profiles in `Automation.tsx:8-40` (**out of scope**).
- TDS "purity %" classification (`minQuality`), a project-specific conversion that isn't in the data dictionary.

**In the manuscript but not in the code:**

- MFA, FCM push, the prescriptive rules table, recommendation lifecycle, maintenance logging, and PDF reports.
- Ammonia is still in the code (`database.rules.json:42`; 16 references in `src/`), but per project notes it's out of scope (no sensor). Remove it, or get the manuscript amended.
- A power-sense module, a filter-flow sensor, a device registry, and `device_id` as a first-class entity.

---

## 10. Prioritized backlog

Sizes: S ≤ 1 day, M 2–4 days, L 1–2 weeks.

### Must have for defense
| # | Task | Size | Depends on |
|---|---|---|---|
| 1 | Install `firebase-tools` as a devDependency; run and fix `npm run test:security` | S | — |
| 2 | **Agree on the ESP32 → RTDB payload contract with Gian.** Decide `devices/{aquariumId}` vs `{deviceId}`, add `turbidity`/`powerStatus`/`equipmentStatus`/`lastSeen`, add pH, turbidity, and level validity flags, and add an ack node. Update `docs/hardware/esp32-firebase-interface-contract.md` (currently stale). | S | — |
| 3 | Device provisioning: an admin callable or script that creates the device UID, sets the `principalType:'device'` claim, writes `deviceUids`, and issues a custom token or refresh flow for the ESP32 | M | 2 |
| 4 | **Firmware v1:** Wi-Fi + TLS, device auth, read all sensors, PUT telemetry with `updatedAt{.sv}` at a fixed interval, read `control`/`commands/latest`, drive relays and servo, write the ack (restore from `f93d077`/`156e3c9` as a starting point) | L | 2, 3 |
| 5 | Get the threshold and recommendation matrices approved by the adviser, with citations (`docs/*-approval-matrix.csv`) | S (team) | — |
| 6 | Cloud Function `onValueWritten(devices/{id}/telemetry)`: validate (incl. stuck values) → write `sensor_readings` → classify (move `monitoringAssessmentCore` to a shared package) → write `alert_records` + `recommendations` with dedup/cooldown | L | 2, 5 |
| 7 | Replace `buildStaticAlerts` with a live `onSnapshot` on `alert_records` (read/resolve) and delete the static rule (`useAlertsController.ts:47-90`) | M | 6 |
| 8 | Scheduled `lastSeen` watchdog → offline / power-interruption alerts | M | 4, 6 |
| 9 | Admin UI: role change and revoke (wire the existing callables), aquarium assignment/transfer, threshold override | M | — |
| 10 | Store rules in Firestore (`prescriptive_rules`) with an admin editor; the function reads them | M | 5, 6 |
| 11 | Remove or replace the fake Automation page, header bell, and settings sample data; out-of-scope species | S | 7 |
| 12 | Fix dashboard severity collapse (`dashboardHelpers.ts:121`) so it shows NORMAL / WARNING / CRITICAL / no data | S | — |
| 13 | Demo seed: 2 accounts, 2 aquariums, 2 devices (Tank A normal; Tank B abnormal *with no fish*). Document it in the README. | S | 3 |

### Should have
| # | Task | Size | Depends on |
|---|---|---|---|
| 14 | FCM: service worker, token collection per user, sender in the alert function, targeting the aquarium owner only | M | 6 |
| 15 | Maintenance actions against a recommendation (Pending → Applied → Resolved) | M | 6 |
| 16 | Command log in Firestore (who, when, ack, result) mirrored from RTDB by a function | M | 4 |
| 17 | Daily/weekly/monthly `monitoring_reports` (scheduled function) and PDF export | M | 6 |
| 18 | Login audit (`beforeSignIn` blocking function or client log via a callable) and an admin audit viewer | M | — |
| 19 | Bring the mobile app into the repo (or document its repo) and get the parity test green | M | — |
| 20 | `npm audit fix`; align the Node version for functions | S | — |

### Nice to have
| # | Task | Size | Depends on |
|---|---|---|---|
| 21 | MFA (TOTP) for Admin | M | — |
| 22 | Real App Router routes, fixing localStorage hydration (`Layout.tsx:47-67`) | M | — |
| 23 | Remove dead code (§3) and Vite assets; move the `.docx` files out of git (31 MB) | S | — |
| 24 | Remove `ammoniaPpm`/`waterQualityPercent` after the manuscript decision | S | 2 |

---

## 11. Open questions for the team

1. **Firmware:** where is the current ESP32 sketch? The repo version was cut to a TDS bench test on 2026-11-04 (`6604b31`). Is there a newer local copy with Gian?
2. **RTDB key:** stay with `devices/{aquariumId}` (the current code) or switch to `devices/{deviceId}` (the manuscript)? This decides the provisioning design.
3. **Device auth:** custom-token device principals (what the rules require), or email/password device accounts (what the reverted firmware used)? The rules allow only the former.
4. **Mobile:** where does the `smart-aqua-mobile` repo live, and what stack is final? The parity test assumes it's a sibling.
5. **Thresholds:** who signs off on goldfish limits and severity margins? Is TDS judged in ppm or the "purity %" conversion?
6. **Roles:** is "Owner/Caretaker" a single role (as coded, `User`) or two? Must one aquarium support several caretakers (that would need `user_aquarium_assignments`)?
7. **Admin scope:** should Admin see live telemetry? The RTDB rules deny it today (`database.rules.json:12`).
8. **Firebase plan:** is `practice-smartaqua` on Blaze? Every remaining server feature (functions, scheduler, FCM sender) needs it.
9. **Power sensing:** which AC-sense module and which UPS/battery for the ESP32? Which filter-status sensor (flow or current)?
10. **Uncommitted change:** commit the `lightOnTime`/`lightOffTime` addition in `src/types/device.ts` on this branch?
11. **Support messaging and email:** this isn't in the manuscript. Keep it as an extra, or add it to the scope chapter?
