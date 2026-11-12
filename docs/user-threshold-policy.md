# Saved aquarium thresholds

The shared assessment core in web, Functions and mobile resolves saved
temperature, pH, minimum water level and explicit TDS ppm limits for live
classification. Web/mobile condition assessment, server telemetry ingestion,
report generation and threshold review use the same resolver.

Valid user limits override species defaults. Explicit administrator overrides
retain priority per bound without discarding unrelated user limits. Only
approved species defaults fill gaps; draft defaults are not silently enabled.
Legacy TDS purity percentages are not converted into ppm. Old profiles lacking
ppm limits need those two values saved, unless an approved species default exists.

## Classification and recommendations

A valid reading outside a configured bound is WARNING even if no active rule
matches. No new numerical critical margin or maintenance action is invented.
Critical severity and prescribed actions come from existing approved rules using
the same aquarium limits. Approved enabled rules are selected independently;
an unrelated draft does not block them. Species bioload/cleaning configuration
retains its own approval check. User limits do not approve rules, bioload bands
or cleaning schedules. Stored
application approval status is separate from real-world adviser approval.

Sensor validation runs first. The 80–314 ppm calibration-check span is not a
sensor-failure boundary. Invalid readings remain unavailable and cannot create
water-quality recommendations. See sensor-semantics.md for category-only turbidity.
Aquarium isolation and owner-edit permissions are unchanged.

## Server summaries and release

Server condition summaries carry a cache-only `configurationKey`, derived from
effective thresholds and rules. Web/mobile reject absent/mismatched keys and
evaluate locally. Configuration changes refresh the history threshold snapshot
even when severity is unchanged. This key is not an authorization mechanism.

No live Firebase data or approval metadata was changed. No new collection,
permission or firmware change is required. Deploy updated web, ingestion/report
Functions and rebuild/install mobile together. The earlier TDS form feature's
focused Firestore permission update was deployed and read-back verified on
2026-11-12; see `tds-ppm-profile-limits.md`. That rollout changed no application
data and deployed no Functions. Existing draft rules still need authorized admin activation before
prescriptive recommendations can resume.

Offline configuration/assessment tests and emulator fixtures verify software
behavior, not physical sensor accuracy or production deployment state.
