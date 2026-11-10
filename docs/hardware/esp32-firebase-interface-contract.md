# SmartAqua Pro ESP32–Firebase Interface Contract

Status: Phase 7A historical design baseline with current repository-firmware implementation notes; not deployed or physically verified.

This document defines the approved integration boundary for future physical ESP32 work. It preserves the current RTDB paths and application behavior. It does not authorize firmware changes, Firebase deployment, device-account creation, simulated telemetry, or physical equipment operation.

## 1. Governing scope

The accepted capstone outline is the current scope authority for hardware integration. The monitored areas are temperature, pH, turbidity, total dissolved solids (TDS), water level, filtration status, equipment status, and power status. Supported controls are feeder, filtration, and lighting. Ammonia is excluded from the accepted outline and remains a legacy compatibility conflict; it is not part of this contract.

The application remains rule-based. Sensor validation precedes NORMAL / WARNING / CRITICAL classification, predefined IF–THEN recommendations, alerts, history, and reports. This contract does not define or change numerical water-quality thresholds.

## 2. Historical Phase 7A firmware readiness assessment

Assessed source: `docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino`.

This table records the older source assessment and is not the readiness table for `firmware/Aquarium1Device` or `firmware/Aquarium2Device`. Those newer sketches add authenticated RTDB polling, telemetry, supported outputs, schedules, and command acknowledgements; their software compilation and contract checks do not replace physical verification.

| Area | Classification | Repository evidence and boundary |
|---|---|---|
| ESP32 boot/startup | IMPLEMENTED | `setup()` initializes serial, I2C/RTC, GPIO modes, ADC settings, and two DallasTemperature buses. Successful physical boot is NOT VERIFIED. |
| Pin definitions | IMPLEMENTED | RTC SDA 21/SCL 22; ultrasonic trigger 26/echo 27; pH 34; TDS 32; turbidity 35; temperature buses 18 and 19. Electrical suitability remains HARDWARE VERIFICATION REQUIRED. |
| Sensor interfaces | PARTIAL | RTC, ultrasonic, analog pH/TDS/turbidity, and two OneWire temperature interfaces exist. No power-sense input or equipment feedback input exists. |
| Sensor reading functions | PARTIAL | Distance, averaged voltage, temperature, and temperature-compensated TDS are read. pH and turbidity are reported only as raw/voltage values; water level percentage is not calculated. |
| Sensor validation | PARTIAL | Ultrasonic timeout and DallasTemperature disconnection checks exist. pH, TDS, turbidity, water-level geometry, calibration, plausible-range, and cross-sensor validation are incomplete. |
| Serial diagnostics | IMPLEMENTED | The loop prints RTC time, distance, raw/voltage values, two temperatures, TDS, and sensor error text. Physical serial output is NOT VERIFIED. |
| Wi-Fi connectivity | MISSING | No Wi-Fi library, credentials, initialization, or connection state machine exists. |
| Network reconnection | MISSING | No backoff, retry, network-state, or reconnect logic exists. |
| Firebase initialization | MISSING | No Firebase client or RTDB initialization exists. |
| Firebase Authentication | MISSING | No device identity, credential acquisition, token renewal, or sign-in exists. |
| RTDB communication | MISSING | Firmware performs no RTDB reads or writes. |
| Telemetry publishing | MISSING | Sensor results are serial-only and are not mapped to the RTDB telemetry contract. |
| Control reading | MISSING | `/devices/{aquariumId}/control` is not read. |
| Command reading | MISSING | `/devices/{aquariumId}/commands/latest` is not read. |
| Equipment outputs | MISSING | No relay/output pin definitions or safe output abstraction exists. |
| Feeder control | MISSING | No actuator driver, pulse semantics, safety interlock, or duplicate protection exists. |
| Filtration control | MISSING | No output driver or observed-state feedback exists. |
| Lighting control | MISSING | No output driver or observed-state feedback exists. |
| Power-status detection | MISSING | No mains/input/UPS status signal is read. Stale telemetry can only indicate device unavailability, not prove a power interruption. |
| Error handling | PARTIAL | Local sensor error text exists, but there is no structured fault state, network/Firebase error handling, or safe equipment failure behavior. |
| Device restart recovery | MISSING | No persisted command IDs, control revision, last-known safe state, or boot recovery procedure exists. |
| Timestamp handling | PARTIAL | A DS3231 RTC is read and may be initialized from compile time; the firmware does not produce authoritative Unix epoch milliseconds or synchronize with Firebase/server time. |
| Device identity | MISSING | No unique Firebase Auth UID, aquarium assignment, or device metadata exists. |

All sensor accuracy, relay polarity, output behavior, actuator motion, wiring, calibration, and restart behavior are HARDWARE VERIFICATION REQUIRED.

## 3. Secure device identity architecture

### 3.1 Identity and authorization invariants

Each physical ESP32 receives one unique Firebase Authentication UID. A device token must contain the trusted custom claim `principalType: "device"`. The authorization mirror grants that UID access only under its assigned aquarium:

```text
authorization/
  aquariums/
    {aquariumId}/
      ownerUid: "{humanUid}"
      state: "active" | "revoked" | "transitioning"
      deviceUids/
        {deviceUid}: true
```

The current RTDB rules require both an active aquarium and the exact `deviceUids/{auth.uid}` membership. A human token cannot become a device merely by writing client data, and clients cannot read or write the authorization mirror. Admin role does not grant live-device access.

The target demonstration mapping is one-to-one:

```text
User A -> Aquarium A -> ESP32 A / device UID A
User B -> Aquarium B -> ESP32 B / device UID B
```

Device UID A must not appear under Aquarium B, and device UID B must not appear under Aquarium A.

### 3.2 Provisioning lifecycle

The trusted provisioning capability is MISSING and must be implemented outside firmware before device integration:

1. Register a physical device in a protected backend device registry with a unique hardware/device identifier, lifecycle state, and assigned aquarium.
2. Create a unique Firebase Auth identity for that device through trusted infrastructure.
3. Set `principalType: "device"` through the Admin SDK. Never allow the device or a human client to set claims.
4. Complete one-time enrollment over a controlled channel. The enrollment secret must be unique, revocable, and unusable as an Admin credential.
5. Store only the device's own credential or refresh material in protected ESP32 storage. Use flash encryption, secure boot, and protected NVS where supported and approved.
6. Add the device UID to only the assigned aquarium's authorization projection after canonical assignment checks pass.
7. Verify the token claim and RTDB access with a negative cross-aquarium test before connecting actuators.
8. Renew short-lived ID tokens using the Firebase client flow. Authentication failure must leave outputs in their approved safe state and must not bypass rules.
9. Rotate credentials through the trusted provisioning service. Do not compile shared passwords, service-account keys, Firebase Admin credentials, or privileged private keys into firmware.

The final credential transport and Firebase ESP32 client library are NOT VERIFIED. They must support token refresh, TLS certificate validation, RTDB streaming/reconnect behavior, and the selected secure-storage approach.

### 3.3 Revocation, replacement, reassignment, and compromise

- Revocation: mark/remove the device assignment through the trusted backend, revoke its refresh tokens/credential, and confirm all RTDB reads/writes fail before disposal.
- Replacement: provision a new UID; do not reuse the removed device's credential. Activate the replacement only after the old UID is revoked.
- Reassignment: fail closed. Put the assignment into a transitioning/revoked state, remove the old aquarium mapping, revoke/refresh credentials as required, update the protected canonical device registry, then add only the new mapping and reactivate.
- Lost/compromised device: treat as a security incident; revoke tokens and mirror membership immediately, preserve audit evidence, rotate any related enrollment secret, and verify no other aquarium mapping contains the UID.

The current synchronization backend preserves existing `deviceUids` during a human ownership transfer and removes them when an aquarium is deleted. It does not provision devices or maintain a canonical Firestore device registry. That missing source of truth must be approved and implemented before real devices are enrolled.

## 4. RTDB interface compatibility

The following paths remain unchanged:

| Path | Human owner | Assigned device | Current consumer/status |
|---|---|---|---|
| `/devices/{aquariumId}/telemetry` | Read | Write | Web and mobile read; firmware write MISSING. |
| `/devices/{aquariumId}/control` | Read/write approved profile | Read | Web/mobile read and write; firmware read MISSING. |
| `/devices/{aquariumId}/commands/latest` | Read/write approved command | Read | Web/mobile write; web also subscribes; firmware read MISSING. |
| `/devices/{aquariumId}/history/{dateKey}` | Read | Denied | Date-specific web read exists. Device history publishing is intentionally MISSING. |

Parent `/devices`, `/devices/{aquariumId}`, and `/authorization` access remains denied. The web uses child listeners for telemetry, control, and `commands/latest`. Mobile uses telemetry and control listeners and writes `commands/latest`. These paths are compatible with the current draft rules.

History is not ready for the device. The current rules deny all device history writes because entry keys, timestamp authority, deduplication, immutability, retry behavior, and payload validation have not been approved. History must not be enabled merely to make a hardware demo pass.

## 5. Authoritative telemetry contract

Telemetry is one current device snapshot at `/devices/{aquariumId}/telemetry`. The device must replace the complete validated snapshot rather than partially leaving old sensor fields that appear current. `updatedAt` applies to the snapshot as a whole. If sensors are sampled at different times, a future per-reading timestamp extension requires separate approval.

| Field | Meaning/source | Type and unit | Requirement | Validation and client/history behavior |
|---|---|---|---|---|
| `temperatureC` | Validated water temperature selected from the approved temperature-sensor arrangement | finite number, °C | Required by current RTDB rules | Web requires it; mobile displays it when present. If unavailable, a transport representation must be approved together with `temperatureReadingValid: false`; this is unresolved because rules require a number. History currently expects this field. |
| `temperatureReadingValid` | Whether temperature passed connection, conversion, calibration, and plausibility checks | boolean | Optional in rules; required by this future contract | `false` means sensor/device fault and blocks water-quality classification. Web defaults a missing value to `true`, so firmware must publish it explicitly. |
| `waterLevelPercent` | Validated water level derived from ultrasonic distance and calibrated tank geometry | finite number, percent | Required by current RTDB rules | Must represent a calibrated percentage, not raw distance. Web clamps display to 0–100; rules currently validate only numeric type, so the device must validate before publishing. History expects this field. |
| `waterPresent` | Whether the sensing geometry indicates water is present and temperature/TDS interpretation is meaningful | boolean | Optional in rules; required by this future contract | `false` produces a sensor/environment fault path, not a water-quality severity. Web defaults a missing value to `true`, so publish explicitly. |
| `tdsPpm` | Validated, temperature-compensated TDS result | finite number, ppm | Optional | Web/mobile display when present. `tdsReadingValid` must accompany it. History may retain it after a history protocol is approved. |
| `tdsReadingValid` | Whether TDS input, compensation temperature, calibration, and conversion passed validation | boolean | Optional in rules; required whenever TDS is monitored | `false` means fault/unavailable and must suppress threshold classification. |
| `tdsPercent` | Existing derived display value | finite number, percent | Optional; legacy/derived | It is not the primary sensor measurement and must not replace `tdsPpm`. Derivation ownership is unresolved. Do not fabricate it in firmware. |
| `waterQualityPercent` | Legacy alias consumed by web/mobile normalizers | finite number, percent | Legacy optional | Preserve only for backward compatibility; do not add to new firmware unless a migration plan explicitly requires it. |
| `ph` | Validated pH derived from calibrated probe voltage | finite number, pH units | Optional in current rules; required when the pH sensor is integrated | Firmware currently reports voltage only. Calibration and conversion are HARDWARE VERIFICATION REQUIRED. Invalid pH must be omitted or represented through a future explicit validity field; current schema lacks `phReadingValid`. |
| `turbidity` | Validated turbidity measurement | finite number; authoritative unit unresolved | Optional in current rules; required when turbidity is integrated | Current firmware reports voltage and current UIs show no unit. A calibrated unit and validity field must be approved before this field is authoritative. Do not label voltage/raw ADC as turbidity. |
| `filterState` | Device-reported filtration state | `"Active"` or `"Inactive"` | Optional | Current schema does not distinguish commanded state from physically observed state. Until feedback hardware exists, describe it as output-command state, not verified flow. |
| `equipmentStatus` | Overall device/equipment diagnostic summary | `"Normal"`, `"Warning"`, `"Fault"`, or `"Unknown"` | Optional | `Normal` must not be used merely because no feedback exists. Use `Unknown` when observation is unavailable. Exact aggregation logic requires approval. |
| `powerStatus` | Device-reported power condition | `"Online"`, `"Offline"`, `"Power Interruption"`, or `"Unknown"` | Optional | `Power Interruption` requires a real monitored power/UPS input. Staleness alone indicates device offline/unavailable, not a proven mains interruption. |
| `updatedAt` | Time the complete snapshot was produced | finite number, Unix epoch milliseconds | Required | Prefer an RTDB server-resolved timestamp if supported by the selected ESP32 library; otherwise use network-synchronized UTC epoch milliseconds. RTC compile time is not sufficient. Excessive future skew must be rejected/faulted. Web/mobile use 30 seconds as the current stale boundary. |
| `online` | Device's connection/operational assertion at snapshot time | boolean | Required | It does not remain trustworthy after disconnection; clients must combine it with staleness. Sudden loss is detected only by stale `updatedAt` unless an approved server-side presence mechanism is added. |

### 5.1 Known compatibility issues

- Web telemetry normalization coerces `null` optional numeric fields with `Number(null)`, which can become zero. Firmware must omit unavailable optional numeric fields rather than sending `null` until the normalizer is corrected in a separately approved application change.
- Mobile numeric normalization accepts only actual finite numbers and safely ignores `null`; web and mobile therefore differ.
- Web treats any future `updatedAt` as live; mobile's age calculation also treats future values as live. Excessive future timestamps require a future client/device validation correction.
- Web requires temperature, water level, timestamp, and online fields; mobile types make all telemetry fields optional. The RTDB rules follow the stricter web shape.
- Firmware has two temperature sensors, while the transport has one `temperatureC`. The selected sensor, redundancy rule, or aggregation policy is NOT VERIFIED and must be approved through real calibration testing.
- Firmware produces `distanceCm`, raw pH/turbidity readings, and voltages; none directly match authoritative `waterLevelPercent`, `ph`, or calibrated `turbidity`.
- The mobile command union omits the web/rules `sync_control` command. No firmware behavior should depend on that command until client parity is reviewed.

### 5.2 Timestamp, staleness, duplicate, and history rules

- A snapshot older than the current 30-second client stale boundary is offline/stale and must not drive current classifications or equipment-state claims.
- Missing, non-numeric, NaN, malformed, or excessive future timestamps make the snapshot unavailable/faulted.
- Repeated identical sensor values are not automatically duplicates; a duplicate is the same sample identity/timestamp replayed. The future history protocol must deduplicate by a stable sample ID.
- RTDB telemetry is the live snapshot, not historical storage. History ingestion remains disabled until an immutable, idempotent, trusted pipeline is approved.
- No application or emulator sample may be presented as physical telemetry.

## 6. Sensor validation contract

Every sensor follows this order:

```text
raw acquisition
  -> interface/connection check
  -> type and finite-number check
  -> calibration/conversion
  -> physical plausibility and device-specific checks
  -> timestamp/sample-identity validation
  -> VALID or SENSOR/DEVICE FAULT
  -> only VALID values enter threshold evaluation
  -> NORMAL / WARNING / CRITICAL
  -> predefined IF–THEN recommendation
  -> alert/history/report
```

| Condition | Required handling |
|---|---|
| Missing or `null` | Mark the sensor unavailable/faulted; omit optional numeric transport fields. Do not coerce to zero. |
| NaN/infinity/malformed type | Reject before RTDB publication and log a structured sensor fault locally. |
| Impossible value | Mark invalid using the sensor's approved calibration/plausibility specification. No numerical bounds are defined by Phase 7A. |
| Sensor disconnection/timeout | Set the corresponding validity state false where one exists, report a device/sensor fault, and exclude from threshold evaluation. |
| Stale reading | Do not reuse as a fresh sample. Preserve last-known value only if clearly labelled historical/stale; current UI should show offline/unavailable. |
| Duplicate sample | Do not create another history entry or repeat rule/alert processing for the same sample identity. Live snapshot replacement is allowed. |
| Future timestamp | Reject or fault when beyond an approved clock-skew tolerance. The tolerance remains to be specified; never silently treat arbitrary future data as live. |
| Device disconnection | Clients infer loss from stale telemetry. Set UI to offline/unavailable; do not classify water quality from stale values. |

Current schema has explicit validity flags only for temperature and TDS plus `waterPresent`. pH, turbidity, water level, equipment feedback, and power sensing need an approved validity/fault representation before real integration. A generic diagnostic extension may be designed later, but Phase 7A does not change the schema.

## 7. Equipment control contract

Control profile is desired configuration. `commands/latest` is a human-requested event or immediate state request. Neither is proof of physical actuation.

### 7.1 Feeder

| Contract element | Required behavior |
|---|---|
| Requested command | `feed_now` with unique `commandId`, `requestedAt`, `requestedBy`, matching `aquariumId`, and positive `durationMs`. |
| Device interpretation | One eligible dispensing attempt for one previously unseen command ID after authentication, authorization, freshness, and safety checks. |
| Physical output | A bounded actuator pulse using approved driver circuitry. Pin, polarity, duration limits, and mechanical behavior are HARDWARE VERIFICATION REQUIRED. |
| Acknowledgement | Record received, accepted/rejected, action attempted, observed result if feedback exists, and completed/failed. |
| Observed state | Without a position/current/feed sensor, report action attempted—not food successfully dispensed. |
| Failure state | Reject/fail on stale/duplicate command, unsafe startup, invalid duration, unavailable actuator, or missing authorization; do not energize. |
| Retry/duplicate | Never actuate again for the same `commandId`, including after restart. Return the stored terminal acknowledgement. |
| Startup/reconnect | Start inactive. Never replay the retained `commands/latest` merely because the device rebooted or reconnected. |

### 7.2 Filtration

| Contract element | Required behavior |
|---|---|
| Requested command | `set_filter_state` with state `Active` or `Inactive`, or validated desired state from `/control`. |
| Device interpretation | Set an idempotent desired output state; repeated identical state is safe and does not toggle. |
| Physical output | Relay/driver output with approved isolation, voltage/current rating, polarity, and fail-safe behavior. HARDWARE VERIFICATION REQUIRED. |
| Acknowledgement | Distinguish output set from physically observed filtration. Flow/current feedback is required to claim observed operation. |
| Failure state | Report `Fault` or `Unknown` if output cannot be set or operation cannot be observed; do not claim `Active` as verified flow. |
| Startup/reconnect | Begin in an approved safe state, authenticate, read valid control, then reconcile desired state. Never infer from a stale command alone. |

### 7.3 Lighting

| Contract element | Required behavior |
|---|---|
| Requested command | `set_light_state` with state `On` or `Off`, or validated schedule/manual state from `/control`. |
| Device interpretation | Set an idempotent desired output state; never implement as an untracked toggle. |
| Physical output | Relay/driver output with approved isolation, voltage/current rating, polarity, and fail-safe behavior. HARDWARE VERIFICATION REQUIRED. |
| Acknowledgement | Report accepted output state and separate observed lamp state when feedback hardware exists. |
| Failure state | Report failed/unknown on output or feedback error. |
| Startup/reconnect | Use approved safe startup state, then reconcile current control revision and clock before applying a schedule. |

## 8. Command acknowledgement and idempotency design

The existing `commands/latest` last-write-wins request path remains. It can overwrite an unprocessed request, so commands are paired with the implemented acknowledgement path:

```text
/devices/{aquariumId}/commands/latest
/devices/{aquariumId}/commandAck/latest
```

Only the device principal bound to the active aquarium may write `commandAck/latest`. App acknowledgements must match the current command ID; optional type/state metadata must match the request. Scheduled acknowledgements use a validated `schedule-*` ID plus `source: schedule` and a supported type. The server timestamp is mandatory.

Acknowledgement record:

```text
commandId
status: done | failed
executedAt            // Firebase server timestamp
error?                // failed only, bounded to 200 characters
source?               // app | schedule
type?                  // required for schedules
state?                 // validated light/filter requested state
```

The UI must distinguish request submission from acknowledgement. `done` means the firmware completed its software/output sequence; it is not physical feedback. A missing acknowledgement becomes the neutral `no_response` log status after 30 seconds. The repository firmware implements this contract, but flashing and physical verification are still required.

Idempotency requirements:

1. Generate unique IDs using only the rules-approved 1–160 character set `[A-Za-z0-9_.:-]`; collision resistance remains the client responsibility.
2. Persist recently processed command IDs and terminal outcomes in nonvolatile device storage before or atomically with actuation where feasible.
3. On duplicate delivery, never repeat the physical action. Persisting and replaying terminal acknowledgements remains future hardening.
4. Validate command freshness against an approved maximum age. No maximum is invented here. Add an approved expiry contract before feeder testing.
5. On restart, read `commands/latest`, compare it with persisted state, and never execute an old or already processed feeder request.
6. A last-write-wins slot can still lose a command if writers replace it before receipt. The UI must wait for acknowledgement and report timeout/unknown, not claim completion. If testing proves loss unacceptable, a queued command architecture requires a separate approval.

Current limitation: app and schedule acknowledgement writes are attempted once and are not queued or replayed after a failed network write. App command IDs and terminal outcomes are not persisted across restarts. Schedules run only inside a successful cloud cycle and therefore do not execute offline. If a newer command replaces `commands/latest` before an older command's ack PUT, rules reject the older ack even if its output sequence already ran.

## 9. Power, disconnect, and reconnect design

- Startup: initialize serial and diagnostics first; keep actuator outputs in approved non-energized/fail-safe states; load device identity and processed-command state; validate clocks; connect Wi-Fi; authenticate; verify RTDB access; subscribe to control/command; then publish telemetry.
- Wi-Fi/Firebase loss: stop claiming fresh connectivity, retain safe equipment state according to the approved risk decision, use bounded exponential backoff with jitter, and avoid tight reconnect/write loops.
- Reconnect: refresh authentication as needed, verify the same aquarium assignment, reread the complete control profile, compare command ID with persistent idempotency state, and publish a fresh timestamp. Do not replay feeder commands.
- ESP32 restart: report a new boot/session identifier in a future diagnostic extension if approved. Do not assume the previous output state or pending command is safe.
- Stale telemetry: web and mobile currently treat telemetry older than 30 seconds as offline. This is a UI freshness rule, not proof of electrical power loss.
- Power interruption: the project UPS can keep the ESP32 online, but detecting loss of primary power requires a separately wired and electrically safe input or an approved UPS status signal. The present firmware has neither. Classification is HARDWARE VERIFICATION REQUIRED.
- Event history: power-event history needs a trusted, idempotent history pipeline and real power-sense transition. Do not fabricate an event from an application timer.
- Equipment after restart: feeder remains inactive and does not replay. Lighting and filtration use the approved safe startup state until authenticated control is obtained. Exact fail-on/fail-off behavior depends on relay wiring, livestock safety analysis, and hardware verification.

## 10. Ammonia conflict assessment

| Area | Classification | Finding |
|---|---|---|
| Accepted outline | CURRENTLY APPROVED | Does not list ammonia. Phase 7A therefore excludes it. |
| Older manuscript | CONFLICTING | Contains ammonia-related scope that conflicts with the later accepted outline/owner clarification. |
| Web/mobile `AGENTS.md` | CONFLICTING | Lists ammonia among monitored parameters. |
| ESP32 firmware | CURRENTLY APPROVED | No ammonia sensor or reading implementation exists. |
| Web types, normalizers, history, data-log helpers | LEGACY | Optional `ammoniaPpm` compatibility fields remain. |
| Mobile types/normalizer/dashboard/landing text | LEGACY and CONFLICTING | Optional field and visible UI references remain although the accepted outline excludes it. |
| RTDB rules and rule fixture | LEGACY | Optional numeric `ammoniaPpm` is accepted/tested for compatibility. |
| Alert/report types and icon mapping | LEGACY | Type-level references remain; no Phase 7A behavior change is authorized. |
| Firestore production data | UNKNOWN | No production inspection was authorized or performed. |

No ammonia field, rule, UI, test fixture, history field, or document was removed or modified in Phase 7A. A future compatibility migration must be separately approved and coordinated across rules, web, mobile, history, reports, tests, and any deployed device payloads.

## 11. Approval gates before firmware implementation

- Approve the physical wiring diagram, electrical levels, relay polarity, safe startup states, and output pins.
- Approve sensor calibration procedures and the single-temperature selection/redundancy rule.
- Approve water-level geometry conversion and turbidity unit.
- Add explicit validity/fault representation for pH, turbidity, water level, power, and equipment feedback, or approve an equivalent diagnostic contract.
- Choose and validate an ESP32 Firebase client that supports TLS, Auth refresh, RTDB streaming, and the selected timestamp mechanism.
- Implement and emulator-test trusted device provisioning, device registry, claim issuance, revocation, and reassignment.
- Approve and rules-test the acknowledgement path, monotonic status validation, command expiry, and collision-resistant IDs.
- Approve the history ingestion protocol before enabling device history writes.
- Resolve the web `null` numeric coercion and future-timestamp behavior through a separately approved application change.
- Complete all checklist gates in `two-aquarium-integration-checklists.md` before energizing real equipment.
