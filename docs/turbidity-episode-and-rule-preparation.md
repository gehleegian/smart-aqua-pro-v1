# Turbidity episode fix and configuration preparation

## Implemented locally

The authoritative ingest path now retains lastValidTurbidityStatus in the
existing private aquariums/{id}/engine/state document. Current per-parameter
status still reports Unknown/invalid/missing as unavailable; retaining episode
history does not turn these into valid readings or maintenance advice.

An initial observed abnormal entry is countable. Repeated abnormal readings,
Warning-to-Critical transitions and Unknown/invalid/missing gaps do not create
another episode. A valid Normal (categorical Clear) re-arms the next entry.
Legacy entries without the new field use their prior valid status, or
conservatively retain an already recorded episode rather than infer Normal.
Cleaning-cycle history and already latched early-cleaning triggers are retained.

The existing numeric and categorical regression cases cover missing, Unknown,
negative and explicitly invalid readings, warning/critical continuity, actual
Normal/Clear recovery, legacy state and recommendation deduplication.

## Prepared, not activated

scripts/lib/prepare-categorical-turbidity.mjs is a pure preparation helper.
It has no Firebase connection and cannot write, approve or deploy anything.
It handles only the three existing warning IDs, fails closed on unexpected or
duplicate/missing rules, and prepares eq Cloudy conditions. Other content is
retained; changed content resets approval to draft. The numeric Critical rule
is not repurposed for Cloudy.

Deliverables in C:/new/output/rule-review:

- rule-specification-appendix.md: all 27 exact action inventories, existing
  parameter matrix, verified manuscript page references and missing-source prompts.
- categorical-turbidity-change-plan.json: the three proposed condition edits,
  proposed factual categorical rationale text for review and release safeguards.

The source snapshot is explicitly dated, not presented as a fresh live read.
The appendix does not constitute independent scientific evidence or invent
approval/citation metadata. The project owner has already attested approval;
the actual references are still required for accurate application records.

## Deployment and security impact

No live writes, device operations, approval calls, security-rule changes or
deployments were made in this preparation step. No new collection is created.
Authentication, administrator approval checks and aquarium authorization remain
unchanged. The new episode field is server-owned within an existing private
document, so no client rules/schema permission changes are needed.

Before live activation: complete references covering final exact content,
re-read live rules to detect concurrent changes, use the audited configuration
workflow for condition/rationale edits and approval, deploy verified backend
changes, then check fresh real telemetry. Do not use a blanket seed or relabel
old draft recommendations. Sensor accuracy still requires physical verification.
