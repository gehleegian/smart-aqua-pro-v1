# SmartAqua Pro: Device Data Contract

## Aquarium 1 TDS comparison update (2026-11-08)

The prepared Aquarium 1 firmware now sends `tdsPpm` with `tdsReadingValid=true`
only for finite inputs within its meter-compared voltage span. Reference pairs
corrected by the owner: 0.169 V / 80 ppm and 1.304 V / 314 ppm, both at normal
temperature. The separate cold sample (0.142 V / 60 ppm) is not merged into the
normal-temperature curve without measured sample temperatures. Values are an
empirical two-point linear estimate; sample temperatures were not recorded,
so no temperature compensation or accuracy claim is made. No TDS-to-purity
percentage is generated. Outside the checked input span, `tdsPpm` is omitted
and `tdsReadingValid=false`. The existing schema and access rules already allow
these fields; neither needs changing. Aquarium 2's comparison remains disabled.
Earlier live-payload examples below describe the prior uncalibrated firmware.

## Partial sensor-fault update (2026-11-08)

`temperatureC` is no longer mandatory when `temperatureReadingValid=false`;
it must be omitted in that case. A missing flag still requires a numeric value
for legacy compatibility. A connected device continues to publish other current
sensor readings and a fresh server `updatedAt`, rather than going offline because
one sensor failed. The two-probe mean is published only when both probes work.
RTDB read/write authorization is unchanged; the updated validation must be
deployed before firmware uses this additive fault-reporting contract.

This file is the single source of truth for the data the ESP32, the web and mobile apps, and the Cloud Functions exchange through Firebase.

- **Status:** v1 (Sprint 1, 2026-11-06). Based on a read-only check of the live `practice-smartaqua` project on 2026-11-06, plus decisions 2–5 from the Sprint 1 brief.
- **Code that implements it:**
  - `src/types/device.ts`: TypeScript types.
  - `src/utils/monitoringAssessmentCore.ts`: validation, freshness and command-status rules. Copies of this file live in `functions/src/shared/` and in the mobile repo.
  - `database.rules.json`: what the database accepts.

**Field status labels:**
- **current**: the live firmware sends or reads it today.
- **new (additive)**: added in Sprint 1. It is optional, so the live firmware keeps working without it.
- **allowed, unused**: the rules accept it, but nothing sends it.

---

## 1. Realtime Database layout

```
/
├── authorization/                         server-maintained access index (no client read/write)
│   ├── users/{uid}                        role, emailVerificationRequired
│   └── aquariums/{aquariumId}             ownerUid, orgId, caretakerUids/{uid}: true, state, deviceUids/{deviceUid}: true, claimOperationId (live only)
├── deviceBindings/{deviceUid}: aquariumId readable only by that device; written by claimDevice / migrate-orgs
└── devices/{aquariumId}                   keyed by the Firestore aquarium ID (not by device)
    ├── telemetry                          device writes · owner + assigned caretakers read
    ├── control                            owner writes · owner + caretakers + device read
    ├── commands/latest                    owner + assigned caretakers write · they + device read (single slot, overwritten)
    ├── commandAck/latest                  device writes · owner + caretakers + device read
    └── history/{YYYY-MM-DD}/{HH-mm-ss}    legacy, read-only (nothing writes here under current rules)
```

**Decision 1: RTDB stays keyed by aquarium.** Data lives under `devices/{aquariumId}/…`, and the device is bound to an aquarium through `authorization/aquariums/{id}/deviceUids/{deviceUid} = true`.

**Device identity:**
- A device's Firebase Auth UID is `esp32-<deviceId>` (e.g. `esp32-SAQ-7K3M-9R2X`) with the custom claims `principalType: "device"` and (Sprint 3 provisioning) `deviceId`.
- New devices are created by `scripts/provision-device.ts` with an email/password login. The firmware signs in and refreshes its token; see `docs/firmware-changes.md` §10. How the live device signs in today is unconfirmed (see §8).
- At boot the firmware reads `deviceBindings/{its uid}` to learn its `aquariumId`, so it doesn't have to be re-flashed per aquarium.
- **Sprint 3:** a device joins an aquarium when an Owner claims it with the QR label (`smartaqua://claim?d=<deviceId>&c=<code>`); see `docs/access-model.md`. Platform admins and caretakers may read device data (caretakers: assigned tanks only). The device rules themselves are unchanged.

---

## 2. `devices/{aquariumId}/telemetry`

The device writes the whole node in one `set`. Any field not in this table is rejected by the rules (`$other: false`).

| Field | Type | Unit / format | Required | Status | Meaning |
|---|---|---|---|---|---|
| `updatedAt` | number | epoch **ms** | yes | current → **changes** | Time of the reading. **New firmware writes the RTDB server timestamp `{".sv":"timestamp"}`.** Legacy firmware writes its own clock. |
| `online` | boolean | | yes | current | The device reports itself online. |
| `temperatureC` | number | °C (DS18B20, 1/16 °C steps) | yes | current | Water temperature. |
| `temperatureReadingValid` | boolean | | no | current | Temperature probe read OK. |
| `waterLevelPercent` | number | % 0–100 | yes | current | Water level. |
| `waterPresent` | boolean | | no | current | Water detected at the probe. A 0 % level is trusted only when this is `false`. |
| `ph` | number | pH 0–14 | no | current | pH. |
| `phReadingValid` | boolean | | no | **new (additive)** | pH probe read OK. |
| `tdsPpm` | number | ppm | no | current (not sent by Aquarium 1) | Total dissolved solids. |
| `tdsPercent` | number | % 0–100 | no | current | Project-specific TDS-to-purity conversion. |
| `tdsReadingValid` | boolean | | no | current (Aquarium 1 sends `false`) | TDS probe read OK. |
| `turbidity` | number | NTU | no | allowed, unused | Turbidity. |
| `turbidityReadingValid` | boolean | | no | **new (additive)** | Turbidity probe read OK. |
| `filterState` | `"Active"` \| `"Inactive"` | | no | current | Filter relay state. |
| `equipmentStatus` | `Normal` \| `Warning` \| `Fault` \| `Unknown` | | no | current (always `Unknown`) | Equipment health. |
| `powerStatus` | `Online` \| `Offline` \| `Power Interruption` \| `Unknown` | | no | current (always `Unknown`) | Mains power state. Overridden by `mainsPresent` when that is sent. |
| `mainsPresent` | boolean | | no | **new (additive, Sprint 2)** | A separate 5 V adapter on mains, read through a voltage divider into a GPIO. `false` while the device is online (ESP32 on a power bank/UPS) = `Power Interruption`; `true` = `Online`. Absent: `powerStatus` is used as before. |
| `waterQualityPercent` | number | | no | allowed, legacy | Older name for `tdsPercent`. |
| `ammoniaPpm` | number | ppm | no | allowed, out of scope | There is no ammonia sensor in the prototype. |

**Live example (Aquarium 1, 2026-11-06 23:21 PHT):**

```json
{ "equipmentStatus": "Unknown", "filterState": "Inactive", "online": true, "ph": 8.116076,
  "powerStatus": "Unknown", "tdsReadingValid": false, "temperatureC": 26.5,
  "temperatureReadingValid": true, "updatedAt": 1793978486622, "waterLevelPercent": 15.72354,
  "waterPresent": true }
```

**Observed send interval:** about 7.4 s (28 consecutive writes, 7.2–7.8 s apart, measured on 2026-11-06).

### 2.1 Freshness (decision 2)

- **Target interval:** the device sends every **15 s**.
- **Stale window:** `TELEMETRY_STALE_MS = 60_000`, which is 3 missed sends. It is a single constant in `monitoringAssessmentCore.ts`.
- **Offline:** telemetry older than 60 s, or `online: false`.
- **Unavailable:** `updatedAt` missing, before 2000-01-01, or in the future (after correcting with `.info/serverTimeOffset`).

### 2.2 Validity (decision 4, AGENTS.md §5)

Each sensor is evaluated separately by `evaluateTelemetryValidity()`, and gets one of three results:

| Result | When | Effect |
|---|---|---|
| **valid** | Flag OK and value plausible | Goes to threshold evaluation (NORMAL / WARNING / CRITICAL) |
| **invalid** | `<sensor>ReadingValid === false`; or a malformed value; or a sensor-fault value (below); or, once flags are required, a missing flag | **Sensor error.** Never treated as a water condition. No alert, no recommendation. The UI shows "Sensor error". |
| **missing** | The field isn't sent (sensor not installed) | The UI shows "--". Not counted as a fault. |

**Sensor-fault values** (from `getSensorFault()`). These are sensor defaults or physically impossible values, not water thresholds:

| Sensor | Fault values |
|---|---|
| pH | `0`, or outside 0–14 |
| Temperature | `0`, `85` (DS18B20 power-on value), `-127` (DallasTemperature `DEVICE_DISCONNECTED_C`) |
| TDS | `0` ppm (probe dry or disconnected); a bare `0 %` with no ppm reading |
| Water level | outside 0–100; `0 %` unless `waterPresent === false` |
| Turbidity | negative |

**Switchover flag: `REQUIRE_SENSOR_VALIDITY_FLAGS`** (currently `false`).
- Decision 4 says a missing flag is a fault.
- The live firmware does not send `phReadingValid` yet, so enforcing that today would show Aquarium 1's pH as "Sensor error".
- While the flag is `false`, a missing flag falls back to the value checks above. An explicit `false` flag is always a fault.
- Flip it to `true` (one line, then sync the copies) as a step of the firmware switchover (`docs/migration-live.md`).

---

## 3. `devices/{aquariumId}/control`: web writes, device reads

| Field | Type | Format | Required | Status |
|---|---|---|---|---|
| `mode` | string | `"manual"` \| `"automation"` | yes | current |
| `automationEnabled` | boolean | | yes | current |
| `feedingTimes` | string[] | `"HH:mm"` (24 h) | yes | current |
| `filtrationStartTime` | string | `"HH:mm"` | yes | current |
| `filtrationRuntimeHours` | number | 1–24 | yes | current |
| `manualLightState` | string | `"On"` \| `"Off"` | yes | current |
| `manualFilterState` | string | `"Active"` \| `"Inactive"` | yes | current |
| `lightOnTime` / `lightOffTime` | string | `"HH:mm"` | no | **new (additive)**. The web now sends these; it is unknown whether the firmware reads them. |
| `updatedAt` | number | epoch ms (client clock) | yes | current |

---

## 4. Commands and acknowledgement (decision 5)

### 4.1 `devices/{aquariumId}/commands/latest`: web writes (owner or assigned caretaker)

| Field | Type | Notes | Status |
|---|---|---|---|
| `aquariumId` | string | must equal the path ID | current |
| `commandId` | string | `{type}-{requestedAt}` | current |
| `type` | string | `feed_now` \| `set_filter_state` \| `set_light_state` \| `sync_control` | current |
| `requestedAt` | number | epoch ms (client clock) | current |
| `requestedBy` | string | must equal the sender's UID | current |
| `durationMs` | number > 0 | `feed_now` only | current |
| `state` | string | `Active`/`Inactive` for filter, `On`/`Off` for light | current |

### 4.2 `devices/{aquariumId}/commandAck/latest`: device writes (new)

| Field | Type | Notes |
|---|---|---|
| `commandId` | string | **Must equal `commands/latest/commandId`**, or the rules reject the write |
| `status` | `"done"` \| `"failed"` | |
| `executedAt` | number | **Must be the server timestamp** `{".sv":"timestamp"}` (rule: `== now`) |
| `error` | string ≤ 200 chars | optional, normally sent with `failed` |
| `source` | `"app"` \| `"schedule"` | **new in Sprint 4, additive, optional.** Absent or `"app"` = an ack for `commands/latest` |
| `type` | `"feed_now"` \| `"set_filter_state"` \| `"set_light_state"` | **new, required when `source` is `"schedule"`** |
| `state` | `"Active"` \| `"Inactive"` \| `"On"` \| `"Off"` | new, optional (light/filter) |

**Scheduled actions (Sprint 4, FR18/FR19).** When the device runs a schedule entry on its own (§3 `control`), it acks it too, so it appears in the command log:
- `source: "schedule"`, a `type`, and a `commandId` that starts with `schedule-` (for example `schedule-feed_now-<epoch seconds>`).
- The rules accept a `schedule-*` id without a matching `commands/latest`. Every other ack must still match `commands/latest/commandId`.
- Old firmware that never sends `source` is unaffected.

**Who can write:**
- Only a principal with `principalType: device` that is listed in `deviceUids` for this aquarium, and only while the aquarium is `active`.
- Humans, other devices and admins cannot write here.
- Acks live on a separate path, so a new web command can never overwrite an ack, and the device can never write into `commands/`.

**What the UI shows** (`getCommandStatus()`, `COMMAND_ACK_TIMEOUT_MS = 30_000`):
- **Pending** ("Waiting for device"): sent, no matching ack yet.
- **Done** or **Failed**: a matching ack arrived.
- **No response**: no matching ack 30 s after `requestedAt`. Shown in neutral grey with an explanation, not as an error: the live firmware does not ack yet.

**Command log (Sprint 4).** Cloud Functions copy every `commands/latest` write and every ack into Firestore `command_logs/{aquariumId}_{commandId}`: type, state, requestedBy (uid and name), requestedAt, `status` `pending → done | failed | no_response`, executedAt, error, `source`. A scheduled check marks `no_response` after 30 s; a late ack still turns it into `done` (with `lateAck: true`). Only functions write the log; the tank's members read it.

---

## 5. History

### 5.1 Firestore `sensor_readings`, written by the Cloud Function (decision 6)

**Trigger:** `ingestDeviceTelemetry`, an RTDB `onValueWritten` on `devices/{aquariumId}/telemetry`. Clients and devices never write history; the Firestore rules deny it.

**Sampling:**
- At most one row every 5 min per aquarium (`HISTORY_SAMPLE_INTERVAL_MS`).
- A change in any per-parameter classification (or in the rule chosen) writes immediately.
- The first reading of each local day is always written.

**Rejected (not written):**
- malformed payloads
- `updatedAt` before 2000 or more than 5 min in the future
- out-of-order readings
- unknown aquariums

**Where each row goes:**
- `sensor_readings/{aquariumId}_{dateKey}_{recordedAtEpoch}` (flat collection; the web history page reads this)
- `aquariums/{aquariumId}/sensor_readings/{dateKey}/readings/{HH-mm-ss}` (nested copy)
- `aquariums/{aquariumId}/sensor_readings/{dateKey}` (day doc / sampler state)

| Field | Type | Status | Notes |
|---|---|---|---|
| `aquariumId`, `ownerId`, `ownerName` | string | current | |
| `deviceUid` | string | new | from the aquarium profile |
| `source` | string | current | `"device"` for function rows (older rows: `"sync"`) |
| `dateKey` | string | current | `YYYY-MM-DD`, Asia/Manila |
| `recordedAt` | string | current | `YYYY-MM-DDTHH:mm:ss`, Asia/Manila, **no offset** |
| `recordedAtEpoch` | number | current | epoch ms (= telemetry `updatedAt`) |
| `ingestedAtEpoch` | number | current | epoch ms, function clock |
| telemetry fields | | current/new | the fields from §2 that were present |
| `sampleReason` | string | new | `first_of_day` \| `interval` \| `classification_change` |
| `classification` | string | new (Sprint 2) | overall `normal` \| `warning` \| `critical` \| `unavailable` from the rule engine |
| `validity` | map | new | `{ allValid, temperature, ph, tds, turbidity, waterLevel: "valid"\|"invalid"\|"missing", invalidReasons? }` |
| `reading_id` | string | current | equals the doc ID |

**Day doc fields:**
- `aquariumId`, `ownerId`, `ownerName`, `dateKey`, `lastRecordedAtEpoch`, `updatedAtEpoch` (current)
- `lastClassification`, `lastSignature`, `lastRuleVersion` (new; sampler state; `lastRuleVersion` is `rules:draft` or `rules:approved`)

**Production index:** the history query (`aquariumId ==`, `dateKey ==`, order by `recordedAtEpoch`) needs the composite index in `firestore.indexes.json`.

Classification, alerts, recommendations and the aquarium `condition` summary are written by the same function since Sprint 2: see `docs/rule-engine.md`.

### 5.2 RTDB `devices/{aquariumId}/history/{YYYY-MM-DD}/{HH-mm-ss}` (legacy, read-only)

Only Boyto has entries (2026-05-16 to 2026-06-03). Each entry has `recordedAt` (local string, no offset), `recordedAtEpoch` (ms) and the telemetry fields. The web falls back to it when Firestore has no rows for a date.

---

## 6. Timestamp formats

| Where | Field | Format | Clock |
|---|---|---|---|
| RTDB telemetry | `updatedAt` | epoch ms | **server** (new firmware); device (legacy) |
| RTDB commandAck | `executedAt` | epoch ms | server (enforced) |
| RTDB control / commands | `updatedAt`, `requestedAt` | epoch ms | browser |
| Firestore `sensor_readings` | `recordedAtEpoch` / `ingestedAtEpoch` | epoch ms | device or server / function |
| Firestore `sensor_readings` | `recordedAt`, `dateKey`, time keys | local Asia/Manila strings, no offset | derived |
| Firestore `alert_records`, `monitoring_reports` | `triggered_at`, `resolved_at`, `generated_at` … | Firestore `Timestamp` (UTC) | legacy snake_case, not migrated |
| Firestore `aquariums` | `createdAt`, `updatedAt` | ISO string with `Z` | browser |

**Rule for anything new:** epoch ms numbers, camelCase field names (decision 7).

---

## 7. Test data to clean up (do **not** delete yet)

These are in the live project. They are listed so they can be removed in a reviewed, separate step. Nothing in this sprint deletes them.

| Where | What | How to find |
|---|---|---|
| Firestore `sensor_readings` (flat) and `aquariums/{Boyto}/sensor_readings/*/readings` | May 2026 rows with `temperatureC: 0`, `ph: 0`, `waterLevelPercent: 0`, `tdsPercent: 0` | `where('dateKey', '>=', '2026-05-16')`, `where('dateKey', '<=', '2026-05-29')`, then filter `temperatureC == 0 \|\| ph == 0` |
| Same collections | A row with `recordedAtEpoch: 853755456` but `recordedAt: "2026-05-16T22:23:36"` | `where('recordedAtEpoch', '<', 946684800000)`. As seconds this decodes to 1997-01-20. As milliseconds it equals about 9.9 days, which suggests the ESP32 sent `millis()` (time since boot) instead of wall-clock time. |
| RTDB `devices/{Boyto}/telemetry` | Stale since 2026-06-03, `ph: 0` | One node |
| Firestore `alert_records` | 90 legacy "No Live Data" warnings (snake_case) | Whole collection, newest 2026-06-03 |

The UI and the ingest function already treat these values as sensor faults (zeros) or out of range (the epoch), so leaving them in place doesn't raise alerts.

---

## 8. Open items

- **Device token:** how the custom token for `esp32-SAQ-…` is minted, and where it is stored on the device. Ask Gian. It must never be committed.
- **Provisioning:** done for new devices in Sprint 3 (`scripts/provision-device.ts` plus the `claimDevice` callable, which write `deviceUids` and `deviceBindings`). The script that originally wrote `claimOperationId` for the live device is still not in the repo; `scripts/migrate-orgs.ts` registers that device as already claimed.
- **TDS:** Aquarium 1 sends `tdsReadingValid: false` and no `tdsPpm`, so TDS is never assessed.
- **Not sent yet:** turbidity, `mainsPresent`, plus real `powerStatus` and `equipmentStatus` values. Until then the app shows power and equipment as "Not monitored" (they no longer block a NORMAL condition).
