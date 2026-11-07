# Review handoff — 2026-11-07

Prepared on `feat/device-claiming-calibrated-controls-2026-11-07` for manual
review/merge only. Companion mobile branch uses the same name in
`gehleegian/smart-aqua-mobile`. Nothing merges or deploys automatically here.

## Included work

- Spark-compatible, server-authenticated enclosure-ID-only device claiming;
  profile creation, resumable ownership coordination and per-account rate limits.
- Owner/device access validation, loopback development-origin fix, private
  provisioning/configuration helpers, focused Firestore rollout artifact and tests.
- Web/mobile claiming integration, simulator-control removal, manual controls
  usable with automation, and actual reported light/filter state in controls.
- Receive-time telemetry freshness fix, one-decimal level display and categorical
  Clear/Cloudy support without fabricating numeric NTU or TDS.
- Both ESP32 firmware snapshots under `firmware/`: authenticated cloud control,
  UTC+8 schedules, quarter-turn-left feed with 1.5-second dwell/return and
  five-second cooldown, five-echo median level filtering, and Aquarium 1's
  analog power-presence discriminator using measured ON/OFF references.

## Verification for this handoff

- 127 unit/contract/cross-client tests passed.
- 108 Auth/Firestore/RTDB emulator claim/security tests passed (demo projects only).
- Web and mobile TypeScript checks and changed-source ESLint passed.
- Both packaged firmware static contract checks and real-settings compiles passed
  (Aquarium 1: 1,155,717 bytes flash; Aquarium 2: 1,155,261 bytes flash). Neither
  device was uploaded during this GitHub task; see the setup reports for earlier
  hardware uploads and physical observations.
- Firmware helpers compile repository sources without uploading them. Private
  settings and build artifacts remain outside version control.

Before publication, the staged file set and unpublished history are checked for
the known local device passwords/private key and unclaimed Aquarium 2 identifier.
No private settings, device-login JSON, registration manifests, rules backups,
diagnostic logs, compiled firmware or stray Node executables belong in this branch.

## Merge and deployment cautions

Merging code is not a Firebase rollout. Current live Firestore used the focused
`firestore.claiming.rules` rollout, NOT the broader local `firestore.rules`.
Do not run an unreviewed blanket `firebase deploy`. Existing guarded rollout
helpers verify the target project/baseline, back up rules and require explicit
apply flags. They are operator tools, not server startup/build hooks.

Configure the claiming endpoint's server-only credentials through
`.env.claiming.example`, disabled by default. Do not give live credentials to
untrusted preview deployments. The phone's public API base URL must point at the
deployed website/server (or a deliberate LAN development URL), never its own
localhost. ID-only claiming does not prove physical possession; keep unclaimed
enclosure IDs private. Aquarium 2's live identifier is redacted in public notes;
its ignored DeviceIdentity.h must come from its private registration manifest.

Do not overwrite firmware credentials with those from another aquarium. The
repository copies preserve measured Aquarium 1 references; Aquarium 2 copies are
starting references, not independent calibration. Power detector configuration
differs: Aquarium 1 analog, Aquarium 2 unconfirmed digital. TDS conversion remains
unvalidated, and absent/out-of-range pH is not filled with invented readings.

Hardware is a supervised prototype: relays boot OFF, cloud failures turn relays
OFF, and outage reporting needs separately powered ESP32/networking. Voltage
accuracy is not certified by the ON/OFF test. User subsequently reported the
Aquarium 1 power indication worked, but other probe accuracy/final Aquarium 2
verification still requires physical checks. The GitHub publication step changes
no live grants, records, Firebase rules or running hardware.
