# Live switchover plan (`practice-smartaqua`)

**Status:** plan only. **Nothing in this file has been run.** Each step is run by a person (Jay, plus Gian for the firmware), at a time scheduled together, with the live tank watched as you go.

**Order:** rules → index and binding → function → firmware → app → enforce flags. Every step is backward compatible with the step before it, so you can stop between any two steps.

---

## 0. Before you start

- [ ] Upgrade the project to Blaze (needed for the Cloud Function). Set a budget alert.
- [ ] On `feat/device-pipeline`, run `npm run test:security`, `npm run test:telemetry-ingest`, `npm run test:telemetry-ingest-trigger`, `npm run build`, and `npm run lint`. All must pass.
- [ ] Back up the current state (reads only):
  ```bash
  firebase database:get / --project practice-smartaqua > backup-rtdb-$(date +%F).json   # keep out of git
  git show d13bc31:database.rules.json > rollback-database.rules.json
  ```
- [ ] Ask Gian for the current firmware `.bin` (or its source), so step 3 can be rolled back.
- [ ] Confirm that Aquarium 1 is live: `updatedAt` should advance every ~7–15 s.

## 1. Deploy the RTDB rules (backward compatible)

**What changes:**
- optional `phReadingValid` and `turbidityReadingValid` in telemetry
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

### 1c. Deploy the Firestore index

```bash
firebase deploy --only firestore:indexes --project practice-smartaqua
```

Wait until the index shows **Enabled** in the console. Until it does, the history page falls back to RTDB history.

**Rollback:** not needed (an extra index is harmless). To remove it, delete it in the console.

**Don't** deploy `firestore:rules` in this step: they haven't changed in this sprint.

## 2. Deploy the history ingest function

```bash
npm run build:functions
firebase deploy --only functions:ingestDeviceTelemetry --project practice-smartaqua
```

Deploy **only** this function. The other functions in `functions/src/index.ts` (authorization sync, trusted mutations, support email) have never been deployed, and deploying them needs a separate decision and its own review.

**Check:**
- Within about 1 minute, one `sensor_readings` doc appears for Aquarium 1 with `source: "device"` and `sampleReason: "first_of_day"`, plus a `validity` map. Expect `ph: "valid"`, `tds: "invalid"`, `turbidity: "missing"`.
- After that, roughly one row every 5 minutes.
- `firebase functions:log --only ingestDeviceTelemetry` shows no errors.

**Cost note:** the function runs on every telemetry write, which is about 11,700 times a day per aquarium at the current ~7.4 s interval, or 5,760 at 15 s. Each run reads the aquarium doc, so check the Blaze usage after 24 h.

**Rollback:**
```bash
firebase functions:delete ingestDeviceTelemetry --project practice-smartaqua
```

Rows it already wrote stay (they're marked `source: "device"`). Telemetry is unaffected.

## 3. Flash the firmware (Gian), in stages

Follow `docs/firmware-changes.md`. Flash one stage at a time and check each before moving on:

| Stage | Change | Check |
|---|---|---|
| 3a | 15 s interval; `updatedAt` = server timestamp; NTP | `updatedAt` advances every ~15 s, close to server time |
| 3b | `phReadingValid`, `turbidityReadingValid`, no placeholder zeros | The dashboard pH stays a number; unplugging the pH probe shows "Sensor error" |
| 3c | `commandAck/latest` | Feed Now in the web shows Waiting → Done |
| 3d | WiFiManager + 5 s reset; `deviceBindings` lookup | Reboot reconnects; a 5 s press opens the portal; telemetry resumes |
| 3e | Real `powerStatus` / `equipmentStatus`; TDS fix; turbidity | Values other than `Unknown`; `tdsReadingValid: true` |

**Rollback (any stage):** reflash the previous `.bin`. The rules accept both the old and the new payloads.

## 4. Deploy the web app

Deploy the `feat/device-pipeline` build to wherever the web app is hosted. That target isn't configured in this repo (there's no `hosting` entry in `firebase.json`).

**What changes for users:**
- the 60 s offline window
- "Sensor error" shown in place of invalid values
- command status (Waiting / Done / Failed / No response)
- alerts and history driven by the shared assessment

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
