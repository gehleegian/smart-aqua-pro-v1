# SmartAqua Pro Two-Aquarium Hardware Integration Plan and Checklists

Status: Phase 7A planning artifact. No item marked incomplete may be treated as physically verified. This document does not authorize staging or production deployment.

## 1. Demonstration topology

| Human account | Aquarium | Physical controller | Required authorization |
|---|---|---|---|
| User A | Aquarium A | ESP32 A / Device UID A | User A owns Aquarium A; only Device UID A is mapped under Aquarium A. |
| User B | Aquarium B | ESP32 B / Device UID B | User B owns Aquarium B; only Device UID B is mapped under Aquarium B. |
| Admin | Directory only | None | Can list users and their aquarium directory entries; cannot read live RTDB data or control equipment. |

One human user may own multiple aquariums in the general system. The accepted two-tank demonstration uses distinct users and devices so cross-user and cross-device isolation can be observed directly.

## 2. Two-aquarium validation plan

Execute in an isolated, explicitly approved non-production environment only after Phase 7A gates are accepted.

| Test | Expected result | Current status |
|---|---|---|
| User A signs in and opens Aquarium A | Can read Aquarium A telemetry/control and submit valid commands | Emulator authorization tested; real client/device NOT VERIFIED |
| User B signs in and opens Aquarium B | Can read Aquarium B telemetry/control and submit valid commands | Emulator authorization tested; real client/device NOT VERIFIED |
| User A requests Aquarium B paths | Denied | Emulator tested; physical end-to-end NOT VERIFIED |
| User B requests Aquarium A paths | Denied | Emulator tested; physical end-to-end NOT VERIFIED |
| ESP32 A writes Aquarium A telemetry | Allowed only with Device UID A claim/mapping | Rules tested with fixture token; real identity MISSING |
| ESP32 A accesses Aquarium B | Denied | Emulator tested with fixture token; real device NOT VERIFIED |
| ESP32 B accesses Aquarium A | Denied | Emulator tested with fixture token; real device NOT VERIFIED |
| Admin accesses live device paths | Denied | Emulator tested; real Admin session/device integration NOT VERIFIED |
| Device reads its aquarium control/latest command | Allowed | Rules tested; firmware implementation MISSING |
| Device writes command request or authorization | Denied | Emulator tested |
| Device writes history | Denied until protocol approval | Emulator tested; future history design MISSING |
| User/device assignment revoked | Further protected access denied | Emulator tested; real token timing/reconnect NOT VERIFIED |
| Device replaced or reassigned | Old UID denied before new mapping is active | Design only; trusted provisioning/reassignment MISSING |
| Wi-Fi/Firebase interruption and recovery | No cross-aquarium access, no feeder replay, fresh state restored | Design only; HARDWARE VERIFICATION REQUIRED |
| Simultaneous telemetry/control for both tanks | Each session receives only its aquarium and commands do not cross | NOT VERIFIED; requires two devices/two sessions |
| Long-duration two-device operation | Stable reconnect, bounded writes/listeners, no duplicate actuation | NOT VERIFIED; requires an approved soak-test duration and real hardware |

## 3. Hardware readiness checklist

### 3.1 Before power is applied

- [ ] ESP32 board model and pinout are recorded for each tank.
- [ ] Firmware pin assignments are checked against the actual board: RTC SDA 21/SCL 22, ultrasonic trigger 26/echo 27, pH 34, TDS 32, turbidity 35, temperature buses 18 and 19.
- [ ] No pin conflict exists with boot-strapping pins, flash, serial, or the chosen Firebase/Wi-Fi library.
- [ ] Sensor output voltages are compatible with ESP32 input limits; voltage dividers and grounding are reviewed.
- [ ] Power-supply voltage/current capacity is calculated for ESP32, sensors, relays, feeder, filtration switching, lighting switching, and transient loads.
- [ ] Common ground is verified where electrically appropriate.
- [ ] Isolation is used where mains or higher-voltage equipment requires it.
- [ ] Relay input logic level and active-high/active-low polarity are documented.
- [ ] Relay contact voltage/current ratings exceed the controlled load requirements with appropriate margin and protection.
- [ ] Flyback/surge protection is present for inductive DC loads where required.
- [ ] Output pins for feeder, filtration, and lighting are selected and documented; none currently exist in firmware.
- [ ] Safe startup state for every output is documented before firmware assigns pin mode.
- [ ] Feeder driver, motor/servo supply, travel limit, and jam behavior are reviewed.
- [ ] Filtration switching and the consequence of fail-off/fail-on are reviewed for fish safety.
- [ ] Lighting switching and startup state are reviewed.
- [ ] Primary-power/UPS status input is identified if power-interruption reporting is required.
- [ ] UPS runtime and charge behavior are tested independently; an always-on ESP32 alone does not prove mains-loss detection.
- [ ] Water-safe sensor placement, drip loops, insulation, enclosure, strain relief, and connector sealing are reviewed.
- [ ] Wet and dry circuits are physically separated.
- [ ] All connectors are labelled by tank and secured against accidental cross-connection.
- [ ] A safe method exists to disconnect each load during software tests.
- [ ] USB/serial access remains available without exposing unsafe wiring.
- [ ] Emergency power removal is accessible.

### 3.2 Board and sensor bring-up

- [ ] ESP32 A powers, boots repeatedly, and does not overheat.
- [ ] ESP32 B powers, boots repeatedly, and does not overheat.
- [ ] Serial diagnostics are readable at the configured 115200 baud.
- [ ] RTC presence, retained time, and loss-of-power behavior are observed on both boards.
- [ ] Each temperature sensor is identified, calibrated, and tested for disconnection.
- [ ] The rule for selecting/combining the two firmware temperature readings is approved.
- [ ] Ultrasonic mounting and empty/full reference distances are measured for each tank.
- [ ] The water-level percentage conversion is calibrated for each physical tank.
- [ ] pH probe conditioning, calibration solutions, isolation, and conversion formula are approved and recorded.
- [ ] TDS calibration and temperature compensation are verified using real reference measurements.
- [ ] Turbidity calibration and authoritative unit are approved; raw voltage is not presented as a calibrated reading.
- [ ] Sensor noise, sampling interval, warm-up time, and fault cases are recorded without inventing application thresholds.
- [ ] No ammonia sensor is installed or represented as part of the accepted Phase 7A scope.

### 3.3 Equipment bring-up

- [ ] Lighting is first tested with the real load disconnected or replaced by a safe indicator/test load.
- [ ] Filtration output is first tested with the real load disconnected or replaced by a safe indicator/test load.
- [ ] Feeder is tested last, empty, with a bounded actuation and emergency stop available.
- [ ] Relay polarity matches the firmware's safe-state definition through boot/reset/brownout.
- [ ] Commanded output state is distinguished from physically observed equipment state.
- [ ] Any flow, current, position, or lamp feedback sensor is documented and calibrated.
- [ ] A duplicate feeder command cannot cause a second physical feed.
- [ ] A reset/reconnect cannot replay the retained feeder command.

## 4. Software integration checklist and order

Proceed one gate at a time. Stop and record evidence when a gate fails.

1. [ ] Freeze and review the accepted firmware/interface contract and wiring diagram.
2. [ ] Verify ESP32 boot with all equipment outputs disconnected.
3. [ ] Verify serial diagnostics and structured sensor-fault output.
4. [ ] Verify Wi-Fi connection and bounded reconnect/backoff without Firebase.
5. [ ] Provision a unique non-production Device UID through the trusted service.
6. [ ] Verify `principalType: "device"` without exposing Admin credentials.
7. [ ] Map the Device UID to exactly one aquarium and verify the mirror state is active.
8. [ ] Authenticate the ESP32 and verify token renewal.
9. [ ] Verify authorized RTDB access and negative access to the other aquarium.
10. [ ] Connect one sensor only.
11. [ ] Validate and publish one real reading to `/devices/{aquariumId}/telemetry`.
12. [ ] Confirm the RTDB snapshot has the approved types, units, validity flags, and timestamp.
13. [ ] Confirm the assigned web User sees the reading and the other User/Admin does not.
14. [ ] Confirm the assigned mobile User sees the same reading and the other User/Admin does not.
15. [ ] Repeat steps 10–14 for temperature, water level, TDS, pH, and turbidity, one sensor at a time.
16. [ ] Verify filtration/equipment/power status semantics; do not claim observed operation without feedback.
17. [ ] Verify stale, disconnected, malformed, and future-timestamp cases become unavailable/faulted rather than water-quality warnings.
18. [ ] Read and validate the complete control profile.
19. [ ] Implement and emulator-test command status/acknowledgement rules before any actuator.
20. [ ] Test lighting request, acknowledgement, output, feedback if present, and duplicate handling.
21. [ ] Test filtration request, acknowledgement, output, feedback if present, and duplicate handling.
22. [ ] Test feeder last with no food, an approved expiry, persistent idempotency, and a single bounded action.
23. [ ] Verify acknowledgement states distinguish requested, received, accepted/rejected, attempted, observed, and completed/failed.
24. [ ] Approve and test the history ingestion protocol; verify a real reading is stored once and remains aquarium-isolated.
25. [ ] Disconnect/reconnect Wi-Fi and Firebase separately; verify no output glitch or feeder replay.
26. [ ] Restart the ESP32; verify safe startup, token renewal, current control reconciliation, and no command replay.
27. [ ] Remove primary input while the UPS remains active; verify power interruption only if a real power-sense input exists.
28. [ ] Repeat the complete process for ESP32 B and Aquarium B.
29. [ ] Execute all cross-device and cross-user denial tests.
30. [ ] Run an approved two-user/two-aquarium soak test and record duration, disconnects, retries, bandwidth, memory, duplicate commands, and failures.

## 5. Evidence record for each completed check

For every checked item, retain:

- date/time and tester;
- board/device UID and aquarium ID (never record secrets);
- firmware commit/hash and wiring-diagram revision;
- Firebase non-production project ID and rules/functions revision;
- sensor/equipment model and calibration reference;
- serial log or screenshot where useful;
- exact expected and observed result;
- failure/retest notes;
- explicit statement whether evidence is emulator, software, bench hardware, wet test, or long-duration test.

## 6. Remaining blockers before real hardware integration

- MISSING: trusted device registry, provisioning endpoint/tool, custom-claim issuance, credential rotation, and reassignment workflow.
- MISSING: Wi-Fi, Firebase Auth, RTDB client, reconnect, and secure credential storage in firmware.
- MISSING: authoritative conversions for pH, turbidity, and water-level percentage.
- MISSING: validity/fault representation for pH, turbidity, water level, power sense, and equipment feedback.
- MISSING: equipment output definitions, relay polarity, safety decisions, and feedback sensing.
- MISSING: command acknowledgement RTDB schema/rules/client display and persistent device idempotency.
- MISSING: command expiry and collision-resistant command IDs.
- MISSING: approved history ingestion protocol; current device history writes are denied.
- CONFLICTING: optional/visible ammonia references remain although the accepted outline excludes ammonia.
- PARTIAL: active clients accept excessive future timestamps as live; web optional-number normalization can turn `null` into zero.
- NOT VERIFIED: selected ESP32 Firebase library, TLS behavior, token refresh, RTC/network time, bandwidth, memory, and reconnect behavior.
- HARDWARE VERIFICATION REQUIRED: sensor accuracy/calibration, voltage compatibility, relay behavior, feeder mechanics, filtration/lighting loads, UPS/power sensing, water safety, and two-device long-duration operation.

## 7. Phase 7B dependency notes

Aquarium type, dimensions, operational water volume, filtration configuration, fish quantity, and estimated bioload remain reserved for Phase 7B and were not implemented here.

Hardware dependencies to carry into Phase 7B:

- Tank dimensions and operational water level are needed to calibrate ultrasonic distance into `waterLevelPercent`.
- Filtration configuration is needed to interpret whether an output command can reasonably represent the installed filtration equipment.
- Tank-specific profile data may select approved thresholds/recommendations later, but Phase 7A does not define those rules.
- Device authorization remains based on aquarium ID and ownership, not on profile fields.

Do not begin Phase 7B automatically. It requires separate review and authorization.

## 8. Exact entry criteria for real hardware integration

Real integration may begin only when all of the following are true:

- Phase 7A documents are reviewed and accepted.
- The wiring diagram, board model, pin assignments, voltage levels, isolation, relay polarity, safe states, and emergency disconnect are approved.
- Device provisioning and revocation exist in a non-production environment and cross-aquarium rules tests pass.
- The selected ESP32 Firebase library and credential-storage approach pass a security review.
- Telemetry fields, units, validity behavior, timestamp authority, and sensor calibration plans are approved.
- Command acknowledgement, expiry, persistent idempotency, and feeder replay protection are implemented and emulator-tested.
- No actuator is connected until its output has been verified with a safe test load.
- The history approach is either approved and tested or explicitly disabled and not claimed.
- Test accounts, aquariums, and device identities are isolated from production.
- A named tester, evidence template, rollback/power-off procedure, and test order are agreed.

Meeting these criteria permits controlled bench integration only. It does not prove production readiness, multi-user capacity, long-duration stability, sensor accuracy, or safe unattended operation.
