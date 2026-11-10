# Web and Firebase Completion Checklist

Status date: 2026-11-10

Scope: SmartAqua Pro web application and supporting Firebase services only. This checklist does not treat emulator results as production verification and does not authorize deployment, production-data changes, firmware changes, or scientific-rule approval.

Legend:

- `LOCAL PASS` — implemented and covered by a passing local automated test/build.
- `IMPLEMENTED` — present in source, but the named production workflow still needs evidence.
- `GAP` — missing or incomplete behavior remains.
- `APPROVAL` — implementation exists in draft form but scientific/operational approval is still required.

## Priority 1 — Real-time monitoring

| Requirement | Local status | Production evidence still required |
| --- | --- | --- |
| Temperature | LOCAL PASS | Compare calibrated device values with RTDB and the web for both aquariums. |
| pH | LOCAL PASS | Confirm validity flag/calibration behavior on both physical probes. |
| TDS | LOCAL PASS | Confirm `tdsPpm`, `tdsReadingValid`, and physical calibration. Legacy percentage remains compatibility-only. |
| Turbidity | LOCAL PASS for numeric/categorical separation | Approve the authoritative numeric unit and calibration. Do not label raw voltage/ADC as NTU. |
| Water level and operational volume | LOCAL PASS | Confirm the device target profile matches the configured working volume and calibrated geometry. |
| Filtration output status | LOCAL PASS | Confirm whether the reported state is relay/output state or independently observed flow. UI labels it as device-reported output. |
| Lighting output status | LOCAL PASS | Confirm physical output against the reported state. |
| Feeder operation status | LOCAL PASS for honest unavailable state | No position/current feedback exists in the telemetry contract; command acknowledgement is not physical feedback. |
| Equipment diagnostic | LOCAL PASS | Verify the device emits meaningful `Normal`/`Warning`/`Fault`; `Unknown` remains not monitored. |
| Power status | LOCAL PASS | Verify `mainsPresent` wiring and interruption behavior on hardware. |
| Last updated | LOCAL PASS | Compare displayed time with RTDB server timestamps in production. |
| Online/offline | LOCAL PASS | Observe a real disconnect/reconnect for each aquarium through the one-minute heartbeat. |
| Per-sensor validity/unavailable states | LOCAL PASS | Unplug/fault each sensor under supervision and confirm its actual payload. |
| Automatic dashboard updates | IMPLEMENTED with RTDB `onValue` subscriptions | Observe both deployed devices updating without refresh. |
| Aquarium/device association and isolation | LOCAL PASS in rule/integration tests | Verify deployed authorization mirrors and device bindings for Aquarium 1 and Aquarium 2. |

## Priority 2 — Firebase backend

| Requirement | Local status | Remaining work |
| --- | --- | --- |
| RTDB telemetry contract and rules | LOCAL PASS for current/legacy fixtures | Compare deployed rules version and capture sanitized production payload samples. |
| Firestore and Storage rules | LOCAL PASS in emulator suites | Confirm deployed rules/index versions. |
| RTDB → Functions → Firestore ingestion | LOCAL PASS | Production trigger observation required. |
| Invalid/missing sensor handling | LOCAL PASS | Physical fault payload verification required. |
| Stale and explicit-offline rejection | LOCAL PASS | Production disconnect/reconnect observation required. |
| Duplicate/out-of-order handling | LOCAL PASS for Firestore history, alerts/recommendations, and active web subscriptions; PARTIAL at the RTDB node | Functions reject a write whose `updatedAt` is not newer than the replaced value, and an active web subscription retains its newest accepted snapshot. RTDB itself remains latest-value-wins, so a new browser session can only evaluate the value currently stored there. Full replay protection requires an approved device timestamp/restart contract or a versioned/append-only node. |
| Historical sampling and classification-change capture | LOCAL PASS | Confirm deployed write cadence/cost and indexes. |
| Connection recovery | IMPLEMENTED through Firebase listeners | Browser and device network-loss exercises remain. |
| Backup and recovery | GAP | Document and test Firestore/RTDB/Storage backup and restore procedures without touching production until approved. |

## Priority 3 — Prescriptive analytics

| Requirement | Local status | Remaining work |
| --- | --- | --- |
| `NORMAL`/`WARNING`/`CRITICAL` precedence | LOCAL PASS | Scientific acceptance required. |
| All 27 configured Goldfish rules load and evaluate | LOCAL PASS | Every rule remains draft until formally approved. |
| Boundary behavior | LOCAL PASS against current draft configuration | Approval matrices still contain unresolved inclusivity and persistence decisions. |
| Goldfish profile and bioload | LOCAL PASS | Approval needed for any bioload-driven scientific modifier. |
| Recommendations only from valid, fresh telemetry | LOCAL PASS | Production trigger evidence required. |
| Traceable alerts/recommendations | LOCAL PASS | Production audit sample required. |

## Priority 4 — Web application

| Area | Status | Remaining work |
| --- | --- | --- |
| Main dashboard and live monitoring | LOCAL PASS for current automated coverage | Authenticated responsive/browser acceptance test on deployed configuration. |
| Aquarium profiles | LOCAL PASS | Production workflow verification. |
| Device registration and claiming | LOCAL PASS | Controlled production claim/reclaim drill. |
| Equipment controls and scheduling | LOCAL PASS for software contracts | Physical execution, offline schedule, and recovery tests. |
| Alerts and recommendations | LOCAL PASS | Notification delivery cannot be fully emulated. |
| Historical data/charts | IMPLEMENTED | Confirm long-range production datasets, indexes, empty states, and chart performance. |
| Reports and exports | LOCAL PASS | Verify generated production files and retention policy. |
| Administrator dashboard | IMPLEMENTED | Full production-role acceptance test remains. |
| Organization/user management | LOCAL PASS | Production-role acceptance test remains. |
| Loading/error/offline/empty states | IMPLEMENTED | Browser acceptance matrix remains. |
| Responsive navigation/accessibility | IMPLEMENTED | Formal viewport, keyboard, and screen-reader review remains. |

## Priority 5 — Security and reliability

| Area | Status | Remaining work |
| --- | --- | --- |
| Authentication/email verification/RBAC | LOCAL PASS | Production policy/version verification. |
| Aquarium and organization isolation | LOCAL PASS | Production authorization-mirror audit. |
| MFA readiness | LOCAL PASS | Production enrollment/recovery drill. |
| App Check readiness | IMPLEMENTED/PARTIAL | Rollout metrics and enforcement plan required before enabling enforcement. |
| Audit logs | IMPLEMENTED | Retention, access, and production sampling review. |
| Performance/reliability | PARTIAL | Load/latency targets and production monitoring evidence remain. |
| End-to-end production readiness | GAP | Requires approved deployment plus controlled production verification; local tests alone cannot close this item. |

## Completion rule

Do not mark web/backend completion as 100% until every row is either `LOCAL PASS` or explicitly approved, every production-evidence item is captured, all required suites are green, and the draft scientific matrices have formal approval. Hardware feedback must remain distinct from output state and command acknowledgement.
