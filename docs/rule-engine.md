# SmartAqua Pro rule engine

**Status:** implemented in software and verified on the Firebase Emulator Suite. Not deployed. All seeded thresholds and rules are **DRAFT** until the adviser signs off `docs/rule-matrix.md`; draft configuration is preview-only and cannot create live classifications, alerts, recommendations, or cleaning schedules.

Sections 1–5 are written so they can be pasted into Chapter 2 (system design) with light editing.

---

## 1. Overview

SmartAqua Pro uses **rule-based prescriptive analytics**: predefined IF-THEN rules turn a validated sensor reading into a condition classification (NORMAL, WARNING or CRITICAL) and, when applicable, a maintenance recommendation. It does not use machine learning or prediction.

Thresholds and rules are **data**, stored in Cloud Firestore, not code. Changing a value, approving a rule or disabling one is a database edit that takes effect without redeploying the system (within 5 minutes, the function's cache lifetime). The live pipeline activates only when the selected species configuration and every enabled rule are approved. The Rules Editor may still preview draft values for sign-off.

The same evaluation code runs in three places, so results are identical:

| Where | Role |
|---|---|
| Cloud Function `ingestDeviceTelemetry` (RTDB trigger) | Authoritative: writes alerts, recommendations, history and the condition summary |
| Web app (and the mobile copy, once synced) | Displays the server's condition summary; evaluates in the browser only as a fallback before the function has run |
| Unit tests | Verify every rule |

Code: the shared core `src/utils/monitoringAssessmentCore.ts` (a byte-identical copy lives in `functions/src/shared/`, enforced by a test).

## 2. Processing order

For each telemetry write from the ESP32 (`devices/{aquariumId}/telemetry`):

1. **Validate the reading.** Timestamp checks (not before 2000, not more than 5 min in the future, not older than the last processed reading). Per-sensor validity: a missing value, a `<sensor>ReadingValid: false` flag, or a physically impossible value (e.g. pH 0 or outside 0–14, the DS18B20's 85 °C reset value) makes that sensor **invalid**.
2. **Associate it with the aquarium.** The aquarium doc must exist and have an owner. The RTDB rules already ensure only the bound device can write.
3. **Apply the approval gate.** If the selected species configuration or any enabled rule is still draft, record an unavailable assessment and stop before alert/recommendation generation.
4. **Resolve the thresholds:** approved species defaults (`species/{id}`). Aquarium-specific overrides remain preview-only until they have an approval contract (§4).
5. **Classify each valid parameter** against the thresholds: NORMAL, WARNING or CRITICAL.
6. **Match rules.** Pick the most specific rule using `extraChecks` (equipment status, filter state, bioload, filtration installed).
7. **Roll up** the overall condition.
8. **Reconcile alerts and recommendations** (§7).
9. **Record**: a sampled history row, plus the condition summary on the aquarium doc. Sampled rows include matched rule IDs and the effective threshold snapshot used at evaluation time.

**Invalid readings never produce a water-condition classification or water advice.** Each invalid sensor produces one `sensor_fault` recommendation: "Check the &lt;sensor&gt; probe connection or calibration."

## 3. Classification and rule matching

Each rule has a `condition` that compares the parameter with the aquarium's effective threshold or with a literal value:

| Condition | Meaning |
|---|---|
| `{ op: "gt", ref: "max" }` | value > maximum |
| `{ op: "gt", ref: "max", marginPct: 10 }` | value > maximum + 10 % of the maximum |
| `{ op: "lt", ref: "min", marginPct: 15 }` | value < minimum − 15 % of the minimum |
| `{ op: "eq", value: "Power Interruption" }` | status equals the literal |

`margin` (absolute, in the parameter's unit) can be used in place of `marginPct`. Operators: `gt`, `gte`, `lt`, `lte`, `eq`, `neq`.

**Classification ("what is the condition?")** is the highest severity among the enabled rules for that parameter whose `condition` matches. No match means NORMAL. Classification uses thresholds only.

**Recommendation ("what should the user consider?")** comes from the matching rules at that severity whose `extraChecks` also pass. The engine takes the one with the **lowest `priority` number** (ties broken by rule ID). Example: turbidity above the maximum is a WARNING either way, but the advice differs:

| Filter state | Rule | Advice |
|---|---|---|
| Inactive | `turbidity_warning_filter_off` (priority 10) | Turn the filter back on, then recheck |
| Active | `turbidity_warning_filter_on` (priority 20) | Rinse the filter media, remove uneaten food |
| Unknown | `turbidity_warning` (priority 30) | Remove debris and check the filter |

If a parameter is classified abnormal but no enabled rule's `extraChecks` pass, the engine reports the rule as **missing** (`missingRules`). The alert is raised without advice, rather than inventing one.

**Overall condition.** This is the highest severity among the **valid water parameters** and any **known** power, equipment or filter fault. Power or equipment that is `Unknown` or not reported is shown as **"Not monitored"** and never blocks NORMAL. A filter with no filtration system in the profile is "Not installed". If no water parameter can be assessed, the overall condition is UNAVAILABLE.

Power: when the device sends `mainsPresent` (new, additive), it decides `powerStatus`. `mainsPresent: false` while the device is still online is a **Power Interruption**, evaluated by the normal rule `power_interruption`.

**Only the sensed signal is evaluated.** The engine reads power from `mainsPresent` alone (`evaluatedPowerStatus`): `false` → Power Interruption, `true` → Online. Until a device sends `mainsPresent`, the `powerStatus` it reports itself is **informational**: it is stored and shown, but power is "Not monitored" and raises no alert, because the current firmware sends a placeholder (Aquarium 1 reports "Power Interruption" while online). So `power_offline` is not reached from telemetry today; a device that stops sending is covered by `device_offline` (heartbeat). Displays still use `derivePowerStatus` (`mainsPresent` first, then the reported value).

## 4. Data model (Firestore, camelCase)

| Collection | Contents | Who writes |
|---|---|---|
| `species/{speciesId}` | `name`, `ranges.{temperatureC,ph,tdsPpm,turbidity}.{min,max}`, `minWaterLevelPercent`, `bioloadBandsGPerL`, `cleaningIntervalDays`, `earlyCleaning`, plus the approval fields | Seed script / Admin SDK |
| `rules/{ruleId}` | `parameter`, `severity`, `condition`, `extraChecks[]`, `priority`, `title`, `action`, `basis`, `preCheck`, `enabled`, plus the approval fields | Seed script / Admin SDK |
| `recommendations/{id}` | `aquariumId`, `ownerId`, `alertId`, `ruleId`, `ruleStatus`, `ruleSource`, `parameter`, `severity`, `title`, `issueDetected`, `action`, `basis`, `preCheck`, `readingSnapshot`, `status` (pending, applied, resolved or dismissed), `createdAt`, `resolvedAt`, `resolvedBy`, `supersededBy?` | Functions create; the owner may set `status` to applied or dismissed |
| `alert_records/{id}` | The existing fields, unchanged (`alert_id`, `aquarium_id`, `device_id`, `type`, `message`, `severity`, `isRead`, `status`, `triggered_at`, `resolved_at`), **plus** `ruleId`, `recommendationId`, `parameter`, `dedupKey`, `occurrences`, `lastSeenAt`, `ownerId`, `notifyRequestedAt`, `notificationCount`, `escalatedAt?`, `resolvedBy?` | Functions; the owner may flip `isRead` |
| `maintenance_actions/{id}` | `aquariumId`, `recommendationId?`, `actionType` (e.g. `cleaning`), `actionStatus`, `performedBy`, `performedAt`, `notes` | Trusted writes only until the Sprint 4 logging UI |
| `aquariums/{id}` (new fields) | `condition` (summary), `cleaning` (schedule), `bioloadLevel`; admin-set `thresholdOverrides`, optional `speciesId` | Functions / admin |
| `aquariums/{id}/engine/state` | Dedup, cooldown and streak state, the last signature, cleaning state | Functions only (clients denied) |

Approval fields on every species and rule doc: `status` (draft or approved), `source` (a citation, or "TBD"), `approvedBy`, `approvedAt` (epoch ms).

**Threshold preview** in the Rules Editor comes from three layers. A layer only replaces the bounds it actually sets:
1. the species defaults;
2. the aquarium's existing profile limits (`minTemp`/`maxTemp`, `minPh`/`maxPh`, `minLevel`);
3. the admin-set `thresholdOverrides` map, which replaces layer 2 entirely when present.

The live engine currently uses only the approved species thresholds. Profile limits and `thresholdOverrides` have no status/source/approver metadata, so they remain preview-only until an approved aquarium-specific override contract is defined. This prevents an owner-edited or legacy value from silently becoming an authoritative scientific threshold.

`minQuality` (TDS purity %) has no ppm equivalent and is not used.

**Security (emulator-tested):**
- Users read recommendations, alerts and maintenance actions only for their own aquariums.
- A user may move a pending recommendation to applied or dismissed, stamping their own UID and the current time, and nothing else.
- Only the functions create or resolve recommendations and alerts.
- Clients cannot write `species`, `rules`, the engine state, or the engine-owned aquarium fields.

## 5. Condition summary and history

On the aquarium doc, the function writes `condition = { overall, perParameter[], matchedRules[], faults[], draft, signature, evaluatedAt, readingUpdatedAt }`.

The dashboard reads this summary instead of recomputing. It trusts it while it is younger than 6 minutes (one sampling interval plus the 60 s offline window); otherwise it evaluates in the browser with the same engine.

History stays sampled: one row every 5 minutes, plus an immediate row whenever any **per-parameter** classification (or the chosen rule) changes. That is the "signature". Each row carries `classification` and the `validity` summary.

## 6. Approving and swapping in final values

1. Fill in the sign-off table in `docs/rule-matrix.md` with the adviser.
2. Edit `scripts/seed/goldfish-draft.json` (rename the file if you like) for each approved item:
   - change the value if needed;
   - set `status: "approved"`, `source: "<citation>"`, `approvedBy: "<name>"`, `approvedAt: <epoch ms>`.
3. Regenerate the matrix: `node scripts/rule-matrix.mjs > docs/rule-matrix.md`.
4. Run `npm run test:rule-engine`. The boundary tests encode the draft numbers, so update them alongside the data.
5. Seed:
   - the emulator: `npm run seed:rules`;
   - the live project, at a scheduled time: `npm run seed:rules -- --project practice-smartaqua`. It asks you to type the project ID to confirm.
6. The function picks up the change within 5 minutes and the web app immediately.
7. The "Draft thresholds" badge disappears once the species and every enabled rule are `approved`.

To disable a rule, set `enabled: false`. Deleting a rule doc also works, but disabling keeps the audit trail.

**In the app (Sprint 4, after go-live).** The platform admin can do steps 2–6 in **Rules Editor**, without editing JSON or running a script:
- create and edit rules and species defaults, validated with the engine's own types (`validateRuleDraft` / `validateSpeciesDraft` in the shared core);
- **Preview** which rules a sample reading matches;
- **Approve**: it sets `approvedBy` and `approvedAt` and requires a cited `source`, not "TBD";
- **Export** a `docs/rule-matrix.md`-style file for the sign-off.

Any edit returns the item to `draft`. Every change goes through the `saveRuleConfig` / `approveRuleConfig` callables and is written to `audit_logs`. The engine picks changes up within its 5-minute cache. The seed JSON stays the source for a fresh project.

## 7. Alert lifecycle: dedup, cooldown, auto-resolve

Constants (shared core): `ALERT_COOLDOWN_MS = 15 min`, `AUTO_RESOLVE_NORMAL_COUNT = 3`, `ALERT_TOUCH_INTERVAL_MS = 5 min`.

| Situation | Behaviour |
|---|---|
| New abnormal parameter | Open one `alert_records` doc (`dedupKey = aquariumId:parameter`) and one pending recommendation linked both ways. Set `notifyRequestedAt`. |
| Same severity and same rule again | No new docs. `occurrences` +1 and `lastSeenAt` update **at most every 5 minutes** (write budget). So `occurrences` counts 5-minute periods in which the condition was seen. |
| Severity escalates | Update the same alert in place (`severity`, `ruleId`, `escalatedAt`, `notificationCount` +1, `notifyRequestedAt`) and create a new recommendation. The old pending one becomes `resolved` by `system` with `supersededBy`. |
| Severity drops, or the chosen rule changes | Update in place without re-notifying; supersede the recommendation if the rule changed |
| 3 consecutive NORMAL evaluations | Auto-resolve the alert (`status: resolved`, `resolved_at`, `resolvedBy: system`). Its recommendation becomes `resolved` by `system` **only if still pending**; one the user applied or dismissed is left alone. |
| Abnormal again within 15 minutes of an auto-resolve | Not reopened (cooldown) |
| Unknown (sensor missing or not monitored) | Leaves any open alert untouched: no bump, no streak |
| Sensor fault | Its own alert per sensor (`dedupKey = aquariumId:sensor_fault:<parameter>`), rule `sensor_fault`; resolves after 3 valid readings |
| Device silent > 60 s (`checkDeviceHeartbeat`, every minute) | One `device_offline` alert (`dedupKey = aquariumId:device`). It resolves on the first fresh check, or immediately when telemetry arrives. Aquariums that never reported are skipped. |

"Evaluations" are every telemetry write (every 15 s at the target interval), so recovery resolves in about 45 s. Push notifications (FCM) are not implemented yet: alerts carry `notifyRequestedAt` and `notificationCount` for a future sender.

## 8. Cost (Firestore writes)

The function writes only when something changes. Measured in the emulator (test RULES-09), per aquarium at a 15 s interval:

| Steady state | Writes/hour | Writes/day |
|---|---|---|
| All NORMAL | ~65 | ~1,560 |
| Two open alerts | ~86 | ~2,060 |

Each history sample costs 3 writes (flat row, nested row, day doc). Each sample also writes the condition summary and the engine state. Alert opens, escalations and resolves add a few writes each. Function invocations: 5,760 a day at 15 s, plus 1,440 heartbeat runs a day (project-wide), plus one daily cleaning check. Rule config reads are cached for 5 minutes per function instance.

## 9. Functions

| Function | Trigger | Purpose |
|---|---|---|
| `ingestDeviceTelemetry` | RTDB `onValueWritten` `/devices/{aquariumId}/telemetry` | Everything in §2 |
| `checkDeviceHeartbeat` | Schedule, every 1 minute | `device_offline` |
| `checkCleaningSchedule` | Schedule, daily 06:00 Asia/Manila | Next cleaning date, `cleaning_due` |
| `onMaintenanceActionLogged` | Firestore create `maintenance_actions/{id}` | New cleaning cycle; closes pending cleaning recommendations |

Tests:

| Suite | What it covers |
|---|---|
| `npm run test:rule-engine` | The engine, every draft rule, boundaries, the alert planner, bioload and cleaning |
| `npm run test:telemetry-ingest` | INGEST, RULES and CLEAN on the Firestore emulator |
| `npm run test:device-heartbeat` | HEARTBEAT, fake clock, Firestore + RTDB emulators |
| `npm run test:firestore-rules` | FS-30..36 |
