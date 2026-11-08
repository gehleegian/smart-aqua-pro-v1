# Aquarium 1 supervised Arduino test

**Prepared profile-level update; not yet activated on hardware.** Empty remains
27.0 cm; the new 100% target comes from operational litres and internal tank
dimensions. Do not upload until final dimensions/volume are validated and the
updated RTDB schema is deployed. See `../../docs/security/profile-water-level.md`
for calculation, clearance limits, partial-telemetry behavior and activation order.
The older 20.2 cm-full notes below describe the previous reference-span firmware,
not the profile-based path enabled in the current prepared source.

Open `Aquarium1Device.ino` in Arduino IDE. Keep `Config.h` in the same folder.
This is an integration-test candidate, not a completed unattended aquarium
controller. Live registration, focused claiming rules and the local claiming
server are now configured. The owner must still claim the device in the website.

## Automation and manual overrides (2026-11-06)

2026-11-07 update: telemetry now includes optional lightState (On/Off), alongside
filterState (Active/Inactive), to report commanded relay outputs after scheduled
or manual actions. Both apps prefer fresh device output reports over saved manual
values when displaying controls and choosing the opposite command. Reports are
not independent lamp/flow feedback. The new optional RTDB validator must be
deployed before this firmware is uploaded. Legacy devices without lightState
remain compatible. Device telemetry still requires valid temperature/level samples;
missing/stale reports fall back to saved manual values, not a predicted schedule.
This revision compiled successfully (1,154,865 bytes flash, 48,156 bytes RAM) and
was uploaded to COM5 on 2026-11-07 with verified hashes. The optional validator
was deployed first after 45 emulator tests passed; live rule read-back matched.
Four client tests plus TypeScript/lint checks passed. Post-upload live data
confirmed lightState=Off and filterState=Inactive with successful telemetry.
Rendered automatic-ON/manual-OFF behavior still needs a supervised user check.

The current firmware runs the saved daily feeding, lighting and filtration
schedules when automationEnabled is true, regardless of the selected Manual or
Automation tab. Times use Asia/Singapore UTC+8. Light schedules may span midnight;
filtration supports the saved 1–24 hour runtime. Equal light ON/OFF times are
rejected. Save the schedule once from the updated website to populate the light
times missing from older web control profiles. Incomplete schedules are skipped
while authenticated manual commands remain available.

Manual light/filter commands take priority until that equipment's next scheduled
ON/OFF boundary. Saving changed schedule times or disabling/re-enabling automation
resets overrides. Opening a different tab does not disable automation. Disabling
automation leaves current output states in place for manual control. Overrides
are not restored across a reboot; an enabled valid schedule is applied after
authenticated control access. A 24-hour filter schedule has a daily boundary at
its configured start, so a manual stop lasts until that boundary.

Automatic feeds occur only in the matching scheduled minute. Startup, reconnect,
schedule edits and enablement skip that current minute; missed feeds are not
caught up. A persistent pre-motion reservation prevents repeated scheduled feeds
after polling, duplicate times, clock rollback or reset. Reservation failure
skips the feed. A manual feed suppresses an automatic feed in the same minute.
Manual and scheduled feeds share the existing 1.5-second hold and 5-second
post-cycle cooldown. Feeding requires authenticated cloud access; the device
does not run cached schedules through network/access failure.

The HTTP/authorization failure policy still turns both relays OFF. This is a
supervised prototype, not an unattended stocked-tank controller. No client timer
or requested dashboard state proves physical equipment operation. This change
requires a supervised schedule/override test after upload; no schedules were
enabled or equipment commands issued by setup.

Verification: the real-settings automation build used 1,154,817 bytes flash
(88%) and 48,156 bytes global RAM (14%). Compilation executed ScheduleLogicTests.h
assertions for time parsing, overnight/full-day windows and override boundaries.
Web/mobile schedule payload and validation tests, both TypeScript checks and
targeted lint passed. COM5 upload hashes verified; post-upload serial confirmed
authenticated=yes, web ready=yes and HTTP 200 telemetry. Automation remained
disabled. Physical schedule execution and override timing still need a user test.

## Try the hardware now, without Firebase

1. Board: **ESP32 Dev Module**, Arduino ESP32 core **3.3.8**. Libraries:
   **ArduinoJson 7**, **OneWire**, **DallasTemperature**.
2. For this optional offline test, change `#define AQUARIUM_CLOUD_ENABLED 1` to `0`
   in `Config.h` (the supplied configuration defaults to cloud enabled).
   No passwords are needed locally.
3. Keep the turbidity 10k/10k divider and existing calibrated pH/TDS wiring.
   ESP32 inputs must be 3.3V-safe, including ultrasonic ECHO and optocoupler OUT.
   Power the optocoupler OUTPUT-side VCC from 3.3V, not its 12V input supply.
   Do not immerse exposed circuit boards. Do not change wiring while powered.
4. Upload, then open Serial Monitor at **115200 baud**, line ending **Newline**.
5. Verify sensor readings first. `nan` means unavailable/outside the accepted range.
6. First test relay clicks with the load supply disconnected. Send each command
   separately: `ARM`, `LIGHT ON`, `LIGHT OFF`, `FILTER ON`, `FILTER OFF`.
7. Send `DISARM` to switch both outputs off. After verifying wiring/polarity,
   repeat under supervision with suitable loads. Do not run a pump dry.

`STATUS` reports commanded output states, not measured lamp operation or flow.
There is no automatic relay-on sequence at startup. Reset/upload turns outputs
OFF and requires ARM again in offline mode. Serial responses can be delayed by sensor acquisition
and, in cloud mode, blocking network requests; this is not an emergency-stop system.
Use physical power isolation when necessary. Do not leave this test firmware
responsible for a stocked tank: a connection failure intentionally turns the filter OFF.

## Pins and recorded references

| Function | GPIO / reference |
| --- | --- |
| pH | 34; recorded ESP32 voltages 2.438V=4.01, 2.287V=6.86, 2.103V=9.18 |
| TDS | 32; 0.314V baseline, 1.314V homemade reference |
| Turbidity | 35; two 10k resistors; clear ~0.967V, cloudy ~0.246V |
| Ultrasonic | TRIG26, ECHO27; empty 27.0cm, selected full 20.2cm |
| Water temperatures | 18 and 19, both confirmed in water |
| Light / filter relays | 16 / 17, active LOW |
| Analog voltage module S | 33, nominal 5:1 divider; 12 V DC monitored input |
| Feeder | 15, MG90S; provisional 135° home / 45° dispense; 1.5-second dwell |

Temperature shows each probe and their mean; both must return valid readings
before the mean is sent remotely. No invented temperature offset is applied.
The 85C power-on sentinel is conservatively rejected. A failed probe is not
silently replaced by the other one.

pH uses the saved piecewise buffer fit, without multiplying the already measured
ESP32 voltages by a divider factor. Outside the buffer interval, pH is omitted.
These constants come from the existing saved sketch; hardware accuracy still
needs verification with the actual buffers.

Turbidity voltage DECREASED in your cloudy test. The local Clear/Cloudy label uses
the midpoint of the two measured samples, with a 0.02V anti-flicker margin. This
distinguishes those samples; it is not NTU calibration or proof that water is safe.

The previous saved sketch's 317ppm reference is only a homemade sea-salt-equivalent
estimate. The full A/B/C dilution recipe and salt purity were not independently
verified. It is shown locally within the recorded range, not represented as
accurate TDS and not published into water-quality rules.

Water level is a percentage of the chosen 27.0-to-20.2cm span, not total tank
capacity. AJ-SR04M is assumed; 20.2cm is very close to its assumed 20cm blind zone.
No echo or readings below that limit are invalid, not a full tank.

Aquarium 1 uses a passive analog voltage module, NOT an optocoupler. Its S pin
connects to GPIO33, configured INPUT without a pull-up and with ADC attenuation.
Serial reports measured signal volts and estimated supply volts using nominal
5:1 scaling. Supervised measurements were OFF 0.142 V, ON 2.515 V and restored
ON 2.514 V. The firmware uses their 1.3285 V signal midpoint as a presence
discriminator: above means Online, below means Power Interruption; an exact
boundary, invalid references/signal or saturated ADC sample means Unknown.
This is NOT an undervoltage protection limit or calibrated voltage meter.
Verify voltage scaling against a multimeter. POWER_PRESENT_LEVEL is unused
in Aquarium 1's analog mode. Never connect mains or a 25 V input directly
to this divider/ESP32 combination. Its signal must stay within ESP32 limits.

## Website command testing

1. Open http://127.0.0.1:3000 on this computer. Live registration of enclosure
   `SAQ-7K3M-9R2X`, local claiming and focused rules deployment are complete.
   No Vercel deployment is necessary for this local test.
2. Claim the enclosure from the intended normal User account.
3. This computer now loads credentials from
   `C:\Users\marin\firebase-private\aquarium1-firmware-secrets.h` through `Config.h`.
   Firebase API key, unique device login and reserved aquarium ID are configured.
   Wi-Fi SSID/password are populated in that PRIVATE header, not in chat.
   On another computer without that header, the blank fallback values in
   `Config.h` are used instead.
   Aquarium ID is NOT the enclosure ID or a sample aquarium's ID. Never put a
   service-account key or a human user's credentials in the ESP32.
4. Keep `#define AQUARIUM_CLOUD_ENABLED 1` and upload. The private config
   is git-ignored. Credentials compiled into prototype flash are not protected
   against physical extraction; secure provisioning/flash protection is still
   needed before customer deployment. Do not share filled config or binaries.
5. Wait for sign-in and command access. Select Manual mode, automation disabled,
   in the website, even if Manual already appears selected. Allow 10–15 seconds
   for a command baseline, then send a NEW website Light On/Off or Filter
   Active/Inactive command. Cloud mode does not require a Serial ARM command.
6. Verify each physical response before sending another command. The existing
   latest-command slot can overwrite rapid commands; there is no device cloud
   acknowledgement endpoint. Website submission alone does not verify actuation.

Existing commands are skipped on startup/reconnect/ARM. New commands must match
the aquarium, have a requester, be newer than the baseline/last applied timestamp,
and be no more than 30 seconds old or 5 seconds ahead of ESP32 network time.
These are supervised-test command freshness margins, not water-quality thresholds.
The client computer clock must be correct. Manual commands are idempotent states,
not toggles. Daily schedules use the Automation toggle; sync_control does not
directly actuate equipment. No retained
desired output is automatically restored after reset. Wi-Fi/auth/access/HTTP
failure disarms both outputs, with retry backoff. Successful reconnection takes
a new baseline before automatically allowing fresh web commands. Serial DISARM
latches a local stop until ARM or reboot; no retained command is replayed.

## What currently reaches Firebase

### Manual feeder supervised test

The owner confirmed an empty feeder and unobstructed arm for the first test.
FeederConfig.h enables provisional electronic angles 135° -> 45° -> 135°,
reversing the original proposal for the owner's requested left turn.
These are not mechanically calibrated; horn orientation and direction must be
checked by the owner. No servo PWM is attached at boot. A fresh authorized
Manual-mode feed_now command establishes home, allows 600ms travel, commands
dispense, allows 600ms travel, holds for 1500ms, then commands home, waits 600ms
and detaches PWM. Position is commanded, not measured. Disconnection or local
DISARM shortens the dwell; a return-home command is still issued. Loss of power
cannot guarantee closure. Network requests are excluded from the dwell section.
Use the owner-requested 5-second device cooldown after each cycle; stale or repeated
command IDs are not replayed. The fixed physical dwell is 1.5 seconds regardless
of legacy web/mobile durationMs (their existing 10-second UI activity window is
not servo-position feedback). No client protocol or Firebase rules were changed.
Do not force the arm by hand while energized; cut servo power if it binds/buzzes.
An empty, supervised physical direction/return test is still required.

2026-11-06: left-turn test revision compiled (1,149,037 bytes flash, 48,076 bytes
global RAM), static contract checks passed, and COM5 upload/hash verification
completed successfully. Changed Aquarium1Device.ino, FeederConfig.h,
verify-contract.mjs, Config.h comments and this README. No Firebase rules,
ownership, web/mobile protocol, or sensor thresholds changed. Physical feeding
was not triggered by setup; direction, rest alignment and dwell need observation.

Only after setup and authorization succeed: complete current snapshots containing
the temperature mean, level percentage, valid in-range pH, commanded filter state,
power status (Unknown until detector setup verified), Unknown equipment status and a
server timestamp. If required temperature/level data is invalid, no fresh snapshot
is fabricated; the previous snapshot becomes stale. No history or fake readings.

TDS is flagged unavailable remotely. Turbidity Clear/Cloudy remains Serial-only
because the current web/mobile/rules contract accepts numeric turbidity and cannot
truthfully carry this categorical result. Adding a proper categorical field and
estimated-TDS presentation needs coordinated web/mobile/rules changes. Neither
change is silently replaced by made-up numeric readings in this sketch.

## Implementation and verification boundaries

New files: this sketch, private placeholder configuration, README, .gitignore and
the offline `verify-contract.mjs` static-check script.
They implement real sensor acquisition and supervised light/filter output testing,
with Firebase device-authenticated transport. Focused claiming rules and registry
setup are deployed; no owner assignment or physical command is made by setup.

The HTTPS implementation validates certificates using the ESP32 certificate
bundle and signs in only as the expected device UID. It refreshes tokens and
relies on existing RTDB authorization; it does not bypass access checks. No tokens,
passwords or HTTP response bodies are printed. Polling is used for this bench
test; streaming, production provisioning, cloud acknowledgements and unattended
failure policy remain future integration work.

Reference APIs: [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth)
and [Espressif calibrated ADC reads](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html).
Build results are recorded below. Real-settings firmware was uploaded to confirmed
COM5 on 2026-11-06, with verified flash hashes and successful reset. Relay actuation,
sensor accuracy and physical power-detector tests still require user verification.

### Web-ready verification on 2026-11-06

Light-command diagnosis: the device connected to Wi-Fi, synchronized time and
authenticated, but RTDB reads returned ESP_FAIL before an HTTP response. The
HTTP transmit buffer now accommodates the token-bearing request line, bounded
to 8192 bytes including margin. TLS, identity and command freshness checks are
unchanged. Diagnostics report connection stages and error names, never tokens.
GPIO19 currently returns invalid temperature; telemetry is intentionally withheld
until both probes are valid. This is separate from the command receive path.
The corrected build (1,132,854 bytes flash; 47,692 bytes global RAM) was uploaded
to COM5 with verified flash hashes. Live serial output then confirmed Wi-Fi
connected, network time ready, authenticated=yes and web ready=yes. Database
transport errors stopped during observation. No relay commands were sent by the
assistant; fresh website-command actuation and lamp operation remain user tests.
The corrected build (1,132,854 bytes flash; 47,692 bytes global RAM) was uploaded
to COM5 with verified flash hashes. Live serial output then confirmed Wi-Fi
connected, network time ready, authenticated=yes and web ready=yes. Database
transport errors stopped during observation. No relay commands were sent by the
assistant; fresh website-command actuation and lamp operation remain user tests.

- Real-settings cloud build passed: 1,132,426 bytes flash (86%), 47,684 bytes RAM (14%).
- Uploaded to Aquarium 1 on COM5 after the user closed Serial Monitor.
- Static contract checks, website TypeScript and targeted lint passed.
- Focused claiming/RTDB emulator suite: 72 passed, zero failed/skipped.
- Local website HTTP 200; invalid-token claim request HTTP 401.
- Claiming is enabled; no user claim or physical command was submitted by setup.

### Verified locally on 2026-11-05

- Final local-mode build passed for `esp32:esp32:esp32`, core 3.3.8:
  911,028 bytes flash (69%), 45,544 bytes global RAM (13%).
- Build with the cloud-enabled compile flag and blank credential placeholders
  also passed (911,068 bytes flash). Blank settings keep networking inactive;
  this does not verify sign-in, token refresh or Firebase communication.
- Static contract checks passed against the existing database rules: required
  telemetry fields, allowed optional fields, pin mapping, default-disabled cloud,
  unknown power polarity, TLS verification and omission of false TDS/NTU values.
  These are source-level checks, not end-to-end device tests.

### Registration update

Aquarium 1 is now registered in live Firebase as unclaimed. Its existing device
email/password login and token refresh were verified without resetting credentials.
Its reserved aquarium ID and device credentials are in the external private header;
Wi-Fi is populated and cloud mode is enabled. Focused Firestore claiming rules
were deployed and read back successfully; RTDB rules were unchanged.
The website claiming endpoint is enabled. No owner assignment or physical
command was performed by setup. See the website live-setup status for upload results.
