# Aquarium 1 live setup status - 2026-11-06

## Device output state synchronization - 2026-11-07

Implemented the requested automation-to-manual state display: the ESP32 reports
optional telemetry.lightState (On/Off) alongside its existing filterState.
Web monitoring and mobile controls resolve fresh, valid device reports before
saved manual values, so automatic ON yields the appropriate OFF/Stop button.
The mobile expanded control panel now subscribes through the existing authorized
telemetry service. Stale/invalid/missing reports fall back to saved values.
Reported states are commanded relay outputs, not measured lamp/flow operation.

Changed Aquarium1Device.ino, web types/device.ts, deviceTelemetryParser.ts and
useMonitoringController.ts; mobile domain.ts, device-telemetry-parser.ts,
aquarium-control.ts and use-aquarium-control.ts. Added regression coverage to
automation-controls.test.mjs and database.rules.test.mjs. This implements the
supported-equipment controls and web/mobile consistency requirements.

The only database-rule change is the optional lightState enum validator; live
preflight proved all other rule content equal. No ownership, authorization,
schedule or command was written by setup. deploy-relay-state-rules.mjs deployed
and read-back verified the rule; rollback metadata is under ignored
backups/relay-state-rtdb-1793981251417. Firestore rules were not changed.

Verification: 45 RTDB emulator tests, four client regression tests, both client
TypeScript checks, targeted lint, firmware static checks and compilation passed.
Build: 1,154,865 bytes flash (88%); 48,156 bytes global RAM (14%). COM5 upload
hashes verified. Serial confirmed web ready=yes and telemetry HTTP 200. A live
read afterward confirmed lightState=Off and filterState=Inactive, fresh telemetry
and automationEnabled=false. The user must still verify an automatic ON updates
the rendered panel and the subsequent manual OFF physically switches equipment.

## Automation revision

Source now supports UTC+8 daily feeding, light ON/OFF windows and filtration
runtime schedules. The automationEnabled toggle is independent of the selected
UI mode tab; manual commands remain available in both web and mobile. Manual
light/filter overrides last until the next scheduled boundary, schedule edit,
toggle reset or reboot. Web control profiles now send lightOnTime/lightOffTime,
which the prior web builder omitted. Save the schedule from the updated UI to
populate those missing fields. Incomplete schedules skip automation without
blocking manual access. Authorization and database rules are unchanged.

Scheduled feeds use a persistent reservation before movement, one attempt per
scheduled minute, skip startup/reconnect/edit minutes and never catch up missed
feeds. They share the 1.5-second hold and five-second post-cycle cooldown.
Firmware compile (1,154,817 bytes flash; 48,156 bytes global RAM), compile-time
schedule regression checks, three client tests, both client TypeScript checks
and targeted lint passed. Hardware schedule execution is not yet verified.
Live read before upload showed automation disabled and fresh telemetry.
Final revision uploaded to confirmed COM5 with verified flash hashes. Serial
observation afterward showed authenticated=yes, web ready=yes and successful
HTTP 200 telemetry uploads. Existing automation remained disabled; no equipment
command or schedule activation was sent by the assistant. Runtime schedule
boundaries and physical manual overrides remain supervised user tests.

## Completed

- Verified existing Firebase Auth UID `esp32-SAQ-7K3M-9R2X` is enabled and has
  `principalType=device`. Existing private login matches it.
- Successfully tested email/password sign-in, verified the ID token with revocation
  checking, refreshed it and verified the refreshed device role. No password reset.
- Registered enclosure `SAQ-7K3M-9R2X` in `practice-smartaqua`: one private device
  registry document and one UID binding. State is **unclaimed**. The reserved
  aquarium ID was saved privately and checked against the live registry.
  No customer profile, sample aquarium or owner assignment was changed.
- Created ignored `.env.local`, preserving `.env`. Migrated Vite public Firebase
  settings to Next.js names and configured the external Admin key path. No Admin
  private key was copied into the repository.
- Created `C:\Users\marin\firebase-private\aquarium1-firmware-secrets.h` with the
  Firebase API key, device login and reserved aquarium ID. `Config.h` loads it
  on this computer. User-provided Wi-Fi values are populated; missing Arduino
  quotes were repaired with a private backup. No values were printed.

## Enabled and verified

- Local server claiming is enabled; firmware cloud mode is 1.
- Customer will claim from Add Aquarium; no user was impersonated or assigned.
- Real-settings firmware compiled and uploaded to user-confirmed COM5. Flash
  hashes verified and ESP32 reset successfully. Initial busy-port failure was
  resolved by the user closing Serial Monitor.
- Cloud mode boots with relays OFF, then accepts fresh web commands only after
  authentication and a command baseline. Serial ARM is not required. Reconnect
  also takes a new baseline; retained commands are skipped. Feeder stays disabled.
- Focused Firestore claiming rules deployed and read-back verified. RTDB rules,
  Cloud Functions, Vercel deployment and billing plan were not changed.
- Local website http://127.0.0.1:3000 returned HTTP 200; claim route returned 401
  for a deliberately invalid token, not a configuration-unavailable 503.
- Focused rules/claim/RTDB emulator suite: 72 passed, zero failed/skipped.
  TypeScript and targeted lint passed. Firmware static contract checks passed.
  Real build: 1,132,426 bytes flash (86%), 47,684 bytes global RAM (14%).
- No equipment command, synthetic telemetry or customer claim was sent by setup.

## Focused rules deployment

Read-only backups: `backups/aquarium1-rules-1793885457188` (git-ignored), including
the original Firestore ruleset ID for rollback reference.

The deployed source is firestore.claiming.rules, not the broader firestore.rules.
It preserves legacy sample edits/deletion and existing support behavior, while
adding the claiming/profile/security-policy checks. Private registry collections
remain client-inaccessible. The backup folder's claiming-deployment.json records
the previous/deployed ruleset IDs and candidate hash for rollback/audit.
Do not deploy the broader rules file without separately reviewing its changes.

RTDB comparison must ignore JSON key order. The initial string comparison
reported a difference; `check-saved-rule-diff.mjs` confirmed structural equality.
No RTDB rule deployment is needed for the existing firmware contract.

## Files and verification

New operator scripts: audit-aquarium1-setup.mjs, inspect-live-rules.mjs,
configure-aquarium1-local.mjs and check-saved-rule-diff.mjs. No credentials or
tokens are printed. Configuration uses exclusive creation to preserve existing
files; environment round-trip and registry/manifest consistency checks passed.
Firmware Config.h and README were updated for the external private header.

Private files inherit Windows folder permissions; POSIX mode is not a Windows ACL
guarantee. The existing operator key is local-development setup only; use a
dedicated least-privilege server identity before public hosting.

Physical ESP32 sign-in and authenticated control/command reads are now verified:
after correcting the HTTP transmit buffer for the long Firebase-token request
line, COM5 reports authenticated=yes and web ready=yes. The prior ESP_FAIL/HTTP
-1 database transport error stopped during observation. Firmware compile/static
checks and upload hash verification passed. No Firebase rules or ownership were
changed for this fix. Sensor accuracy, power polarity and physical relay/lamp
operation remain unverified. GPIO19 currently returns invalid temperature, so
telemetry remains withheld independently of the working command-read path.

## Next supervised user test

Sign in as the intended normal User at http://127.0.0.1:3000. Add Aquarium using
SAQ-7K3M-9R2X and the real aquarium profile. Open Monitoring, select that aquarium,
and click Manual even if it appears selected. Allow 10–15 seconds for the device
baseline, then test Light On/Off one command at a time. Verify physical response.
Test Filter Active/Inactive only with the pump safely submerged/primed.
This test firmware turns the filter OFF on connection failure; it must not be
left responsible for an unattended stocked aquarium. TDS/NTU remain unavailable
remotely rather than publishing unverified numerical calibration.

## 2026-11-07 live-reading stability correction (supersedes earlier sensor status)

Both temperature probes now report finite readings. Read-only COM5 observation
confirmed authenticated HTTP 200 telemetry uploads before and after this change.

Changes for validated live monitoring and web/mobile consistency:

- Web Monitoring and Dashboard advance their freshness clock on shadow receipt,
  rather than temporarily treating new server timestamps as future readings until
  the old five-second timer catches up. Genuine future/stale timestamps remain
  invalid. Mobile records receive time in its subscription and uses the later of
  receive time and its periodic freshness timer without reading the clock in render.
- Both firmware sources use five independent echoes, spaced 100 ms apart, and a
  median requiring at least three valid echoes. Invalid batches do not reuse old
  readings. Existing 20 cm blind-zone assumption and 27.0/20.2 cm references remain.
  Water-level display rounds to one decimal; stored measurements are unchanged.
- Optional `telemetry.turbidityState` carries Clear/Cloudy/Unknown separately from
  numeric NTU. Both parsers and monitoring displays support it; it is NOT converted
  into NTU or used to invent numeric assessment thresholds/history. The web now
  distinguishes missing validated TDS/pH/turbidity from waiting for an entire feed.
- Only the optional categorical validator was deployed to RTDB. Structural live
  preflight and read-back verified unchanged authentication, ownership and other
  validators. Backup: `backups/turbidity-state-rtdb-1793984131333`.
  No Firestore rules, grants, identities or calibration coefficients changed.

Verification: 89 targeted regression/control/parity tests and 46 RTDB emulator
tests passed; web/mobile TypeScript and changed-file ESLint passed. Aquarium 1
compiled (1,155,229 bytes flash; 48,156 bytes RAM), including compile-time median
filter assertions, and uploaded/hash-verified on COM5. Aquarium 2 source was kept
in parity for its next upload, but Aquarium 2 was NOT uploaded during this fix.

Post-upload samples: both temperatures valid (mean about 26.66 C), pH about 8.28,
Cloudy, water level about 87.1%; HTTP 200 and five valid echoes per batch observed.
Read-only live Firebase verification confirmed those fields, online=true and a
10-second-old sample. Relays restarted OFF; no equipment command was issued.
Browser visual confirmation remains a user test, not a claimed verification.

Remaining limits: the 6.8 cm chosen level span amplifies small echo changes;
median filtering cannot eliminate sustained reflections, waves or blind-zone
effects. Invalid temperature/echo batches still withhold the complete snapshot
under the existing required-field contract, rather than fabricating readings.
TDS remains explicitly invalid pending a validated conversion; power remains
Unknown pending polarity testing. Probe accuracy, Clear/Cloudy classification in
the final tank, actual water height and pH calibration still need physical checks.

## 2026-11-07 Aquarium 1 analog voltage-module correction

Owner corrected the hardware identification: Aquarium 1 uses a passive DC 0-25 V
voltage module monitoring the 12 V supply, S connected to GPIO33, not an optocoupler.
The preceding polarity notes do NOT apply to Aquarium 1.

Aquarium1Device Config.h now explicitly selects analog mode and nominal 5:1
scaling. The sketch samples GPIO33 using analogReadMilliVolts averaging, INPUT
without pull-up and ADC attenuation, and reports signal/supply volts in Serial.
Digital polarity classification is bypassed in analog mode. Power remains Unknown
until a supervised supply-ON/OFF test establishes decision thresholds; no threshold
or calibration accuracy was fabricated. The web's Unknown message now says power
detector setup is not verified instead of claiming it must be a polarity issue.
README, static checks and source-parity tests were updated. Shared sketch changes
also exist in Aquarium 2 source, but its Config.h explicitly keeps the prior
digital mode; its actual detector needs separate confirmation. No A2 upload.

Software verification: 8 targeted stability/control/parity tests, static contract
checks, web TypeScript and changed-component ESLint passed. Real-settings compile
passed (1,155,429 bytes flash; 48,172 bytes RAM). COM5 upload hash verified; both
relays restarted OFF, and no equipment commands were issued. Read-only Serial
observation showed GPIO33 2.515 V, estimated input 12.57 V, and telemetry HTTP 200.
This verifies analog acquisition and communication, not multimeter accuracy or
power-loss detection. No Firebase fields/rules/grants/ownership changes were made.

Next required physical step: briefly switch OFF only the monitored low-voltage
12 V supply, keeping ESP32 USB-powered, record the analog signal and restore supply.
Do not touch exposed mains. Classification/website power indication remains pending
that measurement and comparison with a multimeter. This is a partial hardware fix,
not a claim that power interruption detection is calibrated or fully verified.

### Supply-OFF measurement captured

Owner confirmed the monitored 12 V supply was unplugged, while ESP32 remained
USB powered. COM5 was initially held by Arduino serial-monitor.exe PID 18316;
only that identified helper was closed (IDE left open), then a read-only capture
recorded two samples at GPIO33 0.142 V, versus the prior ON reading of 2.515 V.
Nominal x5 OFF display was 0.71 V; this is not a verified residual supply voltage
and may reflect ADC low-end behavior. No automatic zero calibration was applied.
Firebase HTTP 200 continued; relays stayed OFF and no command was issued.
Owner was immediately instructed to restore 12 V after capture. Reconnected-ON
confirmation and classification thresholds/upload remain pending; current website
powerStatus is still Unknown. No database or authorization changes in this step.

### Analog power-presence classifier installed after restoration

Owner confirmed 12 V back ON. COM5 measured GPIO33 2.514 V (nominal input
12.57 V), consistent with initial 2.515 V ON and unplugged 0.142 V OFF.
Aquarium1Device/Config.h now stores those measured signal references. New
PowerSignal.h derives midpoint (OFF+ON)/2 = 1.3285 V: above reports Online,
below Power Interruption; exact midpoint, invalid references/signals or a
saturated 12-bit ADC check reports Unknown. This only distinguishes the two
tested supply states, not a calibrated undervoltage limit or accurate voltmeter.
No automatic relay/servo action was added. No ADC-zero correction was applied.

Updated files: A1 Config.h, sketch, PowerSignal.h, verify-contract.mjs, README;
A2 common sketch/helper and disabled reference configuration retained digital
mode and separate identity; web firmware parity test covers both configurations.
Aquarium 2 was not uploaded or calibrated from these measurements.

Verification: 89 targeted web/mobile stability/control/parity/assessment tests,
static firmware checks and nine compile-time PowerSignal assertions passed.
Real-settings compile passed (1,155,717 bytes flash; 48,180 bytes RAM); COM5
upload hash verified. Serial showed power Online, 2.514-2.515 V signal and HTTP
200. Read-only Firebase confirmed powerStatus Online, online true, sample age
4 seconds. Both relays restarted OFF; no equipment command was issued. Existing
powerStatus field/enums were reused; Firebase schema, rules, accounts, grants and
ownership were unchanged. Requirements: truthful validated power reporting and
correct aquarium/device association; no guessed water-quality rules.

Remaining physical verification: user must observe the final firmware/website
transition to Power Interruption and back after a brief unplug/reconnect. The
captured OFF measurement and compile-time classification test are not an end-to-
end outage verification after upload. A shared/same-source ESP32/Wi-Fi outage
cannot be reported live; ESP32 and networking must remain powered independently
(USB/backup) for live interruption reporting. Disconnected signal/ground faults
cannot be distinguished reliably from supply loss by this single divider.
Voltage scaling accuracy still requires comparison with a multimeter.
