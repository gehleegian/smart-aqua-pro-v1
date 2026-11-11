# Sensor validity versus water thresholds

Positive finite TDS ppm is evaluated against saved user limits, not rejected
because it lies outside the 80–314 ppm meter-comparison span. Zero, negative,
malformed and explicitly invalid readings remain sensor faults. This does not
establish accuracy beyond the checked calibration span. Existing approved
rules still determine prescribed actions; no approval metadata is changed.

The owner confirmed the categorical policy on 2026-11-12: Clear is Normal,
Cloudy is Warning, and Unknown is Unavailable without water-quality advice.
Cloudy recommendations use active configured categorical warning rules and their
filter checks; absent rules are reported rather than inventing an action.
Explicit categories take precedence over numeric NTU, but cannot mask invalid
sensor data. Numeric-only legacy readings still use configured numeric limits.
At the owner's request to pause testing,
the active cards now display Clear/Cloudy/Unknown only, without ADC voltage,
numeric NTU or NTU-calibration notices. Unknown is never forced into a category.

Numeric NTU remains dependent on verified sensor conversion/calibration and
firmware publication. No hardware, live database, authorization or security
rule changes are part of this fix. Web, Functions and mobile share the same
semantics. Release all consumers together; versioned condition cache keys
reject stale summaries from the previous evaluation policy.
