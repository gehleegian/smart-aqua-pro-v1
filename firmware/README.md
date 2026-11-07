# SmartAqua ESP32 firmware

This directory contains the Aquarium 1 and Aquarium 2 source snapshots prepared
for review on 2026-11-07. Open each `.ino` from its matching folder and keep all
headers beside it. ESP32 Dev Module, Arduino ESP32 core 3.3.8; libraries:
ArduinoJson 7, OneWire, DallasTemperature and ESP32Servo.

Credentials, private registration manifests and compiled binaries are deliberately
not committed. Config.h loads the existing external private settings header on
the development PC. On a different machine, change the include path to a private
file outside the checkout. Never paste credentials into Config.h or GitHub.
Required private settings: WIFI_SSID, WIFI_PASSWORD, FIREBASE_API_KEY,
DEVICE_EMAIL, DEVICE_PASSWORD, AQUARIUM_ID (each `constexpr char NAME[]`).

Aquarium 2 also needs `DeviceIdentity.h`: copy `DeviceIdentity.h.example` and use
the UID/enclosure ID from its private registration manifest. This file is ignored
because ID-only claiming makes an unclaimed enclosure ID sensitive. The guarded
local setup script also creates it. Published setup reports redact its live ID.
Aquarium 1 is already claimed; its existing enclosure reference is not a login.

The `scripts/build-aquarium*-firmware.mjs` helpers compile these repository
snapshots using the existing Windows private settings and Arduino CLI paths.
They do not upload. Adapt paths deliberately on another machine. Build output
and errors remain local/private. Do not upload `AQUARIUM_COMPILE_CHECK` builds.
Static checks can run without hardware:

```sh
node firmware/Aquarium1Device/verify-contract.mjs
node firmware/Aquarium2Device/verify-contract.mjs
```

Aquarium 1 uses analog voltage sensing on GPIO33 with measured ON/OFF reference
signals; Aquarium 2 retains its prior unconfirmed digital-detector mode. Do not
copy power settings blindly. Other Aquarium 2 sensor references are starting
values, not independent calibration. TDS conversion remains unvalidated.

Both relays start OFF. No servo PWM starts until an authorized feed command.
Feed uses a quarter-turn left, 1.5-second hold, return, and five-second cooldown.
Manual light/filter control remains available while schedules are enabled.
Cloud/Wi-Fi failures turn relays OFF; this remains supervised prototype firmware,
not an unattended livestock life-support controller. Power-loss reporting needs
the ESP32 and network to remain independently powered.

No Git operation deploys Firebase rules, changes accounts, uploads hardware or
merges a branch. See `docs/security/review-handoff-2026-11-07.md` for verification
and deployment cautions, including the focused Firestore rollout rules.
