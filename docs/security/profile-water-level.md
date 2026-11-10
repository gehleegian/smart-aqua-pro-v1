# Aquarium 1 profile-based water level — implementation, not activated

## Current policy: restored fixed water-level calibration (2026-11-10)

At the owner's request, both aquarium sketches again use 27.0cm as empty
and 20.2cm as the chosen 100% reference. The active percentage is
clamp((27.0 - measuredDistanceCm) / (27.0 - 20.2) * 100, 0, 100).
This is the chosen usable water-height span, NOT a percentage of saved litres.
Dimensions and operational volume remain saved for other aquarium features,
but no longer define, gate or synchronize water-level control. PROFILE_LEVEL_ENABLED
is false in both repository and exact upload Config.h files. The optional
geometry helper/schema remain for compatibility, not active calculation.

Web/mobile/ingest accept fixed-mode percentages without target-height metadata
or dimensions. Old profile-mode payloads carrying waterLevelTargetHeightCm are
unavailable until the matching fixed-mode sketch is uploaded; they are never
silently relabelled. Old profile-mode condition summaries cannot override the
fixed reading. Explicit invalid/missing echoes remain unavailable and excluded
from low-water maintenance advice. The 20-800cm firmware echo gate is unchanged.

No saved dimensions, litres, history, thresholds, authorization or other sensors
are changed. Existing optional control geometry may remain in RTDB: fixed-mode
firmware ignores it. No database rules change or live geometry write is required.
Firmware upload and updated web/mobile clients are required. Backend ingest also
needs the shared fixed-mode policy before evaluating those readings.

Fixed-mode verification: all 234 web unit tests, 89 local RTDB/ingest emulator
tests and 61 mobile tests passed. Web, mobile and Functions TypeScript checks,
both firmware contracts and changed-source lint passed. The pure active firmware
formula is exercised against chosen endpoints and invalid-echo fixtures for
both repository and actual upload sources. Both exact upload folders compiled:
Aquarium 1 1,156,869 bytes flash / 48,164 bytes RAM; Aquarium 2 1,151,349 bytes
flash / 47,988 bytes RAM. No firmware upload, equipment command, native APK
installation or physical accuracy verification was performed in this rollback.

After approval, only ingestDeviceTelemetry (asia-southeast1, Node.js 22 gen2)
was successfully redeployed with this fixed-mode policy. Initial localhost-based
discovery failed before updating; retry with the installed Firebase CLI's supported
file-manifest discovery succeeded. Database rules, live geometry, other functions,
support-email/admin-MFA parameters, schedules and equipment commands were not
changed. Web/mobile source is updated locally, not pushed/published here; the
installed APK and both ESP32s still need their corresponding updated builds.

The sections below document the superseded dimension/volume implementation.

## Previous correction: fixed mounting, range-limited profile readings (superseded)

The owner confirmed the existing mounting is final and asked to keep the
dimension/operational-volume definition of 100%. This supersedes the older
activation condition below that rejected an entire profile when its full target
entered the blind zone. Geometry validity and current echo validity are now
separate: a capacity-valid target below the 27cm sensor mounting height is retained,
while every actual echo still must pass the existing configured 20-800cm gate.
Nothing lowers that minimum, invents an echo, substitutes an old percentage, or
declares the mounting verified at full water. Exact board revision/range and
physical volume accuracy remain unverified.

Both prepared upload Config.h files now enable the profile calculation. The
shared web/mobile/server contract selects it for registered-format SmartAqua
device IDs, not editable tank names; this is not an authorization check. Other
IDs retain legacy behavior. Owner-authorized profile/control saves synchronize
the existing optional control/waterLevelProfile for either aquarium. Saved
dimensions/litres and the existing 27cm mounting reference are not changed.

Valid current readings display the standard "Live telemetry" status; the owner
requested removal of the full-target range message from the UI. This is a
presentation change, not a change to measurement limits. Echoes inside the configured blind zone, missing echoes,
missing profiles and mismatched targets remain unavailable and do not produce
low-water maintenance advice. Old legacy 20.2cm-full percentages are not relabelled
as profile-based. Firmware logs the upload percentage/target after cloud profile
resolution; this is the value submitted to RTDB. Other sensors/relays/feeder and
power-outage telemetry are preserved. Web monitoring/dashboard and mobile tank
details retain invalid-reading messages; existing stale-reading behavior is unchanged.

Database validation changes only two .validate expressions: capacity-valid
geometry may imply a target below 27cm instead of only <=7cm, and the optional
telemetry target permits the same range. All .read/.write authorization is
unchanged. Existing Firestore schema, rule thresholds, ownership and historical
records are unchanged. The ingest function must use the same shared policy.

Last read-only profiles: Aquarium 1 60.96x25.4x24.13cm at 19.9L implies a 12.8521cm
target height; Aquarium 2 60.96x22.86x22.86cm at 19.9L implies 14.2801cm. For example,
Aquarium 1's measured 22.1cm echo computes about 38.1%, not the legacy 72%.
These are geometric calculations, not independent measured volume certification.
With the configured minimum and 27cm mount, the last measurable water height is
7cm; the code cannot measure the higher portion of these targets.

Rollout order: test and deploy only the RTDB validator and ingest-function changes;
run the updated web/mobile clients; have the authorized owner save the existing
aquarium profile/control once to synchronize geometry; upload the matching sketch
with all headers; then verify Serial upload line, RTDB, web/mobile and profile
edits/no-echo cases together. Do not upload before server validation accepts the
larger profile targets. Upload restarts relays OFF. No automatic equipment command,
neutral push test or live profile write is part of editing/building the sources.

Verification/rollout on 2026-11-10: 233 web unit tests, 89 local RTDB/ingest
emulator tests and all 61 mobile tests passed. Web/Functions/mobile TypeScript,
both static firmware contracts and changed-source lint passed (the RTDB test
file retains its pre-existing unused temperatureC warning). Both exact upload
folders compiled: Aquarium 1 1,158,605 bytes flash / 48,172 bytes RAM; Aquarium 2
1,153,137 bytes flash / 47,996 bytes RAM. Device identities were checked against
private manifests without exposing credentials.

After approval, database validation and ingestDeviceTelemetry (asia-southeast1)
were deployed successfully. Pre/post comparison confirmed unchanged .read/.write
rules; the live schema now matches the reviewed local rules. The existing control
waterLevelProfile field was synchronized for each bound aquarium from its own
saved Firestore geometry. No saved dimensions, ownership, schedules, commands,
equipment states or other functions were changed. Existing support-email and
admin-MFA parameter settings were reused unchanged; the ignored
functions/.env.practice-smartaqua file holds only those operational settings.

Latest live payloads still lack waterLevelTargetHeightCm and use the old percentage,
so clients correctly show "Waiting for device to synchronize the water-level
profile." Firmware has NOT been uploaded by this work. Reload updated clients and
upload each exact folder with its updated Config.h and WaterLevel.h before the
supervised Serial/RTDB/web/mobile comparison. Mobile source updates also need an
updated bundle/APK; an older installed build is not automatically updated here.
The mounting and exact sensor range have not been physically certified.

## Original definition and rollout history (superseded where noted above)

Aquarium 1 retains its owner-confirmed sensor-to-empty-bottom distance of
27.0 cm. For a rectangular tank using **internal centimetre dimensions**:

```
targetHeightCm = workingWaterVolumeLiters * 1000 / (tankLengthCm * tankWidthCm)
currentHeightCm = 27.0 - sensorDistanceCm
percent = clamp(currentHeightCm / targetHeightCm * 100, 0, 100)
```

Tank height verifies capacity; it does not replace the measured mounting offset.
100% is the operational volume target, not the glass rim. Above-target readings
display 100% only when the echo itself is valid. Blind-zone/no-echo readings are
invalid, never fabricated as full. Gravel/displacement/nonrectangular shapes
limit this geometric approximation; this is not a certified volume measurement.

The existing assumed ultrasonic minimum distance is 20 cm. With 27 cm empty,
measurable target heights are at most 7 cm. This is a physical clearance check,
not a new water-quality threshold. Final target verification still requires the
actual sensor specification and a ruler/known fill. Do not invent a shorter blind
zone or freeze readings to bypass mounting limitations.

## Data flow and changed files

- Shared `src/utils/waterLevelProfile.ts` on web/mobile validates finite positive
  dimensions/volume, tank capacity and target clearance. Scope is Aquarium 1's
  existing device binding, not its editable aquarium name.
- Profile saves synchronize **only** optional `control/waterLevelProfile`,
  preserving lighting/filter schedules, manual states, commands and timestamps.
  Full control saves derive this geometry from freshly authorized Firestore data,
  not an arbitrary caller-provided target. No incomplete control record is created.
  Profile-save/sync failures explicitly state that the profile was already saved
  and how to retry. Invalid geometry removes the target instead of retaining an
  obsolete valid one. Aquarium 2 profile saves retain their existing behavior.
- Firmware `WaterLevel.h` validates/calculates the target and percentage; Aquarium
  1 Config.h enables the new path in the prepared source. The firmware re-evaluates
  the current echo after reading control settings, so profile edits do not wait for
  a reboot and cannot publish a percentage using the previous target.
- Invalid/missing geometry or echo omits waterLevelPercent/waterPresent and sends
  `waterLevelReadingValid:false`. Other fresh sensor/relay/power readings continue
  uploading if the mandatory temperature pair is valid. No 0 or previous level is
  invented. Valid readings include `waterLevelTargetHeightCm`.
- Web monitoring/dashboard/alerts and mobile monitoring respect per-level
  validity. Aquarium 1 also compares the device-reported target with the saved
  profile (0.0001 cm float serialization tolerance only). Profile edits hide an
  obsolete device target until synchronization. Legacy 20.2 cm-full telemetry is
  never labelled profile-based. Invalid levels do not trigger low-water advice;
  other real parameter alerts remain active. UI explains setup, capacity,
  clearance, synchronization or echo failures rather than claiming valid 0%.
- Complete-reading history writers reject invalid partial levels rather than
  storing fake zeroes. Existing historical percentages are not rewritten when a
  profile changes; histories remain the recorded values, not retroactive estimates.
- `database.rules.json` adds optional strictly validated geometry/level-validity/
  target metadata and permits level-missing telemetry only with explicit invalid
  flag. Existing legacy complete payloads remain accepted. No `.read`/`.write`,
  identity, role or ownership changes were introduced. Firestore schema is unchanged.
- Aquarium 2's common source/helper is kept in parity, but its profile-level flag
  is false: its existing calibration and hardware are NOT changed or uploaded.

## Activation deliberately pending

## Integration with the newer main branch

The integration keeps the newer owner/caretaker access model, tank screens,
sensor-validation policy, 60-second freshness window, and Firestore-loaded rules
engine. Only water-level behavior is extended. Web, mobile and server share the
same profile validation. An explicitly invalid or obsolete target is a sensor
fault, never a low-water observation; valid readings from other sensors remain
available. The server records level validity and target metadata in sampled
history and its condition summary. Clients ignore an old-geometry summary until
its target matches, falling back to the existing rules engine in the meantime.
Historical values remain measurements at their original time, not recalculated
against a later profile. No live rules, accounts, profiles, commands or firmware
are changed by the Git merge itself.

Before activation, deploy the reviewed water-level changes to the ingest
function as well as RTDB validation. This is required so the server recognizes
partial readings and does not evaluate an obsolete target as current water level.

## Pending physical configuration

The stored Aquarium 1 dimensions were 9 x 10 x 9 cm with 10 L operational volume,
which is physically impossible (capacity 0.81 L). Owner confirmed these dimensions
are unfinished. No final dimensions have been guessed, saved or used on hardware.

Do NOT upload this prepared Aquarium 1 sketch against the old RTDB schema: partial
readings/new fields would be rejected. Activation order is:

1. Obtain/validate final internal dimensions and operational litres, and confirm
   target clearance using the actual sensor/mounting. Do not activate an impossible
   profile or a target inside the blind zone.
2. Review/deploy only the tested RTDB schema diff while preserving live access
   rules. Do not deploy the broader local Firestore rules as part of this feature.
3. Save/retry the final profile or control settings from the authorized owner
   account to synchronize geometry (a profile save requires an existing complete
   control record; otherwise save control settings first).
4. Compile/upload Aquarium 1's repository sketch under supervision. Upload restarts
   relays OFF; no feeder command is needed for water-level testing.
5. Compare empty, intermediate and operational-target physical heights/known
   fills to the website and mobile displays, and test profile edits, no echo and
   connection loss. Sensor accuracy cannot be claimed from software tests alone.

This implementation turn does not deploy rules, change live profile/registry
data, issue equipment commands, upload firmware or push/merge GitHub branches.

The subsequent integration/merge is a source-only operation: it does not deploy
Firebase or upload devices. Integration checks include 161 selected web unit and
parity checks, all 31 mobile tests, isolated RTDB legacy/organization security
tests and server-ingestion regressions (including partial/obsolete water levels).
Web/mobile types and changed-source lint, plus the Functions build, are checked.
Two existing Windows-specific test-harness failures (CRLF trigger scanning and a
file-URL path in the rule-matrix test) are excluded, not changed by this feature.

## Verification evidence

134 unit/contract tests (including shared web/mobile profile validation and
freshness/assessment regression checks) and 48 local RTDB emulator security tests
passed. All geometry/partial-telemetry tests use isolated fixtures, never live
readings. `.read`/`.write` rules were also compared structurally with the prior
revision and remained identical. Web/mobile TypeScript and changed-source ESLint
checks passed. Both firmware static checks and real-settings compiles passed;
the C++ helper includes nine compile-time empty/half/full/invalid geometry/echo
assertions. Aquarium 1 used 1,157,301 bytes flash / 48,188 bytes RAM; Aquarium 2
used 1,155,273 bytes flash / 48,156 bytes RAM. A parallel Aquarium 1 build returned
a generic exit failure; an isolated retry compiled successfully. Neither build
was uploaded. Browser/phone walkthroughs and physical accuracy remain unverified.
