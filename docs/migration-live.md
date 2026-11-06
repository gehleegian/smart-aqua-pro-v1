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

## 6. Afterwards

- [ ] Update `AUDIT.md` §4 with the date of each step.
- [ ] Decide on cleaning up the test data (`docs/device-contract.md` §7). That's a separate, reviewed delete; it isn't part of this plan.
