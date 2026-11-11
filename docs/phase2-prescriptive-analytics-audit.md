# Phase 2 Prescriptive Analytics Audit

Date: 2026-11-10 (Asia/Manila)

Status: safe local implementation complete; not deployed; scientific approval and physical calibration remain pending.

## Audited pipeline

`ESP32 -> RTDB telemetry -> validation/freshness -> approved rule configuration -> classification -> recommendation/alert reconciliation -> Firestore history/current summary -> web dashboard`

The existing pipeline is implemented in software. RTDB telemetry is validated per sensor, associated through the aquarium path and Firestore profile, evaluated by the shared deterministic engine, deduplicated in engine state, persisted to aquarium-scoped Firestore documents, and consumed by the web dashboard.

## Confirmed working before this phase

- Freshness, malformed-value, impossible-value, explicit validity-flag, and out-of-order checks.
- Independent handling of missing/invalid sensors; one unavailable sensor does not suppress other valid sensors.
- `NORMAL`, `WARNING`, `CRITICAL`, and non-severity `unavailable`/`not_monitored` presentation.
- Aquarium-specific profile overrides were available in the editor preview, but had no approval metadata.
- One selected recommendation per parameter/severity by deterministic priority and context checks.
- Alert/recommendation deduplication, escalation, supersession, recovery, and cooldown.
- Aquarium and owner IDs on readings, alerts, recommendations, engine state, and condition summaries.
- Five-minute history sampling plus immediate rows when classification/rule signatures change.
- Owner/caretaker Firestore reads and constrained recommendation status transitions.
- Web condition, current readings, recommendation explanations, and empty/error states.

## Defects fixed in this phase

1. Draft rules were enabled and could create active classifications, alerts, recommendations, and cleaning schedules. The authoritative backend and web fallback now require the selected species configuration and every enabled rule to be approved. Draft data remains available to the Rules Editor preview and retains its status/source.
2. Historical rows did not capture the rule/threshold context needed to reproduce an assessment. Rows now include `matchedRuleIds` and `thresholdSnapshot` (species, status, effective values, and overridden parameters).
3. The recommendation mapper discarded the captured telemetry snapshot. Approved recommendation cards now display problem, parameter, measured value, applicable configured threshold, severity, rationale, action, pre-check, and generated time.
4. Existing draft recommendations could appear actionable. They are now withheld from active actions and explicitly identified as pending scientific approval.
5. The Assessment page did not show explicit values or active persisted recommendations. It now displays each assessed value and reuses the existing recommendations panel.
6. No bounded water-volume calculation seam existed. A pure calculator now supports only synchronized Aquarium 1 profile-based readings and returns current estimated volume, volume to the configured operational target, net observed decrease, and average observed decrease per day. It never labels the decrease as evaporation.
7. Owner/profile and admin aquarium threshold overrides had no source, status, approver, or approval timestamp but could become authoritative. They remain visible in the existing editor preview; the live engine now uses only approved species thresholds until an aquarium-specific approval contract is defined.

## Rule and scientific approval audit

All 27 seeded rules remain `draft`, all have `source: TBD`, and the Goldfish species configuration is also draft. No rule or source was promoted by this phase. Therefore the current real configuration intentionally produces `UNAVAILABLE` rather than a live water-quality classification or maintenance recommendation.

Approval conflicts and missing requirements:

- Temperature, pH, TDS, turbidity, water-level, bioload, cleaning interval, early-cleaning, equipment, filtration, power, device-offline, and sensor-fault rule sources are missing.
- The water-level critical rule uses `min - 15% of min`; an older Phase 2 document describes `min - 10 percentage points`. The adviser must select one explicit expression.
- TDS ppm rules conflict with legacy TDS-purity percentages; no approved conversion contract exists.
- Turbidity rules assume NTU, while physical calibration and authoritative device units remain unverified.
- Boundary inclusivity, persistence/debounce, critical confirmation, recovery, and cooldown policies remain draft even though deterministic software behavior and tests exist.
- Bioload bands, cleaning intervals, and early-cleaning triggers are draft and now cannot create active schedules/recommendations.
- Equipment feedback does not establish physical operation; feeder position has no sensor feedback.
- `mainsPresent` is the only power signal allowed to create a power-interruption finding. Device silence remains a separate connectivity event.
- The `power_offline` telemetry rule is not reachable from current sensed telemetry; scheduled heartbeat uses `device_offline` instead.
- Aquarium-specific threshold overrides have no approval metadata or approved inheritance policy. Until that requirement is defined, they cannot alter live assessments.

## Water-loss feasibility

Supported in software when all inputs are valid and synchronized:

- Current operational volume estimate: `workingWaterVolumeLiters * waterLevelPercent / 100`.
- Volume to the configured operational target.
- Net observed decrease between two compatible timestamps.
- Average observed decrease per day over that interval.

Not supported as an accurate claim yet:

- Confirmed evaporation: there is no ambient sensor or causal observation.
- Safe refill quantity: there is no approved headroom/overflow policy, reservoir sensor, or refill actuator feedback. The implemented value is only the amount to the configured operational target.
- Long-term daily water loss: maintenance/refill/water-change events are not yet correlated with every historical level interval, and physical sensor accuracy is unverified.
- Aquarium 2 volume conversion: its level percentage does not use the Aquarium 1 profile-synchronized geometry contract.

Required before product activation: final internal dimensions and operational volume, physical sensor/mount calibration, consistent historical target metadata, refill/water-change event boundaries, and an approved interpretation policy for leak/evaporation/refill language.

## Remaining engineering work

- Obtain adviser-approved values, citations, approver, and approval date for the species configuration and all enabled rules.
- Resolve the rule conflicts above, then run the existing approval workflow; do not edit production documents directly.
- Align the mobile repository with the approval gate in a separate mobile-authorized phase. Mobile was intentionally not modified here.
- Add a user-facing historical water-volume trend only after intervention boundaries and calibration are approved.
- Perform staged emulator/browser verification with the final approved configuration, then physical hardware verification before deployment.

Estimated local engineering after approvals: 2–4 development days for final configuration integration, web regression, emulator verification, and review. Physical calibration and hardware verification are schedule-dependent and cannot be estimated from the repository alone.
