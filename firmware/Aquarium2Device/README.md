# Aquarium 2

## SG90 correction and pending isolation test

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
