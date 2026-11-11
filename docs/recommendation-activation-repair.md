# Recommendation activation repair — 2026-11-12

The owner confirmed that the existing rules have already been approved.
The application metadata still has 27 enabled draft rules, all with Source TBD
(read-only live inspection). This does not establish that scientific review is
outstanding; it means that review has not been recorded in the application.

## Implementation

- Web/mobile, telemetry ingest, heartbeats and cleaning checks select approved,
  enabled rules independently. An unrelated draft no longer disables them all.
- Species configuration has its own approval gate; draft species defaults stay
  inactive without blocking unrelated approved recommendations.
- Fresh validated matching telemetry replaces a legacy/draft alert recommendation
  with a newly evaluated approved recommendation. The old record is resolved,
  not relabelled or deleted. Unknown data cannot trigger that replacement.
- The condition cache policy is versioned to reject older server summaries.
- The recommendations panel explains the saved metadata issue without asserting
  that the owner's review is pending. String readings do not receive NTU units.
- Invalid-input, authentication and aquarium-isolation safeguards are unchanged.

## Remaining live activation

The existing audited admin approval workflow requires an actual source/reference,
not TBD. The owner has been asked for that reference; do not invent a citation
or an approver identity. No live approval/configuration records have been changed
by this repair so far.

Once the reference is supplied, preserve existing actions, extra checks and
priorities; set the three turbidity warning conditions to eq Cloudy through the
configuration workflow, then record approval against the final exact content.
Clear remains Normal and Unknown Unavailable; do not map Cloudy to Critical or
invent NTU. Existing draft recommendation documents must not be bulk-approved.

Release affected backend consumers together and allow fresh real telemetry to
drive recommendation generation. No fake telemetry or equipment commands are
needed. Verify actual live activation separately from emulator tests.
