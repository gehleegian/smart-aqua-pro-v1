# SmartAqua Pro Step 3: Scientific Validation Evidence Package

Date: 2026-11-10 (Asia/Manila)

Status: **adviser-review draft only**. This report does not approve or activate a species configuration, rule, threshold, recommendation, firmware path, deployment, or production record. All 27 rules and the Goldfish configuration remain `draft`.

## 1. Review conclusion

The 27 configured rules are not equally supported.

- The current Goldfish pH range, **6.5-7.5**, is directly stated as ideal by both a scientific animal-welfare handbook and RSPCA Australia. Temperature guidance differs among credible sources: RSPCA Australia directly states the configured **20-24 °C** as ideal, while the UFAW handbook and a Southern Regional Aquaculture Center (SRAC) publication state approximately **18-24 °C**. These sources support alternative ideal operating ranges in their respective contexts; none validates SmartAqua Pro's WARNING/CRITICAL labels, single-sample policy, or relative critical margins. The adviser must resolve the 18-versus-20 °C lower boundary for the scoped prototype rather than treating either as uniquely established.
- The temperature critical limits (**<18 °C** and **>26.4 °C**) are not supported as critical boundaries. Published goldfish thermal-tolerance work shows strong acclimation dependence and tolerance well beyond those values. It must not be converted into a husbandry target, but it demonstrates that `10%` beyond an ideal-range boundary is not a defensible biological definition of CRITICAL.
- The pH critical limits (**<5.85** and **>8.25**) are unsupported. A percentage margin is especially inappropriate without justification because pH is logarithmic. The available goldfish source describes tolerance from pH 5 to 9, which also conflicts with calling 8.25 or 5.85 intrinsically critical on one sample.
- No reviewed source validates **100-400 ppm TDS**, **500 ppm TDS as CRITICAL**, **5/10 NTU**, **70/59.5% water level**, **1/3 g/L bioload bands**, **7/10/14-day cleaning intervals**, a **30% TDS rise**, or **two turbidity warnings in 24 hours** for a small indoor Goldfish aquarium. These remain proposed engineering or husbandry decisions, not source-supported scientific values.
- The actions to confirm readings, make small/partial conditioned-water changes, avoid abrupt temperature/chemistry changes, maintain filtration, and rinse filter media in removed aquarium water have authoritative husbandry support. That support does **not** validate the configured trigger or severity that invokes each action.
- The prepared software can evaluate temperature, pH, water-level, device-heartbeat, and some invalid-reading events, but all physical measurements still require calibration and hardware verification. TDS does not span the configured decision region; turbidity is categorical rather than numeric; filter state is commanded relay state rather than measured flow; equipment status is `Unknown`; the live-device contract says mains status is not yet sent; and `power_offline` is unreachable in the current evaluator.

The defensible next step is adviser selection of explicit operating boundaries and engineering policies, followed by physical calibration over every approved decision boundary. There is no scientific basis to activate the current 27-rule set as-is.

## 2. Review method and evidence labels

The exact configured values, comparison operators, action text, and draft metadata were taken from `scripts/seed/goldfish-draft.json`. Executed formulas and sensor reachability were checked against the shared assessment core, prepared Aquarium 1 firmware, `docs/device-contract.md`, and the Step 2 audit. External evidence was accepted only where the source owns or scientifically supports the claim.

Scope note: none of the 27 existing rules evaluates ammonia, and the prepared firmware does not publish an ammonia measurement. The project instructions list ammonia within the intended monitoring scope, while `docs/hardware/esp32-firebase-interface-contract.md` records a conflicting accepted-outline decision that excludes it. This review does not invent an ammonia threshold or add a 28th rule; the developer/adviser must resolve that documented scope conflict separately before the system is described as covering every intended monitored parameter.

Evidence labels in this report mean:

- **Direct** — the source concerns Goldfish and states the parameter/range or action being discussed.
- **Supporting** — the source supports the measurement method or general husbandry action, but not the configured Goldfish threshold/severity.
- **Engineering** — a project policy such as timeouts, state semantics, geometry, persistence, or escalation. Scientific literature may explain why it matters, but an adviser/product decision is still required.
- **Unsupported** — no reviewed source supports the configured value or the source evidence contradicts/does not reach it.

Tolerance, survival, production, and ideal companion-animal husbandry ranges are not interchangeable. A value observed in drinking-water regulation, wild invasive populations, larval culture, or a different aquaculture system was not treated as a Goldfish aquarium threshold.

## 3. Authoritative evidence register

| ID | Source and exact supporting location | What it supports | Limitation for SmartAqua Pro |
|---|---|---|---|
| S1 | Brown, Wolfenden & Sneddon, [“Goldfish (*Carassius auratus*)”](https://doi.org/10.1002/9781119333708.ch23), *Companion Animal Care and Welfare: The UFAW Companion Animal Handbook* (2018), §23.2.2 “Environment,” pp. 469-470, Table 23.1. | Table 23.1 states ideal aquarium conditions of pH 6.5-7.5 and 18-24 °C. The surrounding text recommends small, frequent water changes, parameter testing, and dechlorination rather than total water replacement. | It does not define WARNING/CRITICAL severities, percentage margins, persistence, TDS, NTU, water-level percentages, or cleaning intervals. The full table is paywalled at Wiley; the DOI and book metadata are verifiable, and the cited pages/section must be checked from the adviser/library copy.
| S2 | Watson, Hill & Pouder, [SRAC Publication 7201, “Species Profile: Koi and Goldfish”](https://extension.rwfm.tamu.edu/wp-content/uploads/sites/8/2013/09/SRAC-Publication-No.-7201-%E2%80%93-Species-Profile-Koi-and-Goldfish.pdf), “Culture systems” section, pp. 2-3. | Calls about 65-75 °F (18-24 °C) optimal; says changes outside the range may affect growth/feeding and should be gradual; says pH should be close to 7 while 5-9 may be tolerated; explains filtration of particles and ammonia in recirculating systems. | Production guidance is not a severity standard for a small companion aquarium. Its broad tolerance range cannot be used as an ideal target.
| S3 | Ford & Beitinger, [“Temperature tolerance in the goldfish, *Carassius auratus*”](https://doi.org/10.1016/j.jtherbio.2004.09.004), *Journal of Thermal Biology* 30 (2005), abstract and Materials and Methods. | Critical thermal minima/maxima depended strongly on acclimation; fish were acclimated at 5, 15, 25, and 35 °C. This establishes acclimation dependence and distinguishes thermal tolerance from an ideal husbandry range. | Critical thermal methodology measures tolerance endpoints, not safe day-to-day aquarium thresholds. It does not approve any SmartAqua severity.
| S4 | Imanpoor, Najafi & Kabir, [“Effects of different salinity and temperatures on the growth, survival, haematocrit and blood biochemistry of Goldfish”](https://doi.org/10.1111/j.1365-2109.2011.02832.x), *Aquaculture Research* 43 (2012), abstract. | In a 45-day study, 23 and 27 °C did not significantly affect specified growth measures, while 31 °C affected several measures. It is evidence against assuming 26.4 °C is universally “critical.” | Salinity and culture conditions differ; this is not a companion-aquarium threshold study and does not establish a safe upper limit.
| S5 | U.S. Geological Survey, [“pH and Water”](https://www.usgs.gov/water-science-school/science/ph-and-water), “The pH scale” and “Importance of pH.” | pH is logarithmic; one pH unit represents a tenfold change in hydrogen-ion activity. | General water science, not a Goldfish range. It invalidates an unexplained percentage-margin assumption; it does not supply replacement bounds.
| S6 | U.S. Geological Survey, [National Field Manual §6.4.2, “Calibration”](https://pubs.usgs.gov/twri/twri9a6/twri9a64/twri9a_Section6.4.pdf). | Requires two buffers bracketing anticipated pH, temperature correction, performance records, and manufacturer procedures. | A field-method standard, not proof that the installed probe meets it or that the configured thresholds are biologically appropriate.
| S7 | U.S. EPA, [Method 160.1, “Residue, Filterable (Gravimetric, Dried at 180 °C)”](https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=30000Q10.TXT), §§1-2 and 8. | Defines laboratory TDS operationally as filtered residue dried to constant mass and reported in mg/L. | The project sensor estimates TDS from electrical response; it does not perform Method 160.1. “ppm” is approximately mg/L for dilute water but method and conversion must be declared.
| S8 | McCleskey et al., [“Salinity and total dissolved solids measurements for natural waters”](https://doi.org/10.1016/j.scitotenv.2023.164385), *Science of the Total Environment* (2023), abstract; and USGS [specific-conductance field method](https://doi.org/10.3133/twri09A6.3). | TDS is method-defined; salinity and TDS are not equivalent for most waters. Specific conductance depends on dissolved-substance type/quantity and temperature and can be a surrogate only through a validated relationship. | Does not give Goldfish TDS limits. It supports sample-specific calibration and temperature handling, not 100/400/500 ppm.
| S9 | U.S. EPA, [Method 180.1, “Determination of Turbidity by Nephelometry”](https://www.epa.gov/sites/default/files/2015-08/documents/method_180-1_1993.pdf), §§1.0-4.0, 7.0, 9.0 and 12.0. | Defines NTU through specified optical geometry and comparison with primary standards; requires calibration/QC; identifies bubble, debris, color, and light-absorbing interferences. | A raw voltage or two observed clear/cloudy samples is not an NTU measurement. The method supplies no Goldfish 5/10-NTU thresholds.
| S10 | U.S. Geological Survey, [National Field Manual §6.7, “Turbidity”](https://pubs.usgs.gov/twri/twri9a6/twri9a67/twri9a_Section6.7_v2.1.pdf), §6.7.1.B and §6.7.2; and [§6.8 multiparameter guidance](https://pubs.usgs.gov/publication/tm9A6.8/full), Table 6.8-3. | Reporting units depend on instrument design; NTU and FNU instruments can disagree on environmental samples; standards, method codes, range bracketing, and calibration records are necessary. | Does not supply aquarium action thresholds. It demonstrates that the UI's unconditional `NTU` label is premature.
| S11 | RSPCA, [“Choosing an aquarium for pet fish”](https://science.rspca.org.uk/en/web/rspca/adviceandwelfare/pets/fish/environment), “Aquarium filters” and “Water changes.” | Filters are necessary; partial changes dilute accumulated waste; filter media should be swished in removed aquarium water, not tap water; replacement water should be dechlorinated and temperature matched; rapid temperature changes should be avoided. | Husbandry guidance supports actions, not TDS/turbidity triggers, severity, bioload bands, or the 7/10/14-day schedule. The page gives routine water-change guidance that should be reconciled with any project schedule.
| S12 | NC State College of Veterinary Medicine, [“Dealing With Aquariums and Ponds During Power Outages”](https://cvm.ncsu.edu/news/dealing-with-aquariums-and-ponds-during-power-outages/), “Aquarium” guidance. | Explains that filtration/aeration loss can degrade water quality and gives monitoring/partial-change advice during prolonged outages. | It does not say that every detected mains interruption is instantly CRITICAL, or define a timeout. Severity and timing remain engineering decisions.
| S13 | Saxby et al., [“Growth Rate and Body Condition in Relation to Group Size in Black Widow Tetras and Common Goldfish”](https://doi.org/10.1093/jn/136.7.2078S), *Journal of Nutrition* 136 (2006), expanded abstract. | Stocking density can affect water quality and growth, but the paper stresses limited ornamental-aquarium evidence and context dependence. | It does not validate the project's biomass bands of 1 and 3 g/L or map them to cleaning intervals.
| S14 | UK statutory guidance, [“Selling animals as pets: statutory guidance”](https://www.gov.uk/government/publications/animal-activities-licensing-guidance-for-local-authorities/selling-animals-as-pets-licensing-statutory-guidance-for-local-authorities--2), “Temperature ranges of ornamental fish” and temperature-control requirements. | Requires species-appropriate, stable temperatures; changes should be gradual; excessive heat/light exposure should be avoided; supplementary aeration may be needed at high temperature. | Retail licensing guidance gives a broad 4-25 °C range for aquarium goldfish, not SmartAqua normal or severity bounds. It also demonstrates variation among credible guidance.
| S15 | RSPCA Australia, [“How should I care for my goldfish?”](https://kb.rspca.org.au/categories/companion-animals/fish/how-should-i-care-for-my-goldfish) (updated 1 May 2024), “Water quality” / “Ideal water parameters,” and “Tank maintenance.” | Directly states pH 6.5-7.5 and temperature 20-24 °C as ideal. Recommends weekly 10-25% partial water changes, conditioned replacement water, and light filter rinsing in tank water when clogged or monthly. | Authoritative husbandry guidance, not a peer-reviewed threshold experiment. It does not define SmartAqua severity, persistence, critical margins, TDS, turbidity, or water-level limits; its 20 °C lower temperature boundary conflicts with the 18 °C ideal boundary in S1/S2.
| S16 | Repository evidence: `docs/step2-scientific-rule-review.md`, `docs/device-contract.md`, `docs/bioload.md`, `firmware/Aquarium1Device/Aquarium1Device.ino`, and `src/utils/monitoringAssessmentCore.ts`. | Exact configured values, rule execution, validation behavior, present device payload, calibration notes, and reachability. | Evidence of implementation only; it cannot establish biological suitability or physical accuracy.

## 4. Goldfish configuration evidence matrix

| Configuration item | Current draft value | Evidence assessment | Proposed disposition for adviser review |
|---|---:|---|---|
| Temperature normal range | 20-24 °C | **Directly supported but contradicted by other credible guidance.** S15 states 20-24 °C as ideal; S1/S2 state 18-24 °C; S14 gives a broader 4-25 °C retail range. | The configured range is a source-supported candidate, not uniquely established science. Adviser must choose 18 or 20 °C as the scoped lower bound based on source context, strain/life stage, and prototype objectives. Do not change or approve automatically.
| pH normal range | 6.5-7.5 pH | **Directly supported as ideal** by S1. S2 says close to 7 and describes 5-9 only as tolerated. | Retain as a scientifically cited candidate. Adviser must still approve equality, persistence, calibration tolerance, and severity outside the range.
| TDS normal range | 100-400 ppm | **Unsupported.** S7-S8 define measurement and calibration issues but provide no Goldfish limits. No reviewed Goldfish source validates this range. | Do not approve. Decide whether TDS is a calibrated trend/process indicator rather than a stand-alone biological classifier. Require a Goldfish-specific source before numeric classification.
| Turbidity maximum | 5, displayed as NTU | **Unsupported and not presently measurable.** S9-S10 require a defined optical method and standards. Firmware emits categorical state only. | Remove the `NTU` claim until a compliant numeric method is selected and calibrated. Keep numeric rules draft/disabled unless an adviser approves both the method and a Goldfish-relevant limit.
| Minimum water level | 70% of operational target | **Engineering only.** No biological source can define a universal percentage because risk depends on sensor reference, tank geometry, intake/heater elevations, and operating volume. | Derive warning/critical heights from verified Aquarium 1/2 geometry and equipment safe-operating elevations, then convert to percent. Record uncertainty and inclusive boundaries.
| Bioload bands | light <=1; moderate <=3; heavy >3 g/L | **Unsupported as configured.** S13 supports context dependence, not these bands. | Keep draft. Require adviser selection tied to adult size/strain, filtration capacity, oxygenation, feeding, and working volume. Do not infer bands from fish count alone.
| Cleaning intervals | 14/10/7 days | **Unsupported as bioload bands.** S1 says frequency depends on measured water quality; S15 directly recommends weekly 10-25% partial changes for Goldfish, and S11 also supports routine partial changes. None validates 14/10/7 days selected by the project's biomass categories. | Consider S15's weekly partial-change guidance as a directly supported routine candidate, but require adviser reconciliation with water tests and the project scope. Do not present current graduated intervals as scientifically derived.
| Early-cleaning TDS trigger | >=30% rise | **Unsupported and calibration-blocked.** | Keep draft. If retained, define reference method, baseline stability, minimum absolute change, sensor uncertainty, persistence, and evidence that the action is appropriate.
| Early-cleaning turbidity trigger | 2 WARNING events in 24 h | **Unsupported and measurement-blocked.** | Keep draft. First establish numeric/categorical turbidity semantics; then adviser must approve count, window, hysteresis, and action.

## 5. Complete 27-rule scientific evidence matrix

The thresholds below are the exact current strict comparisons. Equality does not trigger a `gt`/`lt` rule.

| # | Rule; supported parameter and unit | Current threshold / severity | Current recommended action | Scientific basis and evidence status | Proposed correction or decision |
|---:|---|---|---|---|---|
| 1 | `temp_high_critical`; water temperature, °C | `>26.4 °C`; CRITICAL | Remove heat/direct sun, increase aeration/ventilation, cool gradually; conditioned slightly cooler water if changing | S1-S2 support 18-24 °C as ideal; S11/S14 support avoiding abrupt change and heat; S14 supports aeration at high temperature. **The action is supported; 26.4 and CRITICAL are not.** S3-S4 show acclimation/context and do not identify 26.4 as critical. | Replace relative `+10%` with an adviser-approved absolute threshold and persistence/confirmation rule. Keep draft meanwhile.
| 2 | `temp_low_critical`; water temperature, °C | `<18 °C`; CRITICAL | Check room/heater and warm gradually | S1-S2 put 18 °C at their lower ideal boundary; S15 puts 20 °C at its lower ideal boundary; neither identifies the first value below 18 °C as critical, and S14 allows a wider range. Gradual change is supported. **Severity is unsupported.** | Do not label the first reading below 18 °C CRITICAL without direct welfare evidence. Set an explicit absolute threshold, duration, and acclimation context.
| 3 | `temp_high_warning`; water temperature, °C | `>24 °C`; WARNING | Check heat/light/ventilation and cool gradually | S1-S2 directly support 24 °C as the upper ideal boundary. The warning label and one-sample policy are engineering choices. | Strong candidate for an out-of-ideal-range warning, subject to calibration tolerance, equality, persistence, and adviser approval.
| 4 | `temp_low_warning`; water temperature, °C | `<20 °C`; WARNING | Check room/heater and warm gradually | S15 directly supports 20 °C as its lower ideal boundary, while S1-S2 use 18 °C. The threshold is source-supported but **scientifically uncertain because authoritative guidance conflicts**; WARNING severity and one-sample behavior are engineering choices. | Adviser must choose the scoped lower bound and document why. Retain `<20 °C` only if S15's husbandry context is adopted; use `<18 °C` only if S1/S2's context is adopted.
| 5 | `ph_high_critical`; pH, pH units | `>8.25`; CRITICAL | Confirm calibration; check source/decor/substrate; partial conditioned-water change; no automatic dosing | S1 supports 7.5 as ideal maximum and S2 says 5-9 may be tolerated. S5 shows pH is logarithmic. General confirmation/gradual partial-change action is supported by S6/S11. **The 10% margin and critical label are unsupported and potentially contradictory.** | Remove percentage margins for pH. Adviser must select an absolute bound, confirmation/persistence, and action with alkalinity/source-water context.
| 6 | `ph_low_critical`; pH, pH units | `<5.85`; CRITICAL | Confirm; partial conditioned-water change; remove debris/check filter; no automatic dosing | S1 supports 6.5 as ideal minimum; S2 describes tolerance to pH 5. S5 invalidates an unexplained linear percentage margin. **Threshold/severity and claim that falling pH “often” means waste are not established by the mapped evidence.** | Use an explicit, cited pH bound and require confirmation. Separate low-pH diagnosis from waste/filtration advice unless supporting context is measured.
| 7 | `ph_high_warning`; pH, pH units | `>7.5`; WARNING | Confirm; check source; partial conditioned-water change; avoid rapid change | S1 directly supports 7.5 as ideal upper boundary. S6 supports calibration; S11 supports partial, matched changes. Severity/persistence remain engineering. | Defensible candidate as “outside cited ideal range,” not yet an approved biological warning. Define equality and confirmation.
| 8 | `ph_low_warning`; pH, pH units | `<6.5`; WARNING | Confirm; remove debris; partial conditioned-water change | S1 directly supports 6.5 as ideal lower boundary. Debris removal is general husbandry, not a demonstrated cause of every low-pH event. | Keep action conditional: confirm pH and source/alkalinity first. Adviser approves threshold, persistence, and context.
| 9 | `tds_high_critical`; estimated TDS, ppm (nominally mg/L) | `>500 ppm`; CRITICAL | Partial change, remove debris, reduce feeding, check cleaning | S7-S8 show TDS is method-dependent and conductivity-derived TDS needs a validated relationship. No Goldfish source supports 500 ppm or CRITICAL. The familiar 500-mg/L drinking-water value is not a fish threshold and must not be reused. TDS does not identify whether the dissolved material is waste or benign minerals. | Keep draft/disabled. Require Goldfish-specific evidence and full-range calibration; otherwise use TDS only as a contextual trend with confirmed ammonia/nitrite/nitrate and source-water data.
| 10 | `tds_high_warning_heavy_bioload`; estimated TDS, ppm plus biomass density, g/L | `>400 ppm` and `>3 g/L`; WARNING | Partial change, reduce feeding, review stocking | Both numeric premises are unsupported (S8, S13). The combined condition does not become scientific by combining two draft values. | Keep draft/disabled. Approve TDS and bioload definitions independently before reviewing the compound rule.
| 11 | `tds_high_warning`; estimated TDS, ppm | `>400 ppm`; WARNING | Partial change and review feeding | No Goldfish-specific support for 400 ppm. Partial changes are general husbandry (S1/S11), not evidence that 400 ppm requires this action. | Same as rule 9; do not activate from the present calibration.
| 12 | `tds_low_warning`; estimated TDS, ppm | `<100 ppm`; WARNING | Check source water and calibration | No Goldfish-specific support for 100 ppm. The cautious action is a measurement check rather than a maintenance intervention and is reasonable engineering. | Treat as a diagnostic/calibration event only if the adviser approves a device/reference range; do not classify Goldfish condition from it.
| 13 | `turbidity_critical`; turbidity, labelled NTU | `>10`; CRITICAL | Check filter, remove food/debris, partial change | S9-S10 require standards and method-specific units; no numeric input currently exists. No reviewed Goldfish source supports 10 NTU or CRITICAL. S11 supports filtration/debris actions generally. | Keep draft/disabled. Establish calibrated numeric units and a relevant biological/husbandry threshold before severity review.
| 14 | `turbidity_warning_filter_off`; turbidity, labelled NTU plus filter command state | `>5` and `filterState=Inactive`; WARNING | Turn filter on/find cause; recheck | The 5-NTU trigger is unsupported/unmeasurable. S11 supports filtration importance, but current `filterState` is commanded relay state, not measured flow. | Do not claim the filter “stopped.” If retained, say “commanded inactive” and require measured flow/feedback before fault wording.
| 15 | `turbidity_warning_filter_on`; turbidity, labelled NTU plus filter command state | `>5` and `filterState=Active`; WARNING | Rinse media in tank water, remove food, reduce feeding | Numeric trigger unsupported. S11 directly supports rinsing media in removed aquarium water. `Active` does not prove flow, clogging, or excess waste. | Preserve the supported media-rinse wording only after visual/measurement confirmation; remove causal claims not established by feedback.
| 16 | `turbidity_warning`; turbidity, labelled NTU | `>5`; WARNING | Remove food/debris and check filter | Numeric trigger/unit unsupported. General action supported by S11. | Same calibration/evidence blocker as rules 13-15.
| 17 | `water_level_low_critical`; operational-target water level, % | `<59.5%` (`70 - 15% of 70`); CRITICAL | Check leaks/dry-running; conditioned top-up | No universal scientific percentage. This is equipment/tank engineering. It also conflicts with the older “10 percentage points below minimum” rule (60%). | Replace relative margin with explicit measured heights based on intake/heater/sensor geometry and uncertainty. Adviser chooses whether 60%, 59.5%, or another value; current evidence supports none.
| 18 | `water_level_low_warning`; operational-target water level, % | `<70%`; WARNING | Top up and check evaporation/leaks | Conditioned replacement water is supported generally (S1/S11); 70% is unsupported and may not mean the same physical depth across tanks. | Define aquarium/device-specific safe operating height and calibrated conversion. Keep draft until geometry is verified.
| 19 | `power_interruption`; measured mains presence, boolean/state | `mainsPresent=false` while device online; CRITICAL | Check outlet/breaker; equipment may be off | S12 supports the importance of filtration/aeration loss during an outage. The Boolean event is engineering-measurable, but immediate CRITICAL severity and equipment consequence depend on backup, outage duration, temperature, stocking, and actual equipment feedback. | Define detection debounce, duration tiers, backup assumptions, recovery, and affected-equipment feedback. Use “may” wording. Physical verification required.
| 20 | `power_offline`; power state string | `power=Offline`; CRITICAL | Check equipment power/outlet/adapter | **Unreachable:** current evaluator derives only `Online`, `Power Interruption`, or unavailable from mains input; silence is handled by rule 24. No separate measurement is defined. | Disable/remove, or define a distinct authoritative input and semantics. Do not approve as-is.
| 21 | `equipment_fault`; equipment diagnostic state | `equipmentStatus=Fault`; CRITICAL | Inspect; keep automation off until verified | General safe response is reasonable engineering, but firmware reports `Unknown` and no physical fault feedback semantics exist. No specific equipment, diagnostic, or severity mapping is defined. | Define device-specific feedback/fault codes and safe-state behavior, then test physically. Keep draft/disabled.
| 22 | `equipment_warning`; equipment diagnostic state | `equipmentStatus=Warning`; WARNING | Inspect and recheck | Same missing semantics/measurement as rule 21. | Define enumerated causes and measured evidence before approval.
| 23 | `filter_inactive`; filter state string | `filterState=Inactive`; WARNING | Check power, flow, blockage, schedule | S11 supports continuous maintained filtration. Current state describes relay command, not flow; scheduled/manual intentional off can match. | Rename basis to commanded state, exclude intentional schedules, or add independent flow/electrical feedback. Do not infer mechanical failure.
| 24 | `device_offline`; telemetry age/state | `>60 s` or `online=false`; WARNING | Check power/Wi-Fi/router/LED; readings pause | A deterministic software availability rule, not a biological threshold. At a 15-s send interval, “>60 s” represents four expected send opportunities after the last reading, not three. Network silence cannot distinguish power, Wi-Fi, firmware, or server failure. | Correct wording; adviser/product owner approves timeout, debounce, and severity. The server-side measurement path is otherwise available.
| 25 | `sensor_fault`; validity/internal event | explicit invalid/malformed/impossible value; WARNING | Check named probe connection/calibration/submersion | S6, S9-S10 support calibrated measurement practice. Current engine does not fire this event for every absent optional value, so the basis text overstates “missing.” This is a device-data-quality rule, not water quality. | Change basis to explicit invalid/impossible/required-but-invalid inputs. Define expected-but-missing separately from optional/uninstalled sensors.
| 26 | `cleaning_due_early`; maintenance event from TDS/turbidity | TDS rise >=30% or 2 turbidity warnings/24 h; WARNING | Partial conditioned-water change, rinse media, log | S1/S11 support the maintenance actions. No source supports either trigger; both inputs are calibration-blocked. | Keep draft/disabled. Approve each trigger, uncertainty, baseline, persistence, and action independently after measurement capability exists.
| 27 | `cleaning_due`; maintenance time from biomass bands | 14/10/7 days; WARNING | Partial conditioned-water change, rinse media in tank water, log | S1/S11 support small/partial changes and filter maintenance; S15 directly recommends weekly 10-25% partial changes and periodic light media rinsing for Goldfish. S13 shows stocking effects are system-dependent. **The action and a weekly routine have support; the 14/10/7-day biomass mapping does not.** | Adviser must choose routine maintenance policy and whether “cleaning” means partial change/filter check rather than disruptive whole-tank cleaning. Retain draft.

## 6. Contradictions and uncertain claims requiring correction

### 6.1 Temperature

1. The configured normal range of 20-24 °C is directly supported by S15, while S1 and S2 independently support 18-24 °C and S14 uses a broader regulatory retail range. This is a genuine source-context difference, not permission to average values or claim one lower bound is uniquely correct.
2. The current critical formula is a relative 10% of each bound, yielding <18 and >26.4 °C. The older project contract used an absolute 2 °C margin. Neither critical formula is source-approved.
3. S3-S4 show acclimation and experimental context matter. Lethal/critical-tolerance studies cannot be used as routine husbandry limits, but they contradict the claim that the current percentage margin is biologically “critical.”
4. An adviser must define the scoped population (common/fancy Goldfish, life stage, indoor tank), acclimation assumptions, equality, sensor uncertainty, and persistence.

### 6.2 pH

1. S1 supports 6.5-7.5 as ideal; S2 says close to 7 and describes 5-9 as tolerated. The ideal range is defensible, but “outside ideal” is not automatically CRITICAL.
2. Current `±10%` margins yield 5.85 and 8.25. The older project contract used ±0.5 pH units (6.0/8.0). Neither is approved.
3. S5 confirms pH is logarithmic; a percentage of a pH numeral is not a scientifically meaningful default margin.
4. Recommendations should not assume accumulated waste is the cause of low pH or decorations are the cause of high pH without source-water, alkalinity, and aquarium context.

### 6.3 Water level

The current relative formula produces 59.5%; an older requirement says 10 percentage points below 70%, producing 60%. The 0.5-point numerical difference at this profile hides a larger semantic conflict. A relative percentage, absolute percentage-point offset, and explicit physical height behave differently when the profile changes. The safe rule must be derived from verified geometry, sensor blind zone/error, operational target height, and the highest equipment minimum-submergence/intake height. No reviewed biological source can resolve this engineering decision.

### 6.4 TDS meaning and calibration limitation

- EPA Method 160.1 (S7) measures filterable residue gravimetrically. The project uses an electrical sensor and a two-point meter-referenced estimate. The report/UI must say which method is used; “TDS ppm” is not self-validating.
- S8 explains that conductance depends on ion composition and temperature and only estimates TDS through a validated relationship. TDS alone cannot identify waste, feeding, toxicity, hardness, or the need for a water change.
- Aquarium 1's documented points are 0.169 V/80 ppm and 1.304 V/314 ppm at unspecified “normal” temperature, with no temperature compensation. They do not bracket 400- or 500-ppm decisions. Extrapolation must not produce classifications.
- `docs/device-contract.md` currently says Aquarium 1 sends `tdsReadingValid:false` with no `tdsPpm`; therefore rules 9-12 and the TDS side of rule 26 are not supported by actual live measurement.
- Before activation, use certified/reference solutions or a verified reference method at known temperature, bracket every approved boundary, define the conversion/factor, quantify repeatability/error, and reject values outside the validated span. An independent gravimetric/reference check is preferable.

### 6.5 Turbidity unit limitation

- EPA 180.1 and USGS §6.7 (S9-S10) tie the reported unit to optical design, calibration standards, method, and interferences. NTU and FNU are not interchangeable for environmental samples merely because both read the same standard.
- The prepared firmware has only a two-observation `Clear`/`Cloudy` separator and explicitly publishes `turbidityState`, not numeric `turbidity`. It cannot support 5 or 10 NTU.
- Required missing data include sensor optical geometry/wavelength, reference standards, blank/zero, curve, validated range, uncertainty/repeatability, ambient-light and bubble effects, fouling/cleaning protocol, and out-of-range behavior.
- The four numeric turbidity rules and turbidity side of early cleaning must remain draft/disabled unless numeric capability and a Goldfish-relevant action threshold are both approved.

## 7. Rules supported by present measurements

“Software path present” does not mean physically verified or scientifically approved.

| Rules | Present input support | Scientific/calibration status |
|---|---|---|
| 1-4 temperature | Prepared firmware publishes the mean of two DS18B20 readings with `temperatureReadingValid`; engine validates before thresholds. | Software-supported. Both probes, placement, averaging/disagreement policy, traceable comparison, accuracy near approved bounds, and physical operation require verification.
| 5-8 pH | Prepared firmware publishes numeric pH and `phReadingValid`. | Software-supported, but calibration must bracket the approved range with temperature-corrected buffers (S6), and independent verification/physical testing is required.
| 9-12 TDS | Sensor path exists, but the live contract says invalid/no `tdsPpm`; reference span ends at 314 ppm. | **Blocked by calibration and live data.** Cannot assess 400/500 ppm or the 30% early-cleaning trigger.
| 13-16 turbidity | Firmware publishes only `Clear`/`Cloudy`/`Unknown`; rules require numeric `turbidity`. | **Blocked by missing numeric measurement, unit, calibration, and source-supported thresholds.**
| 17-18 water level | Firmware publishes percentage, target-height echo, water-present state, and validity when the profile is enabled. | Software-supported but **blocked for authority** until tank dimensions, mounting, target height, blind zone, uncertainty, and equipment safe heights are physically verified per aquarium.
| 19 power interruption | Prepared firmware contains a mains-sensing path and Boolean mapping, but `docs/device-contract.md` says `mainsPresent` and real power status are not yet sent by the live device. | **Blocked by live hardware input and safe supervised calibration/verification.**
| 20 power offline | No evaluator state produces `power=Offline`. | **Unreachable; blocked by contract design.**
| 21-22 equipment | Firmware reports `equipmentStatus=Unknown`. | **Blocked by missing diagnostic/physical feedback.**
| 23 filter inactive | `filterState` is published. | Supports commanded relay state only, not actual flow, power draw, blockage, or mechanical operation. Rule wording must reflect that limitation.
| 24 device offline | Backend can derive staleness from timestamp/online state. | Software-supported engineering event; timeout/severity and wording remain unapproved.
| 25 sensor fault | Engine can produce faults for explicit invalid/malformed/impossible temperature, pH, TDS, turbidity, or water-level values, subject to field/flag availability. | Software-supported data-quality rule. Missing optional fields are not equivalent to a fault; physical fault detection still requires testing.
| 26 early cleaning | Backend schedule logic exists. | **Blocked:** both configured scientific triggers are unsupported; TDS/turbidity measurement blockers apply.
| 27 scheduled cleaning | Backend can compute biomass density and dates from complete profile/history. | Software-supported calculation, but bands and intervals are scientifically unsupported and profile weights/volume must be verified.

No rule in this table is ready for live approval solely because its software input exists.

There is no existing ammonia rule to classify in this table. Ammonia is therefore neither scientifically validated nor supported by an actual measurement path in the current 27-rule package.

## 8. Calibration and hardware blockers

| Measurement | Minimum evidence required before the related rule can be approved |
|---|---|
| Temperature | Identify each probe and placement; compare against a traceable/reference thermometer at multiple stable points bracketing approved low/normal/high bounds; record raw readings, offsets, repeatability, stabilization time, uncertainty, date/operator/reference; approve averaging and one-probe/disagreement behavior.
| pH | Follow a documented two- or three-point procedure with fresh buffers bracketing the decision region and temperature correction (S6); record buffer lot/expiry/temperature, slope/offset, rinse/conditioning, drift/repeatability, valid span, recalibration interval, and independent check.
| TDS/conductance | Declare whether the device reports conductivity-derived estimated TDS or gravimetric TDS-equivalent; calibrate with certified/reference solutions/reference meter at controlled temperature over every approved boundary; document factor/curve, composition limitations, compensation, residual error, repeatability, valid span, clipping, and independent verification. Never extrapolate into classification.
| Turbidity | Select an instrument method and correct unit; use traceable standards bracketing every boundary; document optical geometry, blank, calibration/verification, range, repeatability/uncertainty, bubbles/color/ambient-light effects, fouling and cleaning. Two clear/cloudy samples are insufficient.
| Water level | Verify tank internal dimensions, operational volume/target height, sensor mounting and blind zone, empty/intermediate/threshold/target points against ruler or known fill, surface agitation, uncertainty, profile echo, and filter/heater/intake safe heights for each aquarium.
| Power | Under safe supervision, verify detector polarity/threshold, mains present/absent/ambiguous input, backup behavior, debounce/noise, restoration, and which loads actually lose power.
| Filter/equipment | Define command, acknowledgement, electrical feedback, flow feedback, and diagnostic fault as separate states; test each supported state/failure under safe loads. A command or acknowledgement is not proof of physical actuation.

Each record should include `aquariumId`, `deviceId`, sensor make/model/serial where available, firmware revision, method revision, date/operator, reference standard/instrument, raw observations, fitted conversion, unit, validated range, uncertainty/tolerance, result, and next calibration due date.

## 9. Proposed corrections for adviser consideration

These are proposals, not approved changes.

1. **Temperature profile:** choose between the directly supported 20-24 °C candidate (S15) and the independently supported 18-24 °C candidate (S1/S2) for the scoped prototype, and record the context/rationale. Do not derive critical limits by percentage.
2. **pH profile:** retain 6.5-7.5 as the cited ideal candidate. Replace percentage critical margins with explicitly sourced absolute values and confirmation/persistence. Do not interpret tolerance endpoints as ideal values.
3. **Severity semantics:** define WARNING as “confirmed outside adviser-approved operating range” only if that is the intended policy. Define CRITICAL through separately reviewed evidence/risk, not an arbitrary margin. State equality and sensor uncertainty at every boundary.
4. **TDS:** do not use 100/400/500 ppm for Goldfish classification without direct evidence. Do not cite the 500-mg/L drinking-water aesthetic standard as a fish threshold. Consider a calibrated trend/process indicator until evidence supports biological categories.
5. **Turbidity:** remove the unconditional NTU label and numeric rules until the device implements a standard-calibrated numeric method. A categorical clarity state, if retained, needs separately worded engineering rules and cannot masquerade as NTU.
6. **Water level:** derive fixed physical heights from each tank/equipment geometry, then expose a percentage only as a calibrated presentation. Resolve 15%-of-min versus 10-percentage-point policy explicitly.
7. **Power/equipment/filter:** separate measured mains loss, telemetry silence, relay command, command acknowledgement, electrical feedback, and flow/mechanical feedback. Severity should account for duration and actual affected function.
8. **Device offline:** correct “3 missed sends” for a 15-s cadence and >60-s condition; define whether the boundary is `>=` or `>`, and document recovery/debounce.
9. **Sensor fault:** remove “missing” from the basis unless an expected-sensor registry defines that field as required. Keep invalid data separate from water-condition classification.
10. **Maintenance:** retain supported action wording (partial conditioned-water change; media rinse in removed tank water; log work). S15 supports a weekly 10-25% Goldfish water-change routine, but not the project's graduated bioload schedule; do not approve 1/3-g/L bands, 7/10/14-day mapping, 30%, or 2-in-24-h triggers without evidence. Clarify that “cleaning” does not mean a complete disruptive water replacement.

## 10. Decisions requiring adviser approval

- [ ] Exact scoped Goldfish population: common/fancy strains, life stage/size, indoor small freshwater aquarium.
- [ ] Temperature ideal range, absolute WARNING/CRITICAL bounds, equality, confirmation count/duration, recovery, and acclimation assumptions.
- [ ] pH ideal range, absolute WARNING/CRITICAL bounds, equality, confirmation, recovery, and whether alkalinity/source-water context is required.
- [ ] Whether TDS is eligible for biological classification; if yes, method, unit, composition limits, calibrated range, and direct source for each threshold/action.
- [ ] Whether turbidity remains numeric or categorical; approved method/unit, calibration, Goldfish-relevant thresholds, and actions.
- [ ] Aquarium-specific water-level safe heights and the formula/percentage representation.
- [ ] Bioload definition, approved bands, data requirements, and behavior when weights/working volume are missing.
- [ ] Routine maintenance intervals and the two early-maintenance triggers.
- [ ] Single-sample versus persistent/confirmed conditions for every measurement.
- [ ] Whether `power_offline` is removed/disabled or given a distinct measurable state.
- [ ] Power-interruption duration/severity tiers and actual backup/equipment assumptions.
- [ ] Required physical feedback for `equipment_fault`, `equipment_warning`, and filter operation.
- [ ] Device-offline timeout, boundary, wording, debounce, severity, and recovery.
- [ ] Expected-but-missing sensor semantics versus optional/uninstalled and explicitly invalid sensors.
- [ ] Exact action wording, urgency, contraindications, and escalation for all 27 rules.
- [ ] Acceptance criteria and records for every physical calibration.
- [ ] Final evidence locator, reviewer identity/date, configuration revision, and approval reference for each approved value/action.

## 11. Minimum necessary implementation changes for the next task

No application, Firebase, mobile, firmware, dependency, deployment, or production-data change is required to complete this scientific review. The existing fail-closed gate already keeps the draft rules from live prescriptive use.

After adviser decisions—and only for the items approved—the minimum next implementation should be:

1. Update the existing Goldfish seed/config values, rule conditions, basis/action wording, and `source` locators; do not create a new rule engine or collection.
2. Disable or redefine rules the adviser does not approve, especially numeric turbidity, TDS, `power_offline`, and feedback-dependent equipment rules. Because live evaluation requires every enabled rule to be approved, an approved subset requires an explicit decision about which unsupported rules are disabled; do not silently activate a partial set.
3. Correct the deterministic wording defects: device-offline missed-send count, `sensor_fault` missing-value claim, commanded-versus-measured filter state, and any TDS/turbidity unit labels.
4. Add focused configuration/engine tests for only the approved boundaries, equality, persistence, disabled rules, and action selection.
5. In a separately authorized hardware/firmware task, implement and verify only the calibration/feedback work the adviser retains: full-span TDS with temperature/method declaration, standard-calibrated numeric turbidity if required, mains sensing, and physical equipment feedback. Do not fabricate telemetry.
6. Keep all changed scientific content in `draft` until the evidence mapping, calibration prerequisites, exact exported configuration, and adviser approval record are complete.

## 12. Verification status

### VERIFIED BY REPOSITORY INSPECTION

- All 27 rules and the Goldfish configuration remain draft in the seed.
- The exact triggers, units, severities, and action text in this matrix match the current seed and Step 2 execution review.
- The draft/live gate prevents unapproved rules from producing live prescriptive recommendations.
- The present firmware/data-contract limitations listed in §§6-8 are documented in the repository.

### SUPPORTED BY EXTERNAL EVIDENCE

- Evidence links, locators, and claim boundaries are recorded in §3.
- pH 6.5-7.5 has direct ideal-range support; both 20-24 °C (S15) and 18-24 °C (S1/S2) have direct authoritative support and require adviser resolution for this scope.
- General partial-water-change, dechlorination, gradual-change, maintained-filtration, and filter-media-rinse actions have authoritative support.
- TDS/turbidity measurement limitations and calibration requirements have EPA/USGS method support.

### REQUIRES ADVISER APPROVAL

- Every final threshold, severity, persistence/equality rule, context check, and maintenance trigger.
- Whether proposed source-supported candidates replace current draft values.
- Every action's final wording and applicability.

### REQUIRES PHYSICAL HARDWARE VERIFICATION

- Sensor accuracy/calibration, ESP32 communications under real operation, water-level geometry, TDS conversion, any numeric turbidity, mains interruption detection, filter/equipment feedback, and actual switching/actuation.

Until those approvals and applicable physical checks exist, all 27 rules and the Goldfish configuration must remain `draft` and must not be deployed or seeded as approved.
