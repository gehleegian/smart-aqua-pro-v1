# SmartAqua Pro Phase 7A Pre-Hardware Integration Report

Date: 2026-10-18

Execution mode: repository assessment, interface design, documentation, and local non-production verification only

Deployment status: NOT DEPLOYED; staging and production deployment were not authorized or attempted

## 1. Executive Summary

Phase 7A is IMPLEMENTED as a documentation and readiness-assessment phase. The current firmware can acquire several local sensor signals and print serial diagnostics, but it is not yet a networked SmartAqua Pro device: Wi-Fi, Firebase Authentication, RTDB communication, telemetry publication, command/control reads, actuator outputs, acknowledgements, reconnect recovery, power sensing, and unique device identity are MISSING.

The repository's existing RTDB authorization design is suitable as the security boundary for future per-device access. It already requires a distinct `principalType: "device"` identity and an aquarium-specific `deviceUids/{uid}` mapping. Emulator tests previously verified the rules with synthetic authorization fixtures, but real ESP32 authentication and physical behavior remain NOT VERIFIED.

Phase 7A created an authoritative interface design, validation flow, equipment semantics, acknowledgement/idempotency design, reconnect design, two-aquarium plan, and staged checklists. No firmware, web/mobile functionality, rules, Functions, Firebase data, or sensor logic was modified. No mock telemetry was added.

## 2. Repository Baseline

| Area | Classification | Finding |
|---|---|---|
| Phase 6 automated security baseline | IMPLEMENTED / previously validated | 99/99 passed: 5 client contracts, 11 authorization sync, 1 trigger, 23 trusted mutations, 11 callable endpoints, 8 Firestore rules, and 40 RTDB rules. |
| Web quality baseline | previously validated | Production build and full lint passed in Phase 6. |
| Functions quality baseline | previously validated | Build/lint passed under Node.js 22.23.3 in Phase 6. |
| Mobile quality baseline | previously validated | TypeScript and lint passed in Phase 6. |
| Current Java | VERIFIED | Eclipse Temurin OpenJDK 21.0.12.1 LTS was independently observed. |
| Current Firebase CLI installation | VERIFIED WITH TOOL LIMITATION | Installed package manifest reports 15.34.0. Direct CLI invocation in this sandbox could not read the user's configstore file; no Firebase command or deployment was needed. |
| Current default Node shell | CONFLICTING WITH PHASE 6 TEST RUNTIME | Current `node` is 24.15.0; Phase 6's Functions verification used Node 22.23.3. No Functions code was changed or executed in Phase 7A. |
| Production/staging state | NOT VERIFIED / NOT MODIFIED | No remote environment was inspected or changed. |
| Git worktrees | PARTIAL | Both repositories already contained substantial unrelated modifications. They were preserved. Phase 7A added documentation only in the web repository. |

The repository manuscript file is available, but it contains no independent approval metadata that establishes it as newer than the signed/accepted outline. Where they conflict—most notably ammonia and broader Admin monitoring—the accepted outline plus the owner's explicit clarifications govern this assessment. The conflict is documented rather than silently rewriting either source.

The Phase 6 results remain historical evidence rather than a new Phase 7A test run. Because Phase 7A changes only Markdown documents, rerunning code, rules, emulator, build, and lint suites was not necessary to validate executable behavior.

## 3. Files Inspected

Governing documents:

- `AGENTS.md` in both web and mobile repositories.
- `Chapter 1 And 2 - updated schema.docx` (older manuscript source in the web repository).
- `C:\Users\marin\Downloads\outline ni.docx` (accepted capstone outline).
- Phase 1–6 security and implementation documents under `docs/security/`.

Security/backend:

- `firebase.json`, `firestore.rules`, and `database.rules.json`.
- `functions/src/index.ts`, `functions/src/authorizationSync.ts`, and `functions/src/trustedMutations.ts`.
- Emulator test plans and Firestore/RTDB/backend test implementations under `tests/`.

Firmware and web:

- `docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino`.
- `src/types/device.ts`, `src/services/deviceService.ts`, and `src/services/sensorReadingsService.ts`.
- `src/hooks/useDashboardController.ts` and `src/hooks/useMonitoringController.ts`.
- Alert, report, data-log, aquarium, and sensor-reading types/helpers containing telemetry or ammonia references.

Mobile:

- `src/types/domain.ts`, `src/services/firebase-service.ts`, and `src/hooks/use-mobile-data.ts`.
- Dashboard, landing, and aquarium-control UI files that consume telemetry or commands.

## 4. Files Changed

Created:

- `docs/hardware/esp32-firebase-interface-contract.md`
- `docs/hardware/two-aquarium-integration-checklists.md`
- `docs/security/phase7a-pre-hardware-integration-report.md`

No executable source, firmware, Firebase configuration, security rule, test, dependency, or production resource was changed.

## 5. ESP32 Firmware Readiness

The full itemized assessment is in `docs/hardware/esp32-firebase-interface-contract.md`.

Implemented in firmware source:

- boot/setup structure, serial diagnostics, RTC initialization;
- existing pin constants;
- ultrasonic distance acquisition;
- two OneWire temperature interfaces and disconnect checks;
- analog pH/TDS/turbidity acquisition;
- averaged analog voltage and temperature-compensated TDS calculation.

PARTIAL:

- pH and turbidity are raw/voltage-only and are not authoritative measurements;
- water level is distance, not calibrated percentage;
- validation covers some disconnect/timeout cases but not the complete contract;
- RTC time exists, but authoritative epoch-millisecond/network time does not;
- two temperature inputs exist, while the RTDB contract has one temperature field.

MISSING:

- Wi-Fi/Firebase/Auth/RTDB integration;
- telemetry/control/command flows;
- unique identity and credential lifecycle;
- equipment pins/drivers/feedback;
- acknowledgement, duplicate protection, restart recovery, and power sensing.

All physical claims are HARDWARE VERIFICATION REQUIRED. Firmware was not modified.

## 6. Device Authentication Architecture

The target is one Firebase Auth UID per ESP32 with trusted `principalType: "device"`. A trusted provisioning service—not firmware, web, or mobile—must create/disable device identities and issue claims. Firmware may store only its own revocable credential or refresh material using an approved protected-storage approach. Service-account keys and Firebase Admin credentials are prohibited in firmware.

Provisioning must cover one-time enrollment, token renewal, rotation, revocation, replacement, reassignment, compromise handling, and audit evidence. The current trusted backend does not implement these operations, so this area is MISSING despite the rules being ready to consume the identity.

## 7. Device-to-Aquarium Authorization

The existing mirror contract is preserved:

```text
authorization/aquariums/{aquariumId}/
  ownerUid
  state
  deviceUids/{deviceUid}: true
```

The rules require an active aquarium, a device claim, and exact UID membership. Client access to `/authorization` is denied. Human ownership changes preserve the aquarium's device mapping; aquarium deletion revokes the mirror and removes device mappings.

PARTIAL: `deviceUids` is enforced and synchronized safely when encountered, but there is no canonical protected device registry or trusted provisioning/reassignment API. That source of truth must be added before real enrollment. ESP32 A/B isolation is emulator-tested only with fixture tokens, not real devices.

## 8. Telemetry Data Contract

The contract preserves `/devices/{aquariumId}/telemetry` and the current required fields `temperatureC`, `waterLevelPercent`, `updatedAt`, and `online`. It defines supported optional measurements/status fields, validity semantics, timestamp/staleness behavior, and client/history expectations without inventing thresholds.

Major incompatibilities are documented rather than silently changed:

- firmware does not yet produce calibrated water-level percentage, pH, or turbidity;
- turbidity's authoritative unit is unresolved;
- the two firmware temperature probes map to one transport field with no approved selection policy;
- web may coerce unavailable optional numeric `null` values to zero, while mobile does not;
- both clients can treat excessive future timestamps as live;
- explicit validity flags are absent for several approved sensor/status fields;
- device history writes remain denied pending a protocol.

The full field-by-field table is in `docs/hardware/esp32-firebase-interface-contract.md`.

## 9. Sensor Validation Flow

The required sequence is raw acquisition → connection/type checks → calibration/conversion → plausibility checks → timestamp/sample validation → valid or sensor/device fault. Only valid readings enter NORMAL/WARNING/CRITICAL evaluation and rule-based recommendations.

Missing, null, NaN, malformed, impossible, disconnected, stale, duplicate, and excessive-future readings are explicitly handled. Invalid data must never be converted directly into a water-quality WARNING or CRITICAL classification. No threshold values were created or changed.

## 10. Equipment Control Contract

Feeder, filtration, and lighting contracts now distinguish:

- requested action/desired state;
- device interpretation;
- electrical output attempt;
- observed equipment state when real feedback exists;
- acknowledgement and terminal outcome;
- failure, retry, duplicate, startup, and reconnect behavior.

Feeder is event-based and must execute at most once for one command ID. Filtration and lighting use idempotent desired-state commands, never untracked toggles. Without current/flow/position/light feedback, the system may report an output attempt but must not claim the physical equipment operated successfully.

This contract is design-only. Equipment outputs and physical behavior are MISSING / HARDWARE VERIFICATION REQUIRED.

## 11. Command Acknowledgement Design

The current `/commands/latest` request path is retained. A future companion `/commands/status/{commandId}` extension is proposed to represent received, accepted/rejected, action attempted, observed, and completed/failed states. Current rules deny this path, so a separately approved rules/client/firmware change and emulator test are required before implementation.

Feeder safety requires a collision-resistant ID, approved command expiry, persistent processed-command state, monotonic acknowledgement transitions, and no replay after reboot/reconnect. The current timestamp-derived command ID and last-write-wins request slot are PARTIAL. A queue replacement is not proposed unless integration testing demonstrates the requirement.

## 12. Power and Reconnection Design

The design requires safe outputs before networking, bounded reconnect/backoff, token refresh, assignment revalidation, full control reread, command-ID reconciliation, and a fresh timestamp before normal operation resumes. The retained feeder command must never replay.

Client staleness detects unavailable telemetry but does not prove an electrical interruption. Although the project has a UPS for the ESP32, actual primary-power loss requires a separately wired, safe voltage/UPS status input. No such input or firmware exists, so power-interruption sensing is HARDWARE VERIFICATION REQUIRED. No power events were fabricated.

## 13. Two-Aquarium Integration Plan

The plan uses User A → Aquarium A → ESP32 A and User B → Aquarium B → ESP32 B. It includes positive access and negative cross-user/device tests for telemetry, control, commands, history, revocation, replacement/reassignment, and reconnect behavior.

Security rules provide tested logical isolation, but simultaneous physical telemetry, two-device reconnects, two-user UI sessions, and long-duration operation are NOT VERIFIED. The complete matrix appears in `docs/hardware/two-aquarium-integration-checklists.md`.

## 14. Hardware Readiness Checklist

The hardware checklist covers board/pin identification, supply capacity, grounding, voltage compatibility, relay level/polarity/rating, isolation and surge protection, safe output states, feeder/filtration/lighting wiring, UPS/power sense, water safety, secure connectors, serial access, and emergency disconnection.

It then gates sensor calibration and equipment bring-up. Lighting and filtration are first tested without the real load or with a safe test load; the feeder is tested last, empty, with bounded actuation and replay protection. Every unchecked item remains NOT VERIFIED.

## 15. Software Integration Checklist

The approved order is boot → serial → Wi-Fi → unique identity → Firebase Auth → RTDB authorization → one sensor → one real reading → RTDB/web/mobile verification → remaining sensors one-by-one → validation faults → control reads → acknowledgement rules → lighting → filtration → feeder last → history → disconnect/reconnect → second ESP32 → isolation → two-user/two-aquarium soak test.

The checklist requires evidence tagged as emulator, software, bench hardware, wet test, or long-duration test. It prohibits integrating all sensors and actuators simultaneously.

## 16. Ammonia Schema Conflict Assessment

The accepted outline excludes ammonia and controls Phase 7A. The older manuscript and both repository `AGENTS.md` files conflict. Web/mobile types, normalizers, history/report/alert helpers, RTDB validation, a rule fixture, and visible mobile UI retain legacy ammonia references. Firmware has no ammonia implementation. Production Firestore contents are UNKNOWN because production inspection was not authorized.

Classification: accepted outline CURRENTLY APPROVED; older manuscript/AGENTS CONFLICTING; repository compatibility references LEGACY; production records UNKNOWN. No cleanup or migration was performed.

## 17. Regression Verification

Phase 7A changed documentation only. Therefore the web build/lint, mobile TypeScript/lint, Functions build/lint, 99 code/security tests, and emulator suites were not rerun; those checks cannot gain or lose executable coverage from Markdown-only additions. Their most recent actual result remains the Phase 6 99/99 baseline described in Section 2.

Phase 7A checks performed:

- Java version: PASS, Temurin OpenJDK 21.0.12.1.
- Firebase CLI installed package version: PASS, 15.34.0.
- Default Node version inventory: PASS, 24.15.0 observed; Node 22 remains the required Functions verification runtime.
- Documentation structure, references, final-newline, and trailing-whitespace review: PASS for all three Phase 7A files.
- Repository `git diff --check`: PASS; Git emitted only existing LF-to-CRLF conversion warnings for previously modified files.

No test is reported as newly passed unless it was actually executed. No Firebase emulator or remote Firebase command was run in Phase 7A.

## 18. Remaining Hardware-Dependent Blockers

- HARDWARE VERIFICATION REQUIRED: sensor calibration/accuracy, electrical compatibility, relay behavior, feeder mechanics, filtration/lighting loads, water-safe installation, UPS behavior, and power-sense input.
- MISSING: firmware networking, Auth, RTDB, telemetry/control/command state machines, reconnect, and persistent idempotency.
- MISSING: trusted device registry/provisioning/revocation/reassignment backend.
- MISSING: approved command acknowledgement rules and UI handling.
- MISSING: approved history ingestion and immutable deduplication contract.
- MISSING: pH/turbidity/water-level conversions and several validity flags.
- PARTIAL: command IDs, future-timestamp handling, web null normalization, mobile `sync_control` parity, and equipment observation semantics.
- NOT VERIFIED: real token renewal, library TLS behavior, device memory/bandwidth, simultaneous devices, long-duration stability, and physical safe-state behavior.

## 19. Phase 7B Dependencies

Aquarium type, tank dimensions, operational water volume, filtration configuration, stocked species, fish quantity, estimated bioload, and context-specific monitoring were not changed. They remain reserved for Phase 7B.

Only dependencies were recorded: dimensions/operational level affect ultrasonic calibration; filtration configuration affects equipment interpretation; profile context may later select approved rule sets. Authorization remains based on user/aquarium/device identity rather than these fields. Phase 7B must not begin without a separate directive.

## 20. Exact Criteria for Beginning Real Hardware Integration

Controlled bench integration can begin only after:

1. Phase 7A documents and telemetry/equipment semantics are reviewed and accepted.
2. Wiring, voltage levels, isolation, relay polarity, safe states, and emergency disconnect are approved.
3. Unique device provisioning, protected credential storage, claim issuance, revocation, and reassignment are implemented in a non-production environment.
4. Device A/B positive and cross-aquarium negative authorization tests pass using real device credentials.
5. The ESP32 Firebase library passes TLS, token-refresh, RTDB streaming, reconnect, and timestamp review.
6. Sensor calibration/conversion and validity behavior are approved, including the two-temperature policy and turbidity unit.
7. Command acknowledgements, expiry, collision-resistant IDs, and persistent feeder idempotency are implemented and emulator-tested.
8. The history pipeline is approved/tested or explicitly disabled and not claimed.
9. Each actuator is first validated with a safe test load and no livestock risk.
10. Test evidence, rollback/power-off procedure, non-production project, named devices/accounts, and sequential test order are prepared.

These criteria authorize only controlled hardware integration after review. They do not prove sensor accuracy, safe unattended operation, production security, multi-user capacity, or long-duration stability.
