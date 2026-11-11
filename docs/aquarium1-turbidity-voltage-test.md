# Aquarium 1: turbidity voltage over Wi-Fi

## Testing paused — 2026-11-12

At the owner's request, the active Aquarium 1 upload sketches again send only
the original Clear/Cloudy/Unknown turbidity category. The testing voltage field
is no longer transmitted, and website/mobile turbidity cards no longer show
ADC voltage, numeric NTU or NTU-calibration notices. Optional voltage parsing,
history and database-rule support remain compatible with older flashed code.
No data is deleted and no database rule rollback is needed.

The original classifier and its lower validity guard are unchanged. Reverting
the test display does not repair a signal stuck at 0.142 V. Unknown and explicit
invalid readings remain unavailable to water analytics.

The owner confirmed the analytics mapping on 2026-11-12: Clear → Normal,
Cloudy → Warning, Unknown → Unavailable without water-quality recommendations.
Configured categorical warning rules supply existing actions and filter checks.
Missing recommendation rules are reported without changing the classification.
Numeric NTU rules are not silently repurposed and no maintenance action is
invented. A read-only live check found 27 enabled rules, all marked draft, with
numeric turbidity conditions. Live recommendation activation therefore still
requires configuration migration/approval through the existing workflow.
No live analytics configuration or approval metadata has been changed.

The sections below document the earlier diagnostic release, not the current
active firmware or display behavior.

## Purpose and files

The owner upload sketch at `C:/new/Aquarium1Device/Aquarium1Device.ino` and its
repository copy publish the existing measured `turbV` as optional
`devices/{aquariumId}/telemetry/turbidityVoltage` (volts at the ESP32 ADC input).
It is NOT NTU and is NOT the estimated module voltage before the divider.
The existing Clear/Cloudy calibration, sampling interval, pins, relay controls,
network-hold policy, pH/TDS compensation and water-level calibration are unchanged.
Aquarium 2 firmware is not modified.

Affected application areas: telemetry types/parsers/snapshots, monitoring and
dashboard display, history ingestion/mapping, mobile sensor presentation and
the shared voltage formatter. The new field uses the existing telemetry path
and sampled history records; no collection or device node is added.

## Deployment order — required before uploading

Release status: the voltage-only RTDB addition was deployed to
`practice-smartaqua` and verified by reading the live rules at
2026-11-11 14:47:43 UTC (22:47:43 UTC+8). No Functions, Firestore rules, hosting,
telemetry, equipment commands or firmware were deployed/written. The emulator
voltage/access-isolation test passed against the preserved-live release file.

Important for future rule deployments: live command validation already differed
from the repository at `commands/latest/commandId/.validate`,
`commandAck/latest/.validate` and `commandAck/latest/commandId/.validate`.
This release preserved those existing live fixes rather than overwriting them.
The exact pre-release snapshot and deployed candidate remain under
`C:/new/tmp/turbidity-voltage-release/`. Reconcile those differences before any
future full-file deployment of the repository's `database.rules.json`.

1. Deploy the updated **Realtime Database** rules (`database.rules.json`). The
   new optional field accepts numbers from 0 to 3.3 V. Existing device-only
   writes and aquarium-specific read permissions are unchanged. Older firmware
   without the field remains compatible. Old rules reject the new payload, so
   do not upload the sketch before this rule is deployed.
2. Release/restart the updated website. Release updated Functions to retain
   the voltage in existing sampled history; the live display itself reads RTDB.
   Mobile has matching parsing and display support, requiring an updated build.
3. Upload **Aquarium 1's** sketch, using the verified Aquarium 1 board/port.
   No sketch upload, database deployment or website deployment is performed by
   editing these files alone.

## Adapter-powered physical test

1. Disconnect USB after upload, then power the ESP32 from the usual 5 V 2 A
   adapter. Keep the existing sensor wiring unchanged. Do not add a second
   power source or connect the laptop solely to read Serial Monitor.
2. Let Wi-Fi reconnect and open Aquarium 1 on the updated website. Verify the
   sample timestamp advances. The turbidity card should show Clear/Cloudy and
   `<measured voltage> V (ADC)` underneath. If the category is Unknown, a
   measured voltage is still shown for diagnosis. Explicit sensor errors remain
   errors, with voltage displayed as diagnostic information when available.
3. With light/filter outputs off, collect five fresh clear-water samples in a
   separate container. Keep the board/connections dry, remove bubbles, and keep
   sensor depth, position and surrounding light consistent.
4. Rinse, repeat with cloudy water, then rinse and return to clear water to
   check repeatability. Do not deliberately cloud the aquarium.
5. Check equipment interference separately while keeping the sample water
   unchanged. Record the output states with each sample.

Only fresh live readings are presented as current; stale/offline telemetry does
not retain a current voltage. History retains its normal sampling policy, not
every telemetry update. Voltage alone cannot generate water recommendations or
establish numeric NTU. Any categorical analytics rules require separate verified
configuration. End-to-end delivery, voltage accuracy and sensor repeatability
still require this physical test.
