# Live switchover plan (`practice-smartaqua`)

**Status:** plan only. **Nothing in this file has been run.** Each step is run by a person (Jay, plus Gian for the firmware), at a time scheduled together, with the live tank watched as you go.

**Order:** rules → indexes, binding and rule seed → functions → firmware → app → enforce flags. Every step is backward compatible with the step before it, so you can stop between any two steps.

---

## 0. Before you start

- [ ] Upgrade the project to Blaze (needed for the Cloud Function). Set a budget alert.
- [ ] On `feat/device-pipeline`, run `npm run test:security`, `npm run test:rule-engine`, `npm run test:telemetry-ingest`, `npm run test:telemetry-ingest-trigger`, `npm run test:device-heartbeat`, `npm run build`, and `npm run lint`. All must pass.
- [ ] Back up the current state (reads only):
  ```bash
  firebase database:get / --project practice-smartaqua > backup-rtdb-$(date +%F).json   # keep out of git
  git show d13bc31:database.rules.json > rollback-database.rules.json
  ```
- [ ] Ask Gian for the current firmware `.bin` (or its source), so step 3 can be rolled back.
- [ ] Confirm that Aquarium 1 is live: `updatedAt` should advance every ~7–15 s.

## 1. Deploy the RTDB rules (backward compatible)

**What changes:**
- optional `phReadingValid`, `turbidityReadingValid` and `mainsPresent` in telemetry
- the new `commandAck/latest` node
- the new `deviceBindings/{deviceUid}` node

**What stays the same:** the payload the current firmware sends remains valid. This is tested in CONTRACT-01.

```bash
firebase deploy --only database --project practice-smartaqua
```

**Check:** within 30 s, Aquarium 1's `updatedAt` is still advancing, and the dashboard still shows live data.

**Rollback:**
```bash
cp rollback-database.rules.json database.rules.json && firebase deploy --only database --project practice-smartaqua && git checkout database.rules.json
```

### 1b. Bind the live device (one admin write)

Using the Firebase console, or an admin script you review first, set:

```
deviceBindings/esp32-SAQ-7K3M-9R2X = "<Aquarium 1 aquariumId>"
```

The value must equal the `authorization/aquariums/{id}` entry whose `deviceUids` contains this UID.

**Rollback:** delete `deviceBindings/esp32-SAQ-7K3M-9R2X`. Current firmware doesn't read it.

### 1c. Deploy the Firestore rules and indexes

```bash
firebase deploy --only firestore:indexes --project practice-smartaqua
firebase deploy --only firestore:rules --project practice-smartaqua
```

Indexes: `sensor_readings` (history), `recommendations` (aquariumId, createdAt desc), `alert_records` (aquarium_id, lastSeenAt desc), `maintenance_actions` (aquariumId, actionType, performedAt desc). Wait until all show **Enabled** in the console. Until then the history page falls back to RTDB history and the recommendations / stored-alerts panels show an error.

The Firestore rules (Sprint 2) add read access to `species` and `rules`, owner read and the applied/dismissed transition on `recommendations`, and owner read on `maintenance_actions`. Nothing existing is loosened (FS-01..36).

**Rollback:** indexes: none needed. Rules: `git show 750427f:firestore.rules > firestore.rules && firebase deploy --only firestore:rules --project practice-smartaqua && git checkout firestore.rules`.

### 1d. Seed the DRAFT thresholds and rules

```bash
npm run seed:rules -- --dry-run --project practice-smartaqua   # shows what would be written
npm run seed:rules -- --project practice-smartaqua             # asks you to type the project id
```

Writes `species/goldfish` and the 27 `rules/*` docs, all `status: draft`. The app shows "Thresholds and rules have not loaded" for every aquarium until this is done, so seed **before** step 4.

**Rollback:** delete the `species` and `rules` collections in the console (nothing else reads them before step 2/4).

## 2. Deploy the rules-engine functions

**Region.** Every function deploys to **asia-southeast1**, next to Firestore and the RTDB (`setGlobalOptions` with `functions/src/region.ts`; 2nd-gen database triggers must be in their database's region). The web app (`NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION`) and the mobile app (`EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION`) default to the same region. A client built for `us-central1` cannot reach these callables.

```bash
npm run build:functions
firebase deploy --only functions:ingestDeviceTelemetry,functions:checkDeviceHeartbeat,functions:checkCleaningSchedule,functions:onMaintenanceActionLogged --project practice-smartaqua
```

Deploy **only** these four. The other functions in `functions/src/index.ts` (authorization sync, trusted mutations, support email) have never been deployed, and deploying them needs a separate decision and its own review.

**Check:**
- Within about 1 minute, one `sensor_readings` doc appears for Aquarium 1 with `source: "device"` and `sampleReason: "first_of_day"`, plus a `validity` map. Expect `ph: "valid"`, `tds: "invalid"`, `turbidity: "missing"`.
- Aquarium 1 gets a `condition` summary (expected `critical` with today's 26.5 °C / ~16 % level) and open `alert_records` for temperature, pH, water level, the TDS sensor fault and the inactive filter, each with a pending recommendation. **These are real alerts the owner will see.** Decide beforehand whether to calibrate/check the tank first (see AUDIT §4.1).
- No `device_offline` alert while telemetry is fresh.
- After that, roughly one row every 5 minutes.
- `firebase functions:log --only ingestDeviceTelemetry` shows no errors.

**Cost note:** the ingest function runs on every telemetry write: about 11,700 times a day per aquarium at the current ~7.4 s interval, or 5,760 at 15 s. Each run reads the aquarium doc and the engine state (rules are cached 5 min). Firestore writes are about 1,560 a day per aquarium when normal and about 2,060 with two open alerts (measured, `docs/rule-engine.md` §8). The heartbeat adds 1,440 runs a day for the whole project. Check the Blaze usage after 24 h.

**Rollback:**
```bash
firebase functions:delete ingestDeviceTelemetry checkDeviceHeartbeat checkCleaningSchedule onMaintenanceActionLogged --project practice-smartaqua
```

Rows, alerts and recommendations it already wrote stay (they're marked `source: "device"`). Telemetry is unaffected.

## 3. Flash the firmware (Gian), in stages

Follow `docs/firmware-changes.md`. Flash one stage at a time and check each before moving on:

| Stage | Change | Check |
|---|---|---|
| 3a | 15 s interval; `updatedAt` = server timestamp; NTP | `updatedAt` advances every ~15 s, close to server time |
| 3b | `phReadingValid`, `turbidityReadingValid`, no placeholder zeros | The dashboard pH stays a number; unplugging the pH probe shows "Sensor error" |
| 3c | `commandAck/latest` | Feed Now in the web shows Waiting → Done |
| 3d | WiFiManager + 5 s reset; `deviceBindings` lookup | Reboot reconnects; a 5 s press opens the portal; telemetry resumes |
| 3e | `mainsPresent`; real `equipmentStatus`; TDS fix; turbidity | Unplug the mains adapter: a Power Interruption alert within ~15 s; `tdsReadingValid: true` |

**Rollback (any stage):** reflash the previous `.bin`. The rules accept both the old and the new payloads.

## 4. Deploy the web app

Deploy the `feat/device-pipeline` build to wherever the web app is hosted. That target isn't configured in this repo (there's no `hosting` entry in `firebase.json`).

**What changes for users:**
- the 60 s offline window
- "Sensor error" shown in place of invalid values
- command status (Waiting / Done / Failed / No response)
- alerts and history driven by the rule engine (stored `alert_records`, recommendations panel, condition badge, "Draft thresholds" and "Not monitored" badges, next-cleaning card)
- profile limits are no longer pre-filled from code; "Apply species defaults" uses `species/goldfish`

The app tolerates rules without `commandAck`: the ack listener fails quietly. So deploying the app before step 1 is safe, but it isn't the planned order.

**Rollback:** redeploy the previous build (the `main` at `d13bc31`).

## 5. Enforce the validity flags (after stage 3b runs everywhere)

1. Set `REQUIRE_SENSOR_VALIDITY_FLAGS = true` in `src/utils/monitoringAssessmentCore.ts`.
2. Copy that file to `functions/src/shared/monitoringAssessmentCore.ts` (the parity test checks it) and to the mobile repo.
3. Redeploy the web app (step 4) and the function (step 2).

From then on, a missing `<sensor>ReadingValid` flag counts as a sensor fault (decision 4).

**Rollback:** set it back to `false` and redeploy both.

## 7. Organizations, QR claiming and caretakers (Sprint 3, at go-live)

**Status:** plan only, emulator-tested (`npm run test:migrate-orgs`, `npm run test:sprint3-e2e`). Scheduled for go-live (Sprint 6), not before. See `docs/access-model.md`.

**Order matters:** the Sprint 3 Firestore rules list aquariums by `orgId`, so the data must be migrated **before** those rules are deployed. RTDB rules are backward compatible either way: caretaker access is additive, and device rules are unchanged.

### 7·0. Live baseline changed by PR #8 (merged 2026-11-07)

Gian's PR #8 is merged, and his handoff (`docs/security/review-handoff-2026-11-07.md`) reports that live Firestore already runs **`firestore.claiming.rules`**, a focused rollout, not this repo's `firestore.rules`. Live `device_registry` holds his schema: a pre-reserved `aquariumId`, `ownerUid`, and `device_uid_registry`, with no `claimCodeHash`. Aquarium 2 is registered live and not yet claimed.

Decisions (2026-11-07): our `claimDevice` callable stays the claim path, **claim codes stay required**, and the target plan is **Blaze**. Before 7c:
- [ ] Back up the live rules that are actually deployed (`firebase firestore:rules:get` or the console), not this repo's file.
- [ ] Inventory live `device_registry` and `device_uid_registry` (read-only).
- [ ] **Convert his registry** with `scripts/convert-pr8-registry.ts` (Sprint 5, emulator-tested: `npm run test:convert-pr8`, 5 tests on his schema seeded exactly as live). The exact order is in **7·0a** below.

### 7·0a. Order relative to Gian's live rules

His `firestore.claiming.rules` deny every client read and write on `device_registry` and `device_uid_registry` (the final `match /{document=**}` rule). Only Admin SDK scripts touch them, so the converter can run while his rules are still deployed. What matters is the order against **our** rules (7d): they list aquariums by `orgId`, so Aquarium 2 needs its org before 7d.

1. **With Gian:** confirm no claim is in progress (no registry doc in state `claiming` or `activating`). Confirm that nobody will use his `/api/devices/claim` route during the switchover; better, remove its server credentials from the hosting environment. The converter skips in-progress claims and tells you which.
2. Back up, read-only (keep out of git):
   ```bash
   firebase firestore:rules:get --project practice-smartaqua > rollback-firestore.claiming.rules   # or copy from the console
   # export device_registry, device_uid_registry, aquariums, aquarium_directory, users (console or gcloud export)
   firebase database:get /authorization --project practice-smartaqua > backup-authorization-$(date +%F).json
   firebase database:get /deviceBindings --project practice-smartaqua > backup-deviceBindings-$(date +%F).json
   ```
3. **7b**: deploy the functions. `claimDevice` must already know `reservedAquariumId` before a converted device is claimed.
4. **7c**: run `migrate-orgs.ts`. It gives Aquarium 2's owner a personal org and adds `orgId` to the tank. It leaves his registry docs alone, because they already exist.
5. Run the converter, in the same session:
   ```bash
   npm run build:functions
   CLAIM_CODE_PEPPER=… node --experimental-strip-types scripts/convert-pr8-registry.ts --project practice-smartaqua --database-url <RTDB URL> --dry-run
   CLAIM_CODE_PEPPER=… node --experimental-strip-types scripts/convert-pr8-registry.ts --project practice-smartaqua --database-url <RTDB URL>
   ```
   The pepper must be the same value as the deployed `CLAIM_CODE_PEPPER` secret. Pass it in the environment of your own terminal only; never paste it into a shared log or commit it. The script asks you to type the project ID before it writes. Against a real project it **refuses to start** if `CLAIM_CODE_PEPPER` is not in the environment, and never falls back to `functions/.secret.local` (the emulator pepper).
   - **Aquarium 2 (claimed):** becomes `status: claimed` with `orgId`, `claimedBy` = his `ownerUid`, `claimedAtMs` and `claimCodeHash: null`. It gets `deviceBindings/<his device UID>` if that is missing, and the mirror is re-synced (adds `orgId`; `ownerUid`, `state`, `deviceUids` and `claimOperationId` are kept). No code is needed.
   - **Unclaimed devices he provisioned:** each gets a new claim code (stored only as an HMAC). The QR label goes to `provisioning-output/pr8-conversion/<SAQ-…>/` (gitignored). His pre-reserved `aquariumId` becomes `reservedAquariumId`, and `claimDevice` creates the tank under that ID: the ID his firmware already writes to (`AQUARIUM_ID` in `DeviceIdentity.h`). So **no reflash is needed**. `state` becomes `converted`, so his ID-only route can no longer claim it.
   - Every one of his fields stays, and a full copy is kept in `pr8Original`. Re-running plans 0 steps and never issues a second code.
   - **Check:** a second `--dry-run` says `0 step(s)`. Aquarium 2's `updatedAt` keeps advancing, and its owner still sees it.
6. **7d** (our rules), then **7e** (the app), back to back as before.
7. Print the new label(s) and attach them to the device(s). Gian keeps the `claim.json` private.

**Rollback of the converter:** each converted doc carries `pr8Original` (his exact doc) and `convertedFromPr8At`. Restore with an admin script that sets the doc back to `pr8Original`. Delete `deviceBindings/<uid>` only if it was missing in your backup. Re-deploy his rules from `rollback-firestore.claiming.rules`. Nothing on the device changes in either direction.

- [ ] Do not configure the `/api/devices/claim` route's server credentials (`.env.claiming.example`) in production. It is superseded and would create aquariums without an organization.

### 7a. Prerequisites
- [ ] Steps 1–4 are done and stable.
- [ ] Back up again (reads only): `firebase database:get /authorization --project practice-smartaqua > backup-authorization-$(date +%F).json` (keep it out of git). Export `aquariums`, `users` and `aquarium_directory` from Firestore.
- [ ] Generate and set the claim-code pepper. **Never print it into a shared terminal log, and never commit it.**
  `firebase functions:secrets:set CLAIM_CODE_PEPPER --project practice-smartaqua`
- [ ] **Decided (Sprint 4):** deploy the authorization-sync functions here, at go-live: `syncAquariumAuthorizationMirror`, `syncUserAuthorizationMirror`, `syncUserVerificationPolicyMirror`, `reconcileAuthorizationMirror`. They were never deployed (step 2), and the callables rely on the same mirror sync.
- [ ] **Decided (Sprint 4): go-live order is migrate (7c) → rules (7d) → app (7e), back to back,** with the **mobile app updated before go-live**. The new rules deny the old `ownerId` list query that the current mobile build uses.

### 7b. Deploy the Sprint 3 functions
```bash
npm run build:functions
firebase deploy --only functions:syncAquariumAuthorizationMirror,functions:syncUserAuthorizationMirror,functions:syncUserVerificationPolicyMirror,functions:reconcileAuthorizationMirror --project practice-smartaqua
firebase deploy --only functions:claimDevice,functions:createInvite,functions:acceptInvite,functions:revokeInvite,functions:removeMember,functions:setMemberRole,functions:updateCaretakerAssignments,functions:setOrganizationStatus,functions:syncOrganizationAuthorizationMirror,functions:syncMemberAuthorizationMirror --project practice-smartaqua
```
Nothing calls them until the app is deployed (7e).

### 7c. Run the data migration
```bash
npm run build:functions        # the script reuses functions/lib/src/authorizationSync.js
node --experimental-strip-types scripts/migrate-orgs.ts --project practice-smartaqua --database-url <RTDB URL> --dry-run
node --experimental-strip-types scripts/migrate-orgs.ts --project practice-smartaqua --database-url <RTDB URL>
```
It asks you to type the project ID. It needs Admin credentials (Application Default Credentials); never commit a service-account key.

**What it does:**
- Each aquarium owner gets a personal org `org-<uid>` with themselves as owner.
- Each of their aquariums gets `orgId` and empty `caretakerIds`. `ownerId` and the profile are untouched.
- `esp32-SAQ-7K3M-9R2X` is registered in `device_registry/SAQ-7K3M-9R2X` as **claimed**, with no claim code, `migratedFrom: device-claim-SAQ-7K3M-9R2X`.
- `deviceBindings/esp32-SAQ-7K3M-9R2X` is added if step 1b didn't already add it.
- Admins get the `platformAdmin` claim.
- The RTDB mirror gets `orgId`. `ownerUid`, `state`, `deviceUids` and `claimOperationId` are kept.

Re-running it is a no-op.

**Check:**
- Aquarium 1 keeps receiving telemetry: `updatedAt` advances.
- `authorization/aquariums/<Aquarium 1>` still has `state: active` and its `deviceUids`, now with `orgId`.
- A second `--dry-run` shows `0 step(s)`.

### 7d. Deploy the Sprint 3 rules and indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes,database --project practice-smartaqua
```
**Check:** the owner of Aquarium 1 still sees it, and its live readings, in the **new** app (7e). The old app's `ownerId` list query is denied from this point, so do 7d and 7e back to back.

### 7e. Deploy the web app
Users with no org now see "Add your first device / Waiting for an invite". Existing owners land in their personal org.

### 7f. Sprint 4 functions and push notifications

Deploy together with 7b. They are emulator-tested only (`npm run test:sprint4-functions`, `npm run test:sprint4-e2e`, `npm run test:smoke`).

1. **VAPID key (web push).** Firebase console → Project settings → Cloud Messaging → Web Push certificates → **Generate key pair**.
   - Put the **public** key in the web build's environment as `NEXT_PUBLIC_FIREBASE_VAPID_KEY` (hosting env or `.env.local`, which is gitignored).
   - The private key stays in Firebase. Never copy it into the repo, an env file or a chat.
   - Without the public key, "Turn on alerts" says push is not configured, and nothing else changes.
2. **Functions:**
   ```bash
   firebase deploy --only functions:logMaintenance,functions:logDeviceCommand,functions:logDeviceCommandAck,functions:checkCommandAcks,functions:notifyAlertRecord,functions:notifyCleaningReminder,functions:saveRuleConfig,functions:approveRuleConfig --project practice-smartaqua
   ```
   `checkCommandAcks` is a 1-minute schedule (Cloud Scheduler, Blaze plan). It only writes when a command is past 30 s without an ack.
3. **Rules and indexes:** included in 7d (`fcmTokens`, `notificationPrefs`, `command_logs`, `security_audit_events`, scheduled acks, `coOwnerUids`, and three new indexes).
4. **Check real delivery** (FCM cannot be emulated). Follow `docs/notifications.md` §6.

**Expected after deploy:** devices still running older firmware show **No response** (grey). The repository firmware now writes app and schedule acknowledgements, but each physical device must be flashed and verified before `Done`/`Failed` is expected (`docs/firmware-changes.md` §4, §11).

### 7g. Sprint 5: reports, Storage and indexes

Emulator-tested only (`npm run test:reports`, `test:report-summary`, `test:storage-rules`, `test:firestore-org-rules`, `test:smoke`).

1. **Storage:** make sure the default bucket exists (Console → Storage → Get started; on Blaze). Then deploy the rules:
   ```bash
   firebase deploy --only storage --project practice-smartaqua
   ```
   `storage.rules` opens only `reports/{orgId}/{aquariumId}/*` (read: the tank's owners and assigned caretakers, plus platform admins) and closes everything else. Report files are written only by the functions.
2. **Indexes:** included in 7d (`sensor_readings` by `aquariumId` + `recordedAtEpoch` asc and desc, `alert_records` by `aquarium_id` + `triggered_at`, `monitoring_reports` by `aquarium_id` + `generated_at`). Wait for **Enabled**.
3. **Functions:**
   ```bash
   firebase deploy --only functions:generateMonitoringReport,functions:weeklyMonitoringReports,functions:monthlyMonitoringReports,functions:setOrganizationStatus,functions:ingestDeviceTelemetry --project practice-smartaqua
   ```
   - `ingestDeviceTelemetry` now also stores `parameterStatus` on each history row. This is additive; older rows show as "Not recorded" in the per-parameter time.
   - `setOrganizationStatus` now copies the org status onto member docs, for the Storage rules.
   - The schedules run Monday 07:00 and on the 1st at 07:00, Asia/Manila (Cloud Scheduler). Each report reads one period of `sensor_readings` (at most about 2,000 rows a week per tank), so the cost is small.
4. **Check:** generate a daily report for Aquarium 1 in the app. Open the PDF and the CSV. A caretaker of another tank cannot open them (a "You do not have access" message).

### Rollback (reverse order)
1. Redeploy the previous rules: `git show <previous commit>:firestore.rules` and `database.rules.json`, then `firebase deploy --only firestore:rules,database`.
2. Redeploy the previous web build.
3. Run `node --experimental-strip-types scripts/migrate-orgs.ts --project practice-smartaqua --database-url <RTDB URL> --rollback`. It removes exactly what the migration created (docs marked `migratedAt`), clears the `platformAdmin` claims and re-syncs the mirror. Caretakers added after the migration lose access; the script warns about each one.
4. Optionally delete the Sprint 3 and 4 functions: `firebase functions:delete claimDevice createInvite acceptInvite revokeInvite removeMember setMemberRole updateCaretakerAssignments setOrganizationStatus syncOrganizationAuthorizationMirror syncMemberAuthorizationMirror logMaintenance logDeviceCommand logDeviceCommandAck checkCommandAcks notifyAlertRecord notifyCleaningReminder saveRuleConfig approveRuleConfig`.
   Co-owners added in the app would lose owner access with the old rules. Maintenance logs, command logs and FCM tokens are kept and are harmless.

The live device is never touched by either direction. Its `deviceUids` binding stays as it is.

## 8. MFA: Identity Platform with TOTP (Sprint 5, at go-live)

Status: built behind a flag and tested with mocks only. The Auth emulator cannot run TOTP (`docs/access-model.md`, MFA section).

1. **Upgrade Firebase Auth to Identity Platform:** Console → Authentication → Settings → "Upgrade to Firebase Authentication with Identity Platform". The project is already on Blaze. At this scale it is free: Identity Platform's free tier covers the first ~50,000 monthly active users for email/password sign-in (check the current pricing page before upgrading), and TOTP adds no per-use charge. SMS would cost per message, which is why it is not used. Existing users and passwords carry over unchanged.
2. **Enable TOTP** (there is no console switch at the time of writing; use the REST API with an owner's gcloud login, never a committed key):
   ```bash
   curl -X PATCH "https://identitytoolkit.googleapis.com/admin/v2/projects/practice-smartaqua/config?updateMask=mfa" \
     -H "Authorization: Bearer $(gcloud auth print-access-token)" -H "Content-Type: application/json" -H "X-Goog-User-Project: practice-smartaqua" \
     -d '{"mfa":{"providerConfigs":[{"state":"ENABLED","totpProviderConfig":{"adjacentIntervals":1}}]}}'
   ```
   Leave SMS (`enabledProviders: PHONE_SMS`) off.
3. **Web build:** set `NEXT_PUBLIC_MFA_TOTP_ENABLED=true` and redeploy (step 4/7e). Never set `NEXT_PUBLIC_MFA_TOTP_MOCK` in a deployed build. It only works together with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, which a deployed build never sets either.
4. **Manual verification (real phone):** follow `docs/access-model.md`, MFA section, "Verify after deploy". Do it with a test owner account first, then with each platform admin.
5. **Enforce for admins on the server:** once every platform admin has enrolled, set the functions parameter and redeploy the callables:
   ```bash
   # functions/.env.practice-smartaqua (gitignored): REQUIRE_PLATFORM_ADMIN_MFA=true
   firebase deploy --only functions --project practice-smartaqua   # or the callables only
   ```
   Platform-admin callables (suspend an org, rules editor, role changes) then refuse a token without a TOTP second factor. Firestore reads by admins are still gated only in the app; a rules change (`request.auth.token.firebase.sign_in_second_factor == 'totp'` in `isPlatformAdmin()`) is the follow-up, listed in `docs/access-model.md`.

**Rollback:** set `NEXT_PUBLIC_MFA_TOTP_ENABLED=false` and `REQUIRE_PLATFORM_ADMIN_MFA=false`, then redeploy. Users who enrolled still get the code prompt at sign-in (the Firebase SDK asks for it); remove a factor in Console → Authentication → Users → the user → Multi-factor. Do not downgrade from Identity Platform (it is not needed, and not reversible from the console).

## 6. Afterwards

- [ ] Update `AUDIT.md` §4 with the date of each step.
- [ ] Decide on cleaning up the test data (`docs/device-contract.md` §7). That's a separate, reviewed delete; it isn't part of this plan.
