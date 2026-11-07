# Aquarium 1 profile-based water level — implementation, not activated

## Definition

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
