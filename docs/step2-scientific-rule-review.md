# SmartAqua Pro Step 2: Scientific Rule Review and Approval Readiness

Date: 2026-11-10 (Asia/Manila)

Status: **review package only**. No rule, species configuration, threshold override, firmware, deployment, or production data was approved or activated by this review.

## 1. Review conclusion

All 27 configured rules are enabled but remain `draft`; every rule has `source: "TBD"`, `approvedBy: null`, and `approvedAt: null`. The Goldfish species configuration has the same draft metadata. These facts are visible in `scripts/seed/goldfish-draft.json:2-44` and throughout its 27 rule records.

The current backend is fail-closed for live prescriptive analytics: telemetry ingestion uses a species configuration only when that species and **every enabled rule** are approved, otherwise it supplies no authoritative thresholds or approved rules (`functions/src/telemetryIngest.ts:170-187`). The scheduled cleaning path repeats the gate (`functions/src/scheduledChecks.ts:113-138`), and cleaning recommendations independently require an enabled, approved rule (`functions/src/ruleEngine.ts:348-354`). Draft configuration may be previewed, but the web live assessment returns `unavailable` and no recommendations (`tests/unit/monitoring-assessment.test.mjs:66-72`).

The existing Firestore, callable, validation, audit-log, and cache infrastructure can carry out a controlled review of the global `species/goldfish` document and individual `rules/{ruleId}` documents. It does **not** yet provide a scientifically sufficient approval record or an approval path for aquarium-specific overrides. Scientific decisions, calibration, and a small approval-contract extension are still required before activation.

## 2. Sources and authority used in this audit

- Configured values and wording: `scripts/seed/goldfish-draft.json` and the generated `docs/rule-matrix.md`.
- Executed expressions and boundary behavior: `src/utils/monitoringAssessmentCore.ts:641-675,720-879` and its Functions copy.
- Live approval gate: `functions/src/telemetryIngest.ts:170-187`, `functions/src/scheduledChecks.ts:113-138`, and `functions/src/ruleEngine.ts:348-354`.
- Approval workflow: `functions/src/ruleAdmin.ts:7-105`, `src/views/RulesEditor.tsx:283-300`, and `firestore.rules:767-776`.
- Project/manuscript context: `manuscriopt-analysis.docx`, especially Chapter 1 and the Review of Related Literature. The manuscript supports validated sensor input, predefined rules, explainable maintenance guidance, and calibration, but it does not approve the numeric thresholds or all 27 actions.
- Existing repository scientific references: the manuscript reference list includes water-quality, sensor-calibration, IoT-monitoring, and recommendation-system literature. `docs/aquarium-profile-contract.md:24-26` separately records PetMD/Aqueon care-guide support for the **starting** 20-24 °C and pH 6.5-7.5 profile preset. Those references are not stored on `species/goldfish` or the rules and do not, by themselves, validate the severity margins, persistence policies, context checks, or recommendation wording.
- Historical discrepancy records: `docs/phase0-threshold-recommendation-audit.md`, `docs/phase2-monitoring-assessment.md`, `docs/device-contract.md`, `docs/bioload.md`, and `docs/security/profile-water-level.md`.

No external citation was added and no existing source was treated as an approval that it does not record.

## 3. Goldfish configuration under review

| Configuration item | Current value | Unit | Source | Approval |
|---|---:|---|---|---|
| Temperature normal range | 20 to 24 | °C | `TBD` | draft; approver/date null |
| pH normal range | 6.5 to 7.5 | pH | `TBD` | draft; approver/date null |
| TDS normal range | 100 to 400 | ppm | `TBD` | draft; approver/date null |
| Turbidity maximum | 5 | configured as NTU in UI/report labels, but device unit is not calibrated | `TBD` | draft; approver/date null |
| Minimum water level | 70 | % of calibrated operational target | `TBD` | draft; approver/date null |
| Bioload bands | light ≤1; moderate ≤3; heavy >3 | g/L | `TBD` | draft; approver/date null |
| Cleaning intervals | light 14; moderate 10; heavy 7 | days | `TBD` | draft; approver/date null |
| Early-cleaning TDS trigger | rise ≥30 from first valid post-cleaning reading | % change in ppm | `TBD` | draft; approver/date null |
| Early-cleaning turbidity trigger | 2 warning entries in 24 | count / hours | `TBD` | draft; approver/date null |

The bioload formula itself is `sum(fishWeightsG) / workingWaterVolumeLiters`; the bands, cleaning intervals, and early-cleaning values are explicitly documented as uncited drafts in `docs/bioload.md:1-3,15-28,34-58`.

## 4. Complete 27-rule review matrix

Thresholds below are the exact current strict comparisons. A value exactly equal to a `gt`/`lt` target does not match that rule. Numeric expansions use the current Goldfish draft values and are illustrative of the configured behavior, not scientific approval.

| # | Rule / purpose | Current trigger and unit | Severity | Current recommended action | Scientific source | Approval |
|---:|---|---|---|---|---|---|
| 1 | `temp_high_critical` — temperature far above range | `temperatureC > 24 + 10% = 26.4 °C` | CRITICAL | Move the tank away from heat/direct sunlight, increase aeration and ventilation, lower temperature gradually, and if changing water use conditioned water only slightly cooler than the tank. | `TBD`; no rule-specific citation | draft; by/at null |
| 2 | `temp_low_critical` — temperature far below range | `temperatureC < 20 − 10% = 18 °C` | CRITICAL | Check room temperature and any heater, and warm gradually without sudden changes. | `TBD`; no rule-specific citation | draft; by/at null |
| 3 | `temp_high_warning` — temperature above range | `temperatureC > 24 °C` | WARNING | Check sunlight, lights, room heating, and ventilation; let temperature fall gradually. | `TBD`; no rule-specific citation | draft; by/at null |
| 4 | `temp_low_warning` — temperature below range | `temperatureC < 20 °C` | WARNING | Check room temperature and any heater; raise temperature gradually. | `TBD`; no rule-specific citation | draft; by/at null |
| 5 | `ph_high_critical` — pH far above range | `pH > 7.5 + 10% = 8.25` | CRITICAL | Confirm with a calibrated test; check source water, decorations, and substrate; plan a partial conditioned-water change; never dose automatically. | `TBD`; no rule-specific citation | draft; by/at null |
| 6 | `ph_low_critical` — pH far below range | `pH < 6.5 − 10% = 5.85` | CRITICAL | Confirm with a calibrated test; perform a partial conditioned-water change, remove decaying food/debris, check filter maintenance; never dose automatically. | `TBD`; no rule-specific citation | draft; by/at null |
| 7 | `ph_high_warning` — pH above range | `pH > 7.5` | WARNING | Confirm with a calibrated test, check source water, plan a partial conditioned-water change, and avoid rapid pH changes. | `TBD`; no rule-specific citation | draft; by/at null |
| 8 | `ph_low_warning` — pH below range | `pH < 6.5` | WARNING | Confirm with a calibrated test, remove uneaten food/debris, and plan a partial conditioned-water change. | `TBD`; no rule-specific citation | draft; by/at null |
| 9 | `tds_high_critical` — TDS far above range | `tdsPpm > 400 + 25% = 500 ppm` | CRITICAL | Perform a partial conditioned-water change soon, remove debris, reduce feeding, and check cleaning history. | `TBD`; no rule-specific citation | draft; by/at null |
| 10 | `tds_high_warning_heavy_bioload` — high TDS with heavy computed bioload | `tdsPpm > 400 ppm` and `bioloadLevel == heavy` (>3 g/L) | WARNING | Schedule a partial water change soon, reduce feeding, and review whether stocking suits working volume. | `TBD`; no rule-specific citation | draft; by/at null |
| 11 | `tds_high_warning` — TDS above range | `tdsPpm > 400 ppm` | WARNING | Plan a partial conditioned-water change and review feeding amounts. | `TBD`; no rule-specific citation | draft; by/at null |
| 12 | `tds_low_warning` — TDS below range | `tdsPpm < 100 ppm` | WARNING | Check source water and probe calibration before changing anything. | `TBD`; no rule-specific citation | draft; by/at null |
| 13 | `turbidity_critical` — water very cloudy | `turbidity > 5 + 100% = 10` (labelled NTU, not calibrated) | CRITICAL | Check filter operation, remove uneaten food/debris, and perform a partial conditioned-water change. | `TBD`; authoritative unit/source missing | draft; by/at null |
| 14 | `turbidity_warning_filter_off` — cloudy with filter inactive | `turbidity > 5` (unverified NTU) and `filterState == Inactive` | WARNING | Turn the filter back on or determine why it stopped, then recheck after it runs. | `TBD`; authoritative unit/source missing | draft; by/at null |
| 15 | `turbidity_warning_filter_on` — cloudy with filter active | `turbidity > 5` (unverified NTU) and `filterState == Active` | WARNING | Rinse filter media in tank water, remove uneaten food, and reduce feeding. | `TBD`; authoritative unit/source missing | draft; by/at null |
| 16 | `turbidity_warning` — cloudy, filter context unmatched/unknown | `turbidity > 5` (unverified NTU) | WARNING | Remove uneaten food/debris and check the filter. | `TBD`; authoritative unit/source missing | draft; by/at null |
| 17 | `water_level_low_critical` — level far below configured minimum | `waterLevelPercent < 70 − 15% of 70 = 59.5%` | CRITICAL | Check for leaks, prevent filter/heater dry-running, and top up with conditioned water. | `TBD`; formula disputed | draft; by/at null |
| 18 | `water_level_low_warning` — level below minimum | `waterLevelPercent < 70%` | WARNING | Top up with conditioned water and check evaporation or leaks. | `TBD`; no rule-specific citation | draft; by/at null |
| 19 | `power_interruption` — measured mains absent while device remains online | evaluated power state equals `Power Interruption` from `mainsPresent == false` | CRITICAL | Check outlet and breaker; note that filter, light, and feeder may be off until mains returns. | `TBD`; electrical detection/response source missing | draft; by/at null |
| 20 | `power_offline` — power status reports offline | power state equals `Offline` | CRITICAL | Check the aquarium equipment power supply, outlet, and adapter. | `TBD`; current engine cannot reach this state | draft; by/at null |
| 21 | `equipment_fault` — device reports equipment fault | `equipmentStatus == Fault` | CRITICAL | Inspect affected equipment and keep automation off until operation is verified. | `TBD`; feedback semantics missing | draft; by/at null |
| 22 | `equipment_warning` — device reports equipment warning | `equipmentStatus == Warning` | WARNING | Inspect flagged equipment and recheck after correction. | `TBD`; feedback semantics missing | draft; by/at null |
| 23 | `filter_inactive` — installed filtration reports inactive | `filterState == Inactive` when profile does not say filtration is absent | WARNING | Check filter power, flow, blockage, and schedule; first verify it is not intentionally off. | `TBD`; state/flow semantics missing | draft; by/at null |
| 24 | `device_offline` — telemetry silence | scheduled state equals `offline` after >60 s (described as 3 missed sends) | WARNING | Check device power, Wi-Fi, router, and device LED; readings/alerts pause until reconnection. | `TBD`; timeout/severity approval missing | draft; by/at null |
| 25 | `sensor_fault` — explicitly invalid or impossible sensor value | internal event `sensor_fault`; current engine does **not** fire it for an absent optional value | WARNING | Check the named probe connection/calibration and confirm it is connected/submerged. | `TBD`; basis overstates missing-value behavior | draft; by/at null |
| 26 | `cleaning_due_early` — condition-based early cleaning | event after TDS rise ≥30% from post-cleaning baseline **or** turbidity enters warning twice in 24 h | WARNING | Clean now: partial conditioned-water change, rinse filter media, and log the cleaning. | `TBD`; bands/triggers uncited | draft; by/at null |
| 27 | `cleaning_due` — bioload interval elapsed | event after 14 days (light), 10 days (moderate), or 7 days (heavy) since last cleaning/creation | WARNING | Clean the tank: partial conditioned-water change, rinse filter media in tank water, and log it. | `TBD`; bands/intervals uncited | draft; by/at null |

## 5. Contradictions, inconsistencies, and missing scientific requirements

### 5.1 Threshold/formula contradictions

1. **Water-level critical formula:** the current rule is a relative margin, `min − 15% of min` (`scripts/seed/goldfish-draft.json:360-377`; executed by `conditionTarget` at `src/utils/monitoringAssessmentCore.ts:657-667`). At the draft 70% minimum it yields a strict `<59.5%` trigger. `docs/phase2-monitoring-assessment.md:21-29` instead records “at least 10 percentage points below minimum,” which would yield 60% for this profile and would diverge further for other minima. The adviser must choose relative percentage, absolute percentage points, or an explicit fixed threshold, plus inclusive/exclusive behavior.
2. **Temperature critical bands:** current rules use ±10% of each boundary (>26.4 °C and <18 °C). The older Phase 2 contract used an absolute 2 °C margin (and “at least,” implying inclusive boundaries). Formula and boundary semantics conflict.
3. **pH critical bands:** current rules use ±10% of the configured bound (>8.25 and <5.85). The older Phase 2 contract used an absolute 0.5 pH margin (≥8.0/≤6.0 if “at least” is literal). A relative percentage is also difficult to justify for a logarithmic pH scale without an explicit scientific decision.
4. **TDS warning boundary:** the current warning begins strictly above 400 ppm and critical strictly above 500 ppm. Phase 0 recorded older provisional 300/500 ppm logic (`docs/phase0-threshold-recommendation-audit.md:128-137`). Neither set is approved.
5. **All numeric equality boundaries:** current `gt`/`lt` rules leave equality on the less severe side. Approval must state whether equality belongs to NORMAL, WARNING, or CRITICAL for every threshold.
6. **Persistence/debounce:** water-quality rules act on one validated sample. The scientific record does not approve persistence counts/durations or critical confirmation. Alert recovery/cooldown software behavior exists, but it is not a substitute for approving when a condition becomes scientifically actionable.

### 5.2 TDS unit and conversion inconsistencies

- The authoritative rule key and current firmware output are `tdsPpm`; rules are 100-400 ppm. Legacy `tdsPercent`, `waterQualityPercent`, profile `minQuality`, and “TDS purity” UI/history concepts remain in compatibility paths. No approved ppm-to-purity conversion exists. The engine correctly refuses to turn `minQuality` into ppm (`src/utils/monitoringAssessmentCore.ts:600-619`), but validity code can still call a legacy percentage “valid” while no `tdsPpm` exists (`src/utils/monitoringAssessmentCore.ts:183-193`); it then cannot reach ppm threshold evaluation.
- The prepared Aquarium 1 firmware uses a two-point meter-referenced linear estimate: 0.169 V/80 ppm and 1.304 V/314 ppm, without temperature compensation (`firmware/Aquarium1Device/Aquarium1Device.ino:31-41,233-238,326-330`). A separate cold sample was deliberately excluded (`docs/device-contract.md:3-13`). This calibration does not span the configured 400 ppm warning or 500 ppm critical targets.
- `docs/device-contract.md:10-13` says values outside the checked 0.169-1.304 V span are omitted and invalid. The firmware currently extrapolates any finite 0-3.3 V input and publishes the result (`firmware/Aquarium1Device/Aquarium1Device.ino:233-238,708-710`), despite a nearby comment saying only the compared span is published. This is a sensor-validation defect and a blocker. It was not fixed because this task forbids firmware changes.
- Decision required: use ppm only for classification; explicitly mark percent fields display-only/legacy; define whether temperature compensation is required; calibrate across the entire approved decision range; and define handling outside the validated span.

### 5.3 Turbidity ambiguity

- The seed and reports treat numeric turbidity as NTU, with draft limits of 5 and 10. The Aquarium 1 firmware publishes only `turbidityState` (`Clear`/`Cloudy`/`Unknown`) from two observed voltages and explicitly says the midpoint is **not** an NTU threshold (`firmware/Aquarium1Device/Aquarium1Device.ino:27-30,278-283,711-712`). It does not publish the numeric `turbidity` field consumed by the 4 rules.
- A two-sample categorical separator cannot validate 5 NTU/10 NTU rules. The unit, transfer curve, reference standards, useful range, uncertainty, repeatability, fouling/cleaning protocol, temperature sensitivity, and out-of-range behavior are missing.
- Until calibrated numeric NTU is available and the adviser approves the thresholds, the four numeric turbidity rules and the turbidity side of early cleaning cannot activate.

### 5.4 Other rule/measurement ambiguities

- `power_offline` is unreachable in the current engine. `evaluatedPowerStatus()` returns only `Online`, `Power Interruption`, or undefined from `mainsPresent`; device silence is represented separately by `device_offline` (`src/utils/monitoringAssessmentCore.ts:629-638,833-864`). The rule should be disabled/removed or assigned a distinct measurable input before approval.
- `sensor_fault` says a reading that is “missing” triggers the rule, but the engine treats an absent value as unavailable without a fault rule; only explicit invalid flags/malformed/impossible values produce it (`src/utils/monitoringAssessmentCore.ts:799-823`). The adviser/product contract must distinguish an optional/uninstalled sensor, an expected-but-missing sensor, and an explicit sensor fault.
- `filterState` and light state currently describe commanded relay output, not measured flow/light operation; `equipmentStatus` is currently `Unknown` in Aquarium 1 firmware (`firmware/Aquarium1Device/Aquarium1Device.ino:713-715`). Equipment/filter recommendations must not claim physical failure until feedback semantics and hardware are approved.
- The 60-second offline rule is described as three missed sends, but repository targets also mention 15-second sends; 60 seconds is four 15-second intervals after the last sample. The timeout itself is deterministic, but its wording and severity need approval.
- The Goldfish species document bundles water thresholds, bioload bands, cleaning intervals, and early-cleaning triggers under one source/approval. One citation is unlikely to substantiate every bundled claim.
- The manuscript reference list supports the need for monitoring/calibration and gives examples of turbidity/low-level maintenance guidance, but no repository mapping shows which reference supports which boundary, margin, action sequence, or contraindication.

## 6. Exact physical calibration and validation requirements

These are required evidence/procedure fields, not invented calibration values.

| Measurement | Required before rule activation |
|---|---|
| Temperature | Identify both DS18B20 probes and placement; compare each against a traceable/reference thermometer at multiple points spanning the approved low/normal/high decision region; record raw readings, offsets, repeatability, stabilization time, uncertainty/tolerance, date, operator, reference instrument, and pass/fail criteria; approve whether the mean of two valid probes is authoritative and what to do when they disagree or one fails. |
| pH | Perform and record buffer checks spanning the decision region (the current firmware uses pH 4.01, 6.86, 9.18 voltage points); document buffer lot/expiry and temperature, probe conditioning/rinse procedure, ADC/divider setup, fitted curve, slope/offset acceptance, repeatability/drift, recalibration interval, and handling outside the calibrated span; compare against an independent calibrated kit/meter before recommendations. |
| TDS | Use certified/reference solutions or a verified meter at known temperature at enough points to cover the approved normal, warning, and critical region; record conductivity/TDS convention or factor, temperature compensation method/reference temperature, voltage/ppm pairs, curve, residual error, repeatability, valid input span, clipping/dry-probe behavior, recalibration interval, and independent verification. Do not extrapolate or emit ppm outside the validated span. Do not derive purity percent without a separately approved conversion. |
| Turbidity | Select and approve an authoritative unit (normally a calibrated numeric unit if the numeric rules remain); use traceable turbidity standards/verified instrument points spanning all approved boundaries; record optical geometry, ADC voltage, fitted curve, blank/zero, repeatability, uncertainty, temperature/ambient-light effects, sensor cleaning/fouling procedure, valid range, saturation behavior, and recalibration interval. Two observed clear/cloudy samples are insufficient for NTU. |
| Water level | Record final internal tank dimensions and operational volume; verify the sensor mounting/empty reference and blind zone; compare empty, intermediate, threshold-near, and operational-target readings against ruler/known-fill measurements; record target-height formula inputs, mounting offset, repeatability, surface/agitation effects, valid echo count/range, uncertainty near 59.5/60/70%, and profile-sync behavior. Aquarium 1's previously stored 9×10×9 cm/10 L profile is physically impossible (`docs/security/profile-water-level.md:83-104`) and cannot be used. Aquarium 2 requires its own verified contract. |
| Power | Verify sensed `mainsPresent` polarity and thresholds with safe supervised tests for mains present, interruption, ambiguous input, device backup operation, restoration, and noise/debounce. Distinguish measured mains absence from device/Wi-Fi silence. |
| Filter/equipment | Define whether each state is commanded output, electrical feedback, flow/mechanical feedback, or diagnostic result; test each supported state and fault under safe loads; record detection delay, debounce, false-positive behavior, and recovery. A relay command/ack is not proof of physical flow or actuation. |

Every calibration record should identify `aquariumId`, `deviceId`, sensor make/model/serial where available, firmware revision, method revision, operator, date/time, reference instrument/standard, raw observations, fitted conversion, validated range and unit, uncertainty/tolerance, result, and next calibration due date. No such record should be inferred from a software test.

## 7. Existing approval workflow assessment

### What already works

- Only an email-verified platform administrator can save or approve rule/species configuration (`functions/src/ruleAdmin.ts:19-25`). Clients cannot write `species` or `rules` directly (`firestore.rules:767-776`).
- Saves are validated with the same shared contract used by the engine and always reset status to draft, clear approver/date, and write a before/after audit record (`functions/src/ruleAdmin.ts:37-69`).
- Approval revalidates stored content, refuses `TBD`/empty source, writes approver/time, and audits the action (`functions/src/ruleAdmin.ts:72-105`).
- Changes enter the engine only after its five-minute cache refresh. The all-enabled-rules gate fails closed, so partial approval cannot leak a subset into live water assessment.
- The editor offers preview/export without saving or approving (`src/views/RulesEditor.tsx:283-340`).

### Scientific-governance gaps

- A “citation” is currently only any string of at least three characters other than `TBD` (`src/utils/monitoringAssessmentCore.ts:1237-1240`). Its existence, relevance, page/table/section, and exact supported claim are not validated.
- Approval contains no immutable version/revision, content hash, effective date, review role, review notes, superseded version, calibration prerequisite, or evidence attachment/reference.
- Rule validation is local to one document. It does not verify that a `ref: min/max` exists in the approved species document, that unit and parameter agree, that warning/critical rules cover the needed sides without gaps/contradictions, or that the cited species revision is the one reviewed with the rule.
- The single Goldfish approval covers unrelated scientific claims (water ranges, bioload, cleaning intervals, early triggers) and one `source` string.
- Approval authority is “platform Admin,” not an explicitly authorized scientific reviewer/adviser. The workflow can record an adviser-approved decision only if the administrator enters evidence and approval under a documented delegation; it cannot prove adviser review by itself.
- There is no batch/release object. The all-or-nothing gate is safe, but activation is the emergent result of all individual documents becoming approved after cache refresh rather than an explicit signed release.
- Aquarium-specific overrides have no approval path and are intentionally excluded from live backend thresholds (`functions/src/telemetryIngest.ts:180-183`).

Conclusion: **no new database service, collection, or deployment infrastructure is needed for the current global review**, but the stored approval contract must be strengthened before claiming scientific approval. Aquarium-specific overrides need a minimal extension to the existing callable/audit workflow before they can become authoritative.

## 8. Exact proposed approval-contract changes (not implemented)

### 8.1 Global species and rule documents

Retain the existing fields and add the following server-managed review snapshot:

```ts
review: {
  status: 'draft' | 'approved';
  revision: number;                 // increments on every content change
  contentHash: string;              // canonical hash of reviewed scientific content
  approvalReference: string;        // adviser memo/minutes/form identifier
  evidence: Array<{
    sourceId: string;               // bibliography/DOI/document identifier
    locator: string;                // page, table, section, or calibration-record ID
    supports: string[];             // exact fields/claims supported
  }>;
  reviewedBy: string | null;        // adviser/scientific reviewer identity
  reviewedAt: number | null;
  approvedBy: string | null;        // platform admin who records activation
  approvedAt: number | null;
  effectiveFrom: number | null;
  reviewNotes: string;
}
```

Minimum rules:

1. Any scientific-content edit increments `revision`, changes `contentHash`, and resets `review.status`, reviewer, approver, and dates to draft/null.
2. Approval requires at least one evidence entry whose `supports` covers every scientific field being approved, plus an adviser approval reference. A generic non-`TBD` string is insufficient.
3. A rule using `ref: min/max` records the reviewed Goldfish species `revision` and cannot activate against a different revision.
4. Units are explicit data (`°C`, `pH`, `ppm`, approved turbidity unit, `% operational target`, or an enumerated state), not inferred only from parameter names/UI labels.
5. Persistence/confirmation/recovery semantics and boundary inclusivity are reviewable fields, even when the selected values preserve current software behavior.
6. The live gate continues to require the species and every enabled rule to be approved. No automatic migration of existing draft metadata is allowed.

This can be implemented by extending the existing validators, `saveRuleConfig`/`approveRuleConfig` callables, audit details, editor display, and engine normalizers. It does not require a duplicate rule service.

### 8.2 Aquarium-specific threshold overrides

Keep the existing numeric map but add one server-managed sibling snapshot:

```ts
thresholdOverrides: {
  temperatureC?: { min?: number; max?: number };
  ph?: { min?: number; max?: number };
  tdsPpm?: { min?: number; max?: number };
  turbidity?: { min?: number; max?: number };
  waterLevelPercent?: { min?: number; max?: number };
};

thresholdOverridesReview: {
  status: 'draft' | 'approved';
  revision: number;
  contentHash: string;
  aquariumId: string;
  speciesId: string;
  baseSpeciesRevision: number;
  units: Record<string, string>;
  rationale: string;
  approvalReference: string;
  evidence: Array<{ sourceId: string; locator: string; supports: string[] }>;
  reviewedBy: string | null;
  reviewedAt: number | null;
  approvedBy: string | null;
  approvedAt: number | null;
  effectiveFrom: number | null;
  updatedBy: string;
  updatedAt: number;
};
```

Required behavior:

- Owners may propose values only if that remains an approved product requirement; they cannot write approval fields. Any value change resets review to draft.
- A platform-admin callable validates aquarium authorization, selected approved species revision, units, bounds, rationale/evidence, and writes the audit record. Reuse existing trusted callables and `audit_logs`; do not add a duplicate collection/service.
- Live resolution applies an override only when its review is approved, its hash matches the current values, its `aquariumId` matches the document, and `speciesId/baseSpeciesRevision` match the selected approved species. Otherwise it uses approved species defaults and records the override as preview-only/pending.
- Profile fields `minTemp`, `maxTemp`, `minPh`, `maxPh`, `minLevel`, and `minQuality` never silently become approved overrides. A deliberate reviewed conversion is required.
- Changing the selected species, base species revision, or override values invalidates the override approval.

Missing today: all of the review fields above, explicit units, rationale/applicability, base-species linkage, immutable revision/hash, reviewer identity, evidence locator, effective date, and a server-authoritative save/approve transition.

## 9. Minimum necessary implementation changes

No application-code change is necessary in this review step to keep draft rules from generating live classifications or actionable recommendations; the current gate and its focused tests already enforce that.

One approval-review defect was fixed locally: the Rules Editor export omitted the stored early-cleaning TDS percentage, turbidity count, and time window even though approving the Goldfish document also approves those values. The existing matrix exporter now includes that row in both shared code copies, with one focused regression test. This does not change evaluation, approval status, Firebase data, or runtime activation.

Before eventual activation, the minimum safe changes are:

1. Resolve and record the scientific decisions/calibration below; update only the seed/config values and wording that the adviser changes.
2. Strengthen the existing approval metadata/validators/callables as described in §8, reusing the editor, Cloud Functions, audit logs, and collections.
3. Add the override review snapshot and server-authoritative approval transition before allowing overrides into `resolveThresholds()` on the live backend.
4. Disable or redefine `power_offline`; reconcile `sensor_fault` wording with missing-value behavior.
5. In a separately authorized firmware task, stop publishing extrapolated TDS outside its validated span and provide calibrated numeric turbidity only if the numeric turbidity rules are retained.
6. Update/add focused tests only for the changed contract: edits reset review; invalid/mismatched evidence/revisions cannot approve; partial global approval remains unavailable; draft/mismatched overrides are ignored; approved matching overrides apply aquarium-locally; firmware contract rejects out-of-span TDS.

No mobile/firmware modification, dependency, deployment, merge, or production-data change belongs in this Step 2 review.

## 10. Adviser scientific review checklist

- [ ] Confirm current prototype scope: small freshwater Goldfish aquariums; no fish-health/disease diagnosis; no automatic chemical pH adjustment.
- [ ] For each Goldfish range, record source identifier and exact page/table/section supporting the value and unit.
- [ ] Approve temperature, pH, TDS, turbidity, and water-level NORMAL boundaries.
- [ ] Approve WARNING and CRITICAL formulas as relative %, absolute unit margins, percentage points, or fixed thresholds.
- [ ] Explicitly approve equality/inclusivity at every boundary.
- [ ] Decide single-sample vs persistence/confirmation requirements and sampling-rate assumptions for every water parameter.
- [ ] Approve recovery, debounce, and reopen semantics separately from notification cooldown.
- [ ] Confirm ppm as the only TDS classification unit or approve an explicit, validated conversion; designate legacy percentages display-only or remove them from decision paths.
- [ ] Approve turbidity unit and calibration method before approving numeric turbidity limits.
- [ ] Review and accept calibration records for each physical sensor/device and aquarium geometry.
- [ ] Approve the water-level critical formula and resolve the 15%-of-min vs 10-percentage-point conflict.
- [ ] Approve the bioload g/L formula, light/moderate/heavy bands, required profile data, and behavior when weights/volume are missing.
- [ ] Approve cleaning intervals and early-cleaning TDS/turbidity triggers.
- [ ] Review each of the 27 actions for order, urgency, safe wording, pre-check, prohibited automation, and applicability to Goldfish.
- [ ] Decide whether `power_offline` is removed/disabled or mapped to a distinct measurable state.
- [ ] Define expected-but-missing sensor behavior separately from optional/uninstalled sensors and explicit sensor faults.
- [ ] Define filter/equipment feedback semantics; do not equate a commanded relay state with verified operation.
- [ ] Approve device-offline timeout and severity and correct the “3 missed sends” wording if necessary.
- [ ] Confirm how multiple simultaneous parameter severities produce overall condition (current implementation uses the most severe assessed non-device parameter/status).
- [ ] For every approved item, record reviewer identity/date, administrator activation identity/date, revision/hash, evidence locator, and effective date.
- [ ] Review the final exported matrix against the exact Firestore content before authorization to activate.

## 11. Remaining blockers before live prescriptive recommendations

1. No rule or Goldfish configuration has a rule-specific scientific source or adviser approval.
2. Water-level, temperature, and pH critical formulas conflict with older documented formulas; boundary inclusivity is unapproved.
3. TDS classification units conflict with legacy percentage fields; current calibration does not span warning/critical thresholds and firmware extrapolates outside its checked span.
4. Turbidity has no authoritative calibrated numeric unit/input; current firmware emits categorical state only.
5. Physical calibration/accuracy, power sensing, equipment feedback, filtration flow, and water-level geometry are not verified.
6. Bioload bands, cleaning intervals, and early-cleaning triggers are uncited drafts.
7. `power_offline`, `sensor_fault` missing-value wording, and offline-count wording need contract decisions.
8. Approval records are not versioned/evidence-mapped, and platform Admin is not explicitly a scientific-review role.
9. Aquarium-specific overrides lack approval metadata and must remain excluded from live assessment.
10. Final approved configuration must pass focused unit/Functions/emulator tests and then staged physical hardware verification. Software tests cannot establish biological suitability or sensor accuracy.

Until every blocker that applies to an enabled rule is resolved, keep the Goldfish document and all affected rules in `draft`. Do not approve, seed as approved, deploy, or alter production data.
