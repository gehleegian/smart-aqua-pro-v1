# Aquarium 2

## Main-branch integration (2026-11-11)

The current source preserves GPIO15 lighting, existing servo pulses/timings and
the telemetry-transport reliability fix while integrating newer main-branch
command-ID validation and schedule acknowledgements. Manual outcomes use the
retry outbox instead of issuing a second direct ACK; schedule ACKs keep their
best-effort write. Invalid feeder timing explicitly returns failure. This source
integration is not another ESP32 upload. The successful owner-reported upload
below refers to the earlier tested revision, not independent verification of
every integration path.

## Main-branch integration (2026-11-11)

The current source preserves GPIO15 lighting, existing servo pulses/timings and
the telemetry-transport reliability fix while integrating newer main-branch
command-ID validation and schedule acknowledgements. Manual outcomes use the
retry outbox instead of issuing a second direct ACK; schedule ACKs keep their
best-effort write. Invalid feeder timing explicitly returns failure. This source
integration is not another ESP32 upload. The successful owner-reported upload
below refers to the earlier tested revision, not independent verification of
every integration path.

## Owner-reported upload result (2026-11-11)

The owner reports the updated Aquarium 2 sketch uploaded successfully and its
commands are now working. This is the owner's physical observation, not an
independent assistant test of every relay order/automation scenario. No additional
Aquarium 2 firmware change was made when adding Aquarium 1 acknowledgements.

## Light/filter command reliability update (2026-11-11; not uploaded)

Inspection found two concrete software failure paths, not proof of the cause
of every physical switching failure:

- Web/mobile previously overwrote the single commands/latest slot as soon as
  Firebase accepted a write. A second action before the next ESP32 poll could
  erase the first. Completion of a database write is not device receipt.
- cloudCycle returned false on ANY telemetry upload error, even after successful
  control/command reads and actuation. The loop then switched both relays OFF
  and discarded the retained command when re-establishing its baseline.

The current software also never wrote commandAck/latest. A read-only inspection
found no ACK and recent command history marked no_response; this does not prove
the equipment failed to operate. No equipment command was sent during diagnosis.

The updated web/mobile publisher uses the existing scoped nodes and unchanged
authorization checks. It refuses to replace a recent unresolved command, uses
a compare-and-set transaction against the previous command ID, and keeps relay
actions busy until device ACK or a new, fresh matching relay telemetry report.
It uses Firebase's server clock offset and a random suffix to reduce ID collisions.
There is no automatic replay, delayed command queue, retry action or rollback
actuation. Failures/timeouts/replacement are shown as errors. Older clients using
unconditional set() can still overwrite a slot; update web and mobile together.

Older firmware (including Aquarium 1) can confirm idempotent relay state through
fresh online telemetry; this is only commanded GPIO state, never contact/flow
feedback. Feeding is never inferred from telemetry: old unacknowledged feed
commands hold the slot until the existing 30-second freshness window expires.
Feed publishing retains existing immediate UI timing; relay publishing waits.

Both Aquarium 2 sketch copies now queue done/failed ACKs for manual relay commands,
rejected/stale commands and software feeder completion/failure. ACKs use the
already allowed server timestamp and existing device-only rules. Failed ACK
writes retry only the ACK, never the action; an overwritten pending ACK is dropped.
These ACKs do not prove lamps illuminate, water flows, or food was dispensed.
Servo pulses/timings, pin assignments and sensor calibrations are unchanged.

After successful control reads, telemetry transport failures, HTTP 408/429 and
5xx no longer undo accepted outputs. No fake telemetry/heartbeat is published.
Wi-Fi loss, authentication failure, invalid/unreadable control/commands, local
DISARM, and telemetry authorization/malformed-request failures still fail closed.
No retained command is replayed at boot/reconnect; send a new explicit action
once Web controls ready is reported. Scheduled relays remain independently
evaluated; they also no longer lose their state solely to telemetry timeout.

No new RTDB nodes, rules, Cloud Functions, access permissions or analytics rules
were introduced. Aquarium 1 firmware and Aquarium 2 compensation remain untouched
by this command fix. The publisher change applies to both tanks on updated clients.
Upload the updated Aquarium2Device folder and use the updated website/mobile
build for testing. These changes were not flashed, pushed or deployed here.
Physically test both ON orders, independent OFF actions and automation after
normal startup with the feeder clear. Do not change wiring while powered.

## Current light signal: supervised GPIO15 / IN4 test (2026-11-10)

The owner moved the light channel's COM/NO connections to relay 4 and its
IN4 signal lead from GPIO16 to GPIO15. Both the repository sketch and
C:/new/Aquarium2Device/Aquarium2Device.ino now use LIGHT_PIN=15 for this test.
Filter GPIO17, continuous-servo GPIO23, sensors, identity, cloud commands,
automation logic and all calibration values are unchanged. Aquarium 1 is not
modified. Active-low outputs are initialized OFF; no automatic relay test was
added and stale cloud commands still cannot replay at reconnect.

GPIO15 is an ESP32 boot-strapping pin, so reset/startup behavior must be checked
on the actual assembly. Disconnect the 12V appliance supply and close Serial
Monitor for upload to the owner-confirmed Aquarium 2 COM3. Successful compilation
or flashing does not establish that the lamp receives power. After a successful
upload and safe reconnection, use Aquarium 2's website Manual Light OFF/ON once
and observe relay 4 and the lamps. This is an isolation test, not a verified
repair of the lighting power path. Never connect 12V to IN4, VCC or JD-VCC.

This GPIO15 build was uploaded to the owner-confirmed COM3 on 2026-11-10;
esptool verified each flashed segment and reset the ESP32. A brief serial check
observed application startup, both reported outputs OFF, successful device
sign-in, Wi-Fi/time ready, authenticated=yes, web ready=yes and telemetry HTTP
200. The optocoupler reported 12V absent during this check. No equipment command
was sent by the assistant, and lamp illumination remains physically unverified.
All 267 unit tests, both repository firmware contracts and changed-test lint
passed. The exact upload folder compiled at 1,151,105 bytes flash / 47,988 bytes
RAM after private identity and source/header parity checks.

## Current feeder: confirmed 360-degree continuous SG90 (2026-11-10)

The owner confirmed the purchased servo is the 360-degree version. The old
positional 135/45/135 degree sequence was therefore incorrect: 2000/1000us
commands speed/direction, and retaining that signal during a 1500ms dwell
continues rotation. Aquarium 1 remains positional and is NOT changed.

FEED v7 uses direct pulse widths on GPIO23 at 50Hz with checked native PWM.
There is no home-angle command. Nominal neutral is 1500us, with provisional
1600/1400us opposing speeds; rightward motion at 1600us was observed by the owner,
and the owner confirmed the 900ms forward turn is correct. Reverse 1400us/900ms
is an INITIAL return estimate, not a verified endpoint. FEEDER_CALIBRATED stays
false and FEEDER_RETURN_TEST_ENABLED is true. Website Feed Now performs one
supervised round trip: forward 900ms -> neutral hold 1000ms -> reverse 900ms ->
neutral/detach. This is NOT verified portion delivery or absolute homing.
Scheduled feeding is blocked before reservation or motion while uncalibrated;
relay schedules continue unchanged. Disabling return-test mode restores a
single-leg diagnostic jog, not an automatic feeding cycle.

The owner estimated the original 100ms jog moved about 10 degrees to the right.
The initial duration estimate for 90 degrees is therefore 100ms * 90/10 = 900ms
at the SAME 1600us pulse. A 300ms intermediate preparation was superseded before
upload by that observation. The owner then confirmed that the 900ms turn is
correct and requested return to its starting orientation. The forward setting
is preserved; return timing is initially matched but must be observed separately
because reverse speed/load can differ. The 1000ms per-leg cap remains. Serial
prints forward, hold and return durations so the uploaded version can be checked.
Keep the feeder empty, mark the starting orientation and click website Feed Now
only once, then report return undershoot/overshoot. Do not repeat blindly or
force a powered horn.

Supervised calibration requires an EMPTY, unobstructed feeder. Mark its initial
orientation, upload the matching folder and use the existing website Feed Now
once. Observe return direction, final orientation, and any creep during the
neutral dwell. Adjust neutral if necessary and verify it physically stops.
If it returns short or too far, adjust ONLY FEEDER_REVERSE_MS while retaining
the owner-accepted forward setting. Keep FEEDER_CALIBRATED=false until neutral
and the returned position are confirmed; do not enable scheduled feeding merely
because the code compiled. No duration here guarantees exactly 90 degrees.
Stopping, returned orientation and dispensed quantity require physical checks.

Calibrated operation is neutral -> timed forward -> neutral during the 1000ms
hold -> separately timed reverse -> neutral/detach. Moving PWM settling is
included in the requested leg duration, not added to it. Every motion leg is
bounded to 40-1000ms; invalid settings reject the cycle. These are software safety
bounds, not measured servo speed. Wi-Fi loss or serial DISARM aborts motion and
detaches without attempting an automatic return. Cooldown remains 5000ms.
Never hold or force a powered horn. There is no position feedback, so timed
rotation can drift with supply/load and cannot guarantee repeatable 90-degree
positioning. A positional servo/feedback is needed if exact positioning is required.

Both repository and C:/new/Aquarium2Device sources/FeederConfig.h are updated.
No firmware was uploaded, equipment operated, database modified, or web/mobile
deployment needed by this change. Existing authenticated website command route,
schedule access, water-level calibration, turbidity and optocoupler are unchanged.

Software verification: all 247 unit tests passed, including 24 targeted feeder,
firmware-isolation and relay-independence tests. Both static firmware contracts,
changed-test lint and git diff --check passed. The exact Aquarium 2 upload folder
compiled at 1,151,109 bytes flash / 47,988 bytes RAM with matching private identity
and all headers present. The compiled default remains calibration-only; successful
compilation/readback does not verify neutral, direction, angle or food portion.
The default v7 round-trip build was compiled and its full test suite rerun.
Regressions cover the 900/1000/900ms phase timings, neutral during dwell, independent
relay outputs, disabled scheduled feeding before physical calibration, invalid
return settings, cooldown, and interruption during neutral/forward/hold/return.
The owner shortened only Aquarium 2's neutral dwell from 1500ms to 1000ms;
the 1500us neutral pulse, 900ms motion legs, 5000ms cooldown and Aquarium 1
settings are unchanged. Historical positional-servo timings below are superseded.

The servo-v5 sections below are superseded where they describe positional motion.

## Current water level: fixed calibration restored (2026-11-10)

PROFILE_LEVEL_ENABLED is false in repository and C:/new/Aquarium2Device/Config.h.
The active formula is clamp((27.0-distanceCm)/(27.0-20.2)*100, 0, 100):
27.0cm is empty, 20.2cm is the chosen full reference. Dimensions/operational
litres are not used. Missing echoes or distances below 20cm remain unavailable,
not fabricated full. Web/mobile/backend must use the matching fixed policy.
Upload the matching folder with all headers; no upload was performed here.
Turbidity samples, servo v5, optocoupler and device identity remain unchanged.

## Previous profile water level implementation (superseded)

The repository and C:/new/Aquarium2Device upload now enable the same dimension /
operational-volume calculation as Aquarium 1, not the old 20.2cm-full percentage.
The existing 27cm mounting reference is retained. Valid current echoes remain
measurable even if the full volume target lies in the configured blind zone;
actual <20cm or missing echoes stay invalid, never 100%. Web/mobile show a range
warning. The "Water level upload" Serial line matches the published target/value.

Do not upload until the matching RTDB validators and ingest function are deployed,
and an authorized owner saves profile/control settings to sync its geometry.
Keep Config.h and WaterLevel.h in the upload folder. Turbidity samples, servo v5,
optocoupler, other sensors and device identity remain unchanged by this correction.
No upload, equipment command or physical verification is implied. See
../../docs/security/profile-water-level.md for rollout and limitations.

## Different-brand turbidity samples (2026-11-10)

The owner clarified Aquarium 2's turbidity probe is a different brand. The first
clear endpoint at 3.129V was subsequently confirmed clipped (raw ADC 4095/4095).
It is superseded, along with the old 2.048-2.300V cloudy samples and Aquarium 1's
unrelated 0.967/0.246V references. Fresh clear samples are 2.343, 2.340 and 2.336V;
fresh flour-cloudy samples are 0.283, 0.282 and 0.291V, all reported below raw
full-scale. Their medians 2.340V and 0.283V define the midpoint 1.3115V, retaining
the existing 20mV hysteresis. This is only an empirical sample classifier, not
NTU calibration or an approved water-quality rule. Consistency when the rinsed
probe returns to clear water still needs an owner-operated physical check.

Raw ADC is now logged. A full-scale 4095 sample, non-finite input, input below the
existing 0.15V lower guard, or at/above the original 3.0V upper measurement guard
publishes Unknown. Full-scale samples are never classified as clear water;
if it logs ADC CLIPPED, this change does not pretend to fix the physical range.
The assumed module-voltage multiplication is removed from this device's Serial
output. Wiring safety still requires an appropriate divider and 3.3V-safe signal.

Only Aquarium 2 repository/upload sources change. Aquarium 1 references, pH/TDS,
servo v5, relays, power-outage boolean, identity and authorization are preserved.
Existing categorical turbidityState is used; no numeric NTU, schema, backend or
mobile/web business-rule changes. Upload and a supervised clear/cloudy/clear test
are still required; compiling and offline classifier tests are not hardware proof.

The fresh-sample update requires another upload and supervised clear/cloudy/clear
test. It has not been uploaded or physically verified by the software checks.
Verification: all 231 unit tests, targeted ESLint and static firmware checks
passed. The exact upload folder compiled with its real device settings
(1,151,349 bytes flash / 47,988 bytes RAM). No equipment command was sent.

## 12V outage push signal (2026-11-09)

The sketch now publishes `mainsPresent` from the confirmed GPIO33 optocoupler
polarity (LOW = present, HIGH = absent), using the same single digital read for
the boolean and `powerStatus`. The power-alert rule needs this boolean; the old
label-only payload did not activate it. Unconfirmed polarity publishes Unknown
without a mains boolean. No GPIO, sensor calibration, relay or servo behavior was
changed. The prepared `C:/new/Aquarium2Device` upload copy is updated too.

Upload and a supervised outage/restore push-receipt test are still required.
ESP32 and Internet power must remain available to report 12V loss; otherwise the
existing delayed device-offline path applies. See `../../docs/notifications.md`.

## Current feeder settings: match Aquarium 1 (2026-11-09)

The owner confirmed Aquarium 2's servo now moves after repairing a faulty wire.
At the owner's request, v5 matches Aquarium 1's 500-2500us angle mapping:
135-degree home = 2000us, 45-degree dispense = 1000us, at 50Hz. The previous
1750/1250us test positions are superseded. Home -> dispense -> 1.5s hold -> home,
600ms travel allowances and 5s post-cycle cooldown match Aquarium 1. These are
electronic commands, not independently verified physical angles or feed portions.

Aquarium 2 retains GPIO23 and its native attach/write/readback error checks,
immediate local-stop handling, boot-without-PWM behavior and replay protection.
Its device identity, power detector, outage boolean, sensors, relays and backend
permissions are unchanged. Both repository and C:/new/Aquarium2Device upload
copies are updated. No upload or physical test of v5 is implied; test empty with
the arm clear after upload, as the commanded travel differs from v4.

Verification: all 225 unit tests, targeted ESLint and the static firmware contract
passed. The real-settings ESP32 compile passed (1,151,157 bytes flash / 47,980
bytes RAM). No firmware upload or equipment command was performed.

## Historical SG90 correction and isolation test (superseded settings)

2026-11-09 pending v4: Aquarium 2's web-controlled feeder now uses the core-3
LEDC API directly, checking attach/write results and frequency/duty readback
after two PWM frames. The installed ESP32Servo library can leave its attached
flag true when hardware attachment fails, so the prior check could miss a
failure. This is an error-detection fix, NOT a proven explanation of the
reported lack of movement. GPIO23 and nominal 1750/1250us positions are retained;
light/filter pins, sensor calibration, Firebase schema and permissions are
unchanged. Local DISARM immediately releases feeder PWM. Driver readback is
not electrical signal measurement, UBEC voltage measurement or motion feedback.
No upload or physical servo movement is implied by editing/compiling v4.

v4 verification: 25 focused tests passed (including 8 stubbed driver/control-flow
tests), static contract checks and diff whitespace checks passed. Real-settings
ESP32 core 3.3.8 compilation passed: 1,151,049 bytes flash / 47,980 bytes RAM.
After owner confirmation of COM3, empty/clear feeder, closed Serial Monitor and
disconnected light/filter appliances, v4 uploaded to COM3 with verified flash
hashes and reset. Pre-upload control read confirmed Manual and automation OFF.
No Feed/equipment command was sent. Servo movement remains unverified; inspect
the FEED v4 / FEED PWM lines from an owner-operated website test next.

The owner clarified Aquarium 2's working servo is SG90, not MG90S, and reports
it previously worked with this same ESP32. The prepared main sketch now maps
its provisional 135/45-degree positions across 1000-2000us, producing
1750/1250us, rather than Aquarium 1's wider 500-2500us mapping. Home/direction
and actual quarter-turn still require physical validation; no certified angle
calibration is claimed. Hold remains 1.5s and cooldown 5s.

The separate C:/new/Aquarium2ServoTest now uses temporary GPIO23, not GPIO15,
with the same SG90 pulse settings, one-shot arming, and delayed PWM checks.
It is NOT a verified repair. The owner moved the orange signal to GPIO23 and
then requested a WEB-controlled test instead of serial F. The prepared main
firmware now also uses GPIO23 for that authorized test; it uses the existing
Feed command with no new Firebase schema, credentials or permission changes.
Keep the orange signal on GPIO23 unless the firmware is explicitly changed.
Disconnect appliance power and move only the orange signal wire with
all power off before an authorized GPIO23 test. Never upload/actuate while the
unexpected filter operation remains physically unisolated. UBEC wiring is not
changed by this test. No automatic feeding or remote actuation was performed.

## Owner-confirmed shared calibration update (2026-11-09)

The owner reports Aquarium 2 was calibrated and matches Aquarium 1's outputs.
The prepared upload at C:/new/Aquarium2Device now includes the latest partial
telemetry, independent temperature-probe recovery and pH/TDS extrapolation.
TDS is enabled with 0.169 V / 80 ppm and 1.304 V / 314 ppm; out-of-span
estimates require meter verification, especially cold or very pure water.
Correction: the owner clarified Aquarium 2 uses a digital optocoupler, not
Aquarium 1's analog voltage module. GPIO33 is now read digitally; analog 5:1
scaling and copied analog ON/OFF references are not used. The previous analog
configuration was inappropriate and its 0.142 V / 0.71 V estimate did not measure
the 12 V rail. The owner then supplied two Serial captures: GPIO33=0 with
12 V plugged in, and GPIO33=1 with 12 V removed while USB stayed connected.
POWER_PRESENT_LEVEL is now 0: LOW publishes Online, HIGH publishes Power
Interruption. Output VCC must be 3.3 V, OUT goes to GPIO33 and output GND to
ESP32 GND; these readings establish polarity, not output voltage certification.
Do not connect a 12 V output to ESP32 or use the
temporary Aquarium2VoltageTest sketch for this digital detector.
This does not repair or explain physical relay switching. Pins, relay and servo
timing match Aquarium 1; credentials, device identity and schedule storage stay
Aquarium 2-specific. No Firebase authorization or database schema changes.
The legacy 27.0 cm empty / 20.2 cm full level reference is retained; profile-based
level remains disabled until this tank's final dimensions/volume are valid.
Keep every header in the sketch folder, including the newly added WaterLevel.h.
Compile and physical confirmation are separate; no upload is performed by editing.

The live enclosure ID is intentionally redacted. Read it from the private
registration manifest, and copy DeviceIdentity.h.example to ignored
DeviceIdentity.h with this device's own identity before a real-settings build.
REDACTED-AQUARIUM2-ID below is a placeholder, not a claimable device ID.

Open Aquarium2Device.ino directly in Arduino IDE. Keep every .h file in this
folder alongside it. ESP32 Dev Module; Arduino ESP32 core 3.3.8. The private
header is C:/Users/marin/firebase-private/aquarium2-firmware-secrets.h. Its own
Firebase device credentials and reserved aquarium ID are configured there.
The current Wi-Fi values were copied privately from Aquarium 1; edit this
Aquarium 2 header if its network differs. Never share the filled header/binary.

User 2 signs into their normal account and claims REDACTED-AQUARIUM2-ID through
Aquariums > Add Aquarium, using the actual Aquarium 2 profile. Registration
does not assign a guessed owner or create synthetic readings. Device Auth UID:
esp32-REDACTED-AQUARIUM2-ID. Aquarium 1's identity and owner remain unchanged.

Wiring (with the owner-corrected power detector type):

| Function | GPIO |
| --- | --- |
| pH | 34 |
| TDS | 32 |
| Turbidity, through 10k/10k divider | 35 |
| Temperature probes, separate 4.7k pull-ups to 3.3V | 18 and 19 |
| Ultrasonic TRIG / ECHO | 26 / 27 |
| Active-LOW light / filter relay | 16 / 17 |
| SG90 signal; current web-controlled isolation test | 23 |
| Digital optocoupler OUT; verify 3.3V-safe level before use | 33 |

Same control behavior as the latest Aquarium 1: quarter-turn left using the
provisional electronic 135/45-degree settings, 1.5-second dwell, return home,
five-second post-cycle cooldown. Check physical direction/rest with an empty
feeder. Servo power is regulated 5V with a shared signal ground, not 3.3V.
Both relays boot OFF; no servo PWM starts without an authorized feed cycle.

After claiming, save complete UTC+8 schedules once from the web UI. Manual
commands work with automation enabled, overriding light/filter until the next
scheduled boundary. Device reports lightState and filterState for the manual
panel. Requested relay output is not independent lamp/flow feedback. Automatic
feeding uses a separate aq2-schedule persistent replay guard.

Sensor references are reused on the owner's confirmation of matching outputs.
Verify pH buffers, temperature pair, clear/cloudy response and empty/full
ultrasonic distances on this tank after upload. TDS uses the meter-based line,
not the old homemade estimate. The same 20cm ultrasonic blind-zone assumption
applies. Individual sensor faults no longer suppress all telemetry. Wi-Fi/auth/HTTP failure
turns both relays OFF: use under supervision, not unattended livestock operation.

This source fork changes only the identity/configuration, display labels and
persistent schedule namespace. Static checks and real-settings compilation
must pass before upload. Firmware upload and hardware verification are recorded
in the website docs/security/aquarium2-live-setup-status.md report.

2026-11-07: real-settings build passed (1,154,865 bytes flash, 48,156 bytes RAM),
static and source-isolation tests passed, and firmware uploaded to user-confirmed
COM3 with verified hashes. Live serial showed Wi-Fi/time ready, device signed in
and both temperature probes reading 24.06C. Registration remained unclaimed;
website control becomes available after the intended User 2 account claims it.
pH and turbidity returned invalid/out-of-reference results during observation
and need verification on this tank. No relay/servo command was issued by setup.
