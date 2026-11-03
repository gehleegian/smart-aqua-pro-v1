# SmartAqua Pro Phase 0 Threshold and Recommendation Audit

Date: 2026-10-21
Status: Audit complete; numeric thresholds and final recommendation rules require approval
Applies to: Small freshwater aquariums containing goldfish

## 1. Executive finding

The accepted project outline defines the monitored parameters, three condition classifications, required validation flow, and requirement to generate maintenance recommendations. It does not provide the numeric NORMAL, WARNING, and CRITICAL boundaries or a complete approved recommendation table.

The current application contains user-entered thresholds and several hardcoded display or alert boundaries. Those values do not have an approval source in the accepted outline or manuscript and must not become the authoritative analytics rules until they are reviewed and approved.

Phase 0 has established the authoritative scope, the non-numeric rules that are already approved, the missing decisions that block the assessment engine, the current code values that must be treated as provisional, editable approval matrices, and the implementation gate for the next phase.

No production threshold, classification, or recommendation behavior was changed during this phase.

## 2. Source hierarchy

When sources conflict, use the following order:

1. The accepted Capstone Project Outline Acceptance Form.
2. The five objectives confirmed by the project owner.
3. Repository project instructions in `AGENTS.md`.
4. The manuscript as supporting design context.
5. Existing source code, which represents implementation state but is not automatically an approved scientific or maintenance authority.

### 2.1 Scope conflict resolved

The accepted outline and confirmed objectives include water temperature, pH, turbidity, total dissolved solids, water level, filtration status, equipment operation or status, and power status. For the current implementation, the aquarium profile records whether a filtration system is installed, while live monitoring records its operational status. Filter type, rated capacity, and flow are not required profile fields or monitoring parameters.

They do not include ammonia. The older manuscript and some current web/mobile types still mention ammonia. For the current approved scope, ammonia is a legacy compatibility reference and must not be required by the assessment engine, reports, or completion claims unless the project scope is formally changed.

## 3. Approved non-numeric requirements

### 3.1 Classification rules

- Valid condition classifications are `NORMAL`, `WARNING`, and `CRITICAL`.
- Only validated readings may enter threshold evaluation.
- Invalid, missing, malformed, impossible, stale, or unassociated readings are data, sensor, device, or communication problems. They are not automatically abnormal water conditions.
- Warning and critical conditions generate a rule-based maintenance recommendation.
- Every classification and recommendation must be traceable to a versioned threshold or prescriptive rule.
- Web and mobile must display the same authoritative assessment result rather than implement separate rule sets.

### 3.2 Aquarium context

The rule engine must be able to use the following approved profile context when a rule requires it:

- aquarium type;
- tank dimensions;
- operational water volume;
- filtration system installed as a Yes/No choice;
- stocked fish species;
- fish quantity; and
- estimated bioload.

Goldfish and small freshwater aquariums are the current prototype scope. Other aquarium types and fish species require separately validated ranges and rules.

### 3.3 Recommendation requirements

Every approved recommendation rule must define:

- rule identifier and version;
- monitored parameter or event;
- triggering condition;
- severity;
- recommended maintenance activity;
- reason or justification;
- required user action;
- prohibited automatic action, when applicable; and
- required profile or equipment context.

Recommendations must remain maintenance guidance. The system must not diagnose fish disease, recommend medication, automatically chemically correct pH, automatically replace water, automatically clean filters, or perform unapproved maintenance actions.

### 3.4 Historical and alert behavior

- Assessments, alerts, recommendations, acknowledgements, and completed maintenance actions must remain aquarium-specific.
- An alert and a maintenance recommendation are related but separate records.
- Reports must preserve the rule and condition that produced each recommendation.
- Power interruptions, equipment faults, invalid readings, and unavailable telemetry must remain distinguishable from abnormal water-quality conditions.

## 4. Threshold approval matrix

The editable source of truth is `threshold-approval-matrix.csv` in this directory. Every row currently remains `APPROVAL_REQUIRED`.

| Parameter or event | Required unit or state | Approved boundary found | Decision still required |
| --- | --- | --- | --- |
| Water temperature | Degrees Celsius | None | Normal range, low/high warning, low/high critical, inclusive boundaries, persistence |
| pH | pH units | None | Normal range, low/high warning, low/high critical, persistence |
| TDS | ppm | None | Normal, warning, and critical boundaries; confirm ppm as the decision unit |
| Turbidity | Unit unresolved | None | Authoritative unit, calibration method, normal/warning/critical boundaries |
| Water level | Percent after calibration | None | Normal minimum, warning threshold, critical threshold, debounce/persistence |
| Filtration status | `Active`, `Inactive`, `Fault`, or `Unknown` | None | Expected-state rules, warning/critical mapping, persistence, and recovery behavior |
| Equipment operation | Approved state enumeration | None | Warning/fault mapping and observation requirements for each device |
| Power status | Approved state enumeration | None | Interruption severity, recovery, event duration, UPS/primary-power semantics |
| Stale or unavailable telemetry | Time duration | None | Offline timeout, severity, alert behavior, recovery behavior |
| Invalid sensor reading | Validation result | Structural rule only | Retry count, persistence, sensor-error severity, notification behavior |
| Overall aquarium condition | Classification aggregation | None | How multiple parameter classifications combine |
| Estimated bioload context | g/L | Numeric calculation only | Whether and how bioload selects or modifies rules |

## 5. Recommendation approval matrix

The editable source of truth is `recommendation-approval-matrix.csv` in this directory.

The manuscript provides two examples but not a complete approved rule table:

- Warning turbidity may recommend inspecting filtration, checking for excess food, and removing visible waste.
- Low water level may recommend checking for leakage or evaporation before adding properly prepared water.

These are recorded as candidates, not production rules. Their exact trigger, severity, wording, sequence, and required acknowledgement still require approval.

Rules are still required for low/high temperature, low/high pH, elevated TDS, elevated turbidity, low water level, filtration problems, equipment faults, power interruption, unavailable telemetry, and persistent invalid readings.

## 6. Policy decisions requiring approval

1. Boundary inclusivity: whether a value exactly equal to a limit is normal or abnormal.
2. Whether a single critical parameter always makes the overall condition critical.
3. Whether warnings must persist for a duration or number of consecutive samples.
4. Whether critical readings require confirmation or alert immediately after validation.
5. Sampling-rate effects on persistence and duplicate suppression.
6. When an alert resolves after readings return to normal.
7. Whether an acknowledged but continuing condition remains open.
8. When a resolved condition reopens versus creating a new alert.
9. How profile changes affect open assessments and alerts.
10. Whether filtration-system presence or estimated bioload selects different rules.
11. Severity for device, sensor, communication, and power events.
12. Whether completion notes are mandatory for each maintenance action type.

## 7. Current code discrepancy register

| ID | Current implementation | Audit result | Required action |
| --- | --- | --- | --- |
| P0-01 | Forms accept user-entered temperature, water-level, and TDS-purity thresholds | No approved source constrains these values to goldfish-appropriate rules | Replace unrestricted authority with approved versioned configuration |
| P0-02 | TDS logic uses both ppm and a legacy purity percentage | Conflicting units can produce different classifications | Approve ppm or explicitly approve a conversion contract |
| P0-03 | TDS uses 300 ppm and 500 ppm display/alert boundaries | Hardcoded values are not approved by the governing documents | Treat as provisional and remove from authoritative classification until approved |
| P0-04 | Dashboard treats pH 6.5 through 8.5 as normal | Boundary is not approved by the governing documents | Treat as provisional until approved |
| P0-05 | Dashboard treats turbidity at 5 NTU or lower as clear | Unit/boundary are unapproved; firmware currently provides voltage rather than calibrated NTU | Do not use for authoritative assessment until approved and calibrated |
| P0-06 | Water-level critical severity is minimum level minus 10 percentage points | Severity calculation is not approved | Replace with an approved explicit boundary |
| P0-07 | Monitoring mainly exposes `healthy` or `warning` | Does not satisfy the three-class contract | Implement authoritative NORMAL/WARNING/CRITICAL results after approval |
| P0-08 | Alerts are assembled locally from profile values | They are not persisted assessments of validated live readings | Generate alerts from stored backend assessment results |
| P0-09 | No recommendation engine or complete maintenance-action workflow exists | Core objective is missing | Implement after rule approval |
| P0-10 | Filtration is mainly active/inactive state | The approved simplified scope does not require type, rated capacity, or flow | Add approved `Fault` and `Unknown` handling and define expected-state severity |
| P0-11 | Power status exists in types but no physical power sensing exists | Cannot prove an electrical interruption | Retain software contract and defer physical verification |
| P0-12 | Legacy ammonia fields remain | Outside the accepted scope | Isolate and later remove through a tested compatibility cleanup |
| P0-13 | Profile-derived bioload does not alter rules | No approved modifier rules exist | Keep informational until context rules are approved |

## 8. Proposed authoritative software contract

This section defines structure, not scientific values.

### 8.1 Threshold rule

Each threshold rule should contain `ruleId`, `version`, `parameter`, `unit`, `validityConstraints`, `normalExpression`, `warningExpression`, `criticalExpression`, `persistencePolicy`, `contextConditions`, `effectiveFrom`, `approvedBy`, `approvalReference`, and `active`.

### 8.2 Assessment result

Each assessment should contain aquarium and device identifiers, source reading identifier and timestamp, validation result, normalized value and unit, parameter classification, overall classification, threshold rule identifier and version, profile context version, generated recommendation identifiers, assessment timestamp, and processing errors when applicable.

### 8.3 Recommendation rule

Each recommendation rule should contain `recommendationRuleId`, `version`, triggering threshold rule and severity, maintenance title, ordered action steps, rationale, required user response, prohibited automatic actions, context conditions, approval metadata, and active status.

## 9. Approval checklist

- [ ] Every parameter has an approved unit.
- [ ] Every numerical parameter has explicit NORMAL, WARNING, and CRITICAL expressions.
- [ ] Inclusive and exclusive boundary behavior is documented.
- [ ] Persistence, debounce, stale-data, and recovery policies are documented.
- [ ] Each warning and critical rule references an approved recommendation.
- [ ] Equipment, filtration, power, sensor-error, and communication-event severities are approved.
- [ ] Overall-condition aggregation is approved.
- [ ] Profile and bioload modifiers are defined or explicitly declared unused.
- [ ] Ammonia exclusion is confirmed for the current scope.
- [ ] The adviser or authorized approver signs and dates the matrices.
- [ ] The approved matrices receive a version and effective date.

## 10. Implementation gate

Work that may proceed before numeric approval:

- complete the filtration-system Yes/No field in aquarium profiles;
- define rule, assessment, recommendation, and maintenance record types;
- implement validation structure and invalid-data handling;
- implement authorization and aquarium isolation;
- test structure, access control, and rejection of missing rules; and
- preserve honest no-data and unavailable states in web and mobile.

Work that must wait for approved matrices:

- enable numeric water-quality classification;
- generate production maintenance recommendations;
- create production warning or critical alerts from parameter values; and
- claim species-appropriate or context-specific assessment correctness.
