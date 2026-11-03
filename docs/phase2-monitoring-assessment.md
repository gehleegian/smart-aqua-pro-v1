# Phase 2 Monitoring and Condition Assessment

Status: Software assessment hardened and tested; physical calibration and final rule acceptance remain pending
Scope: ordinary indoor freshwater Goldfish aquariums

## Delivered software behavior

- Web and mobile consume temperature, pH, turbidity, TDS, water level, filtration state, equipment status, and power status.
- One condition-assessment model classifies each parameter as `normal`, `warning`, `critical`, or `unavailable`.
- The overall aquarium condition is the most severe parameter result.
- Each non-normal result can produce a maintenance recommendation. Recommendations are guidance only: they do not diagnose disease, add chemicals, change water, or operate equipment.
- Missing, stale, malformed, or invalid readings are never classified as normal.
- Ammonia is excluded from the Phase 2 UI and assessment because it is outside the accepted project scope.

## Rule set

The implemented rule identifier is `indoor-goldfish-v2`.

Temperature and pH normal ranges come from the aquarium profile. New profiles start with the approved indoor preset of `20-24 C` and pH `6.5-7.5`, while users may edit those values. Water level and calibrated TDS-purity normal limits also come from the profile.

Warning and critical bands currently use explicit software margins:

| Parameter | Warning | Critical |
|---|---|---|
| Temperature | Outside configured range | At least `2 C` beyond a configured boundary |
| pH | Outside configured range | At least `0.5` beyond a configured boundary |
| Water level | Below configured minimum | At least `10 percentage points` below minimum |
| TDS purity | Below configured minimum | At least `10 percentage points` below minimum |
| Turbidity | Above `5 NTU` | Above `10 NTU` |
| Filtration | Installed system reports inactive | Equipment fault can elevate the overall result to critical |
| Equipment | Warning feedback | Fault feedback |
| Power | Unknown is unavailable | Offline or power-interruption feedback |

The turbidity values and all sensor-derived percentages remain provisional until physical calibration confirms authoritative units and mappings. This phase centralizes them so later calibration changes happen in one rule set rather than scattered UI checks.

## Assessment hardening (2026-10-31)

- Classification and recommendation selection are separate functions. Warning requests review and rechecking; critical requests immediate verification. The existing parameter-specific maintenance actions are retained, with no new treatment, dosing, or automatic control rules.
- Each recommendation carries a versioned `recommendationRuleId` and a `recommendationPriority` (`review` or `immediate`). Critical recommendations appear before warnings.
- Missing, inverted, non-finite, or out-of-domain profile settings produce `unavailable`, with no maintenance recommendation for that parameter. Mobile no longer supplies default thresholds during assessment of an incomplete profile.
- The core rejects non-finite readings, malformed numbers, pH outside 0–14, percentages outside 0–100, negative turbidity, and unknown equipment states. The web adapter no longer clamps invalid percentages into valid-looking readings.
- An unavailable source ignores retained telemetry. Mobile re-evaluates freshness every second, using the existing 30-second policy; stale data produces no maintenance guidance.
- A valid low water-level measurement is still evaluated when water presence is false. Water absence does not itself mean the level measurement is invalid. Temperature retains its existing water-presence validity check.
- Both clients display calibration/assessment limitations. Filtration status is explicitly operational feedback, not evidence of filtration effectiveness. TDS percentage is a project-specific conversion and is not established as universal water purity.
- `unavailable` remains a data/configuration availability state, not a fourth water-condition severity.

### Rule source and maintenance

The canonical dependency-free implementation and types are in web `src/utils/monitoringAssessmentCore.ts`. Mobile contains an identical checked-in copy at the same relative path so each repository builds independently. Thin adapters handle each client's telemetry shape. When modifying the rules, update both copies in the same change and run the parity suite; do not independently modify mobile rule logic.

Web commands:

- `npm run test:monitoring-assessment`: 70 standalone classification, validation, and recommendation tests.
- `npm run test:monitoring-parity`: 7 cross-client contract tests, requiring the sibling `../smart-aqua-mobile` checkout. Verifies identical rule source, equivalent adapter outputs, production Firebase parsers, power aliases, and invalid water-level display formatting.
- `npm run test:aquarium-profile`: existing 22 profile regression tests.

No Firebase collections, rules, deployed functions, ownership permissions, or device commands are changed by this hardening. The assessment remains advisory and in memory. Persisted alert lifecycles, report integration, and completed-maintenance tracking are separate work.

### Integration corrections (2026-11-01)

Live Firebase telemetry now passes through independently testable parser modules. Numeric fields accept only finite JSON numbers: null, blank text, numeric strings, booleans, arrays, and objects are not coerced into measurements. Genuine zero measurements remain valid. Missing required temperature, water-level, or timestamp fields suppress the assessment; invalid optional readings become unavailable without maintenance advice for that parameter.

Web and mobile share power-status normalization, including case/whitespace handling and the existing `power_interruption` alias. Water-level displays on web monitoring cards, aquarium lists, dashboard statistics, and mobile use a bounded formatter; invalid percentages render as `--`, and the web monitoring card identifies an invalid reading. Telemetry timestamps in the future are unavailable unless web's trusted Firebase server clock offset accounts for the difference. Mobile keeps stale readings visibly labeled as last known and suppresses them entirely when timestamps or required measurements are invalid. Dashboard statistic sparkline arrays are empty until real historical samples are wired into that view; no values are fabricated from the latest reading. Invalid temperature values are also hidden from dashboard statistics.

Verification: 108 tests across assessment, cross-client integration, aquarium profiles, and trusted-mutation client contracts; both clients' TypeScript and lint checks. The web production build succeeds. Physical hardware and authenticated UI workflows still require separate verification.

### Final acceptance limits

These tests verify software behavior against the current configured/provisional rules; they do not validate biological suitability or sensor accuracy. Existing severity margins and maintenance actions were retained, not scientifically approved by this implementation. Final approval remains recorded separately in the threshold/recommendation approval matrices. Hardware calibration, sensor-fault behavior, and real device/power/filtration feedback still require physical verification. No ammonia assessment is added.

## Development simulator

Development builds provide Normal, Warning, and Critical scenarios. Simulation is deliberately isolated:

- it is held only in application memory;
- it does not write telemetry or history to Firebase;
- every simulated screen is visibly labeled;
- live subscription errors are hidden only while simulation is active; and
- web equipment and automation controls are disabled while simulation is active.

The simulator exists only to verify screens, classifications, and recommendation flows before equipment wiring. It does not prove sensor accuracy, equipment operation, power-interruption detection, Firebase device authentication, or hardware safety.

## Hardware completion gates

Before simulated input can be replaced by authoritative hardware input:

1. Calibrate each sensor and record its conversion, unit, valid range, and fault behavior.
2. Confirm explicit validity/fault fields for water level, pH, turbidity, TDS, power, filtration feedback, and equipment feedback.
3. Verify timestamps, stale-data behavior, reconnect behavior, and two-device isolation.
4. Test filtration, lighting, and feeder outputs with safe loads before connecting aquarium equipment.
5. Review the provisional severity margins and approve any changes after real calibration data is available.
