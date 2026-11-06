# Aquarium 2

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

User-confirmed identical wiring:

| Function | GPIO |
| --- | --- |
| pH | 34 |
| TDS | 32 |
| Turbidity, through 10k/10k divider | 35 |
| Temperature probes, separate 4.7k pull-ups to 3.3V | 18 and 19 |
| Ultrasonic TRIG / ECHO | 26 / 27 |
| Active-LOW light / filter relay | 16 / 17 |
| MG90S signal | 15 |
| 3.3V-safe optocoupler OUT | 33 |

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

Sensor references are copied starting values, not an independent calibration
of Aquarium 2. Verify pH buffers, temperature pair, clear/cloudy response and
empty/full ultrasonic distances on this tank. TDS remains unavailable remotely
rather than publishing an unverified homemade estimate. Power polarity remains
Unknown until tested. The same 20cm ultrasonic blind-zone assumption applies.
Telemetry requires valid temperature pair and level. Wi-Fi/auth/HTTP failure
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
