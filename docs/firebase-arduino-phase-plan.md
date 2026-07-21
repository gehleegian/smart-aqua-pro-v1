# SmartAqua Firebase + Arduino Rollout

This rollout intentionally excludes lighting automation. Manual light control can still stay in the system.

## Recommended split

- `Firestore`: users, aquariums, sensor_readings, app-facing records, ownership, thresholds, dashboard data
- `Realtime Database`: live device shadow, commands, telemetry between web app and ESP32
- `Arduino IDE + ESP32`: sensor reads, actuator control, command polling, telemetry upload

## Realtime Database structure

```text
devices/
  {aquariumId}/
    ownerId
    control/
      mode
      automationEnabled
      feedingTimes[]
      filtrationStartTime
      filtrationRuntimeHours
      ammoniaThreshold
      manualLightState
      manualFilterState
      updatedAt
    commands/
      latest/
        aquariumId
        commandId
        type
        requestedAt
        requestedBy
        state
        durationMs
    telemetry/
      temperatureC
      waterLevelPercent
      waterQualityPercent
      ph
      ammoniaPpm
      online
      updatedAt
```

## Phase 1: Firebase foundation

Goal: make the web app publish a device-ready contract.

1. Keep user and aquarium records in Firestore.
2. Add Realtime Database to the same Firebase project.
3. Set `VITE_FIREBASE_DATABASE_URL` in your Vite environment.
4. Let the web app write:
   - `devices/{aquariumId}/control`
   - `devices/{aquariumId}/commands/latest`
5. Do not automate lighting schedules in this phase.

Done in this repo:

- Realtime Database support in [src/firebase.ts](/c:/new/smart-aqua-pro-v1/src/firebase.ts)
- Device types in [src/types/device.ts](/c:/new/smart-aqua-pro-v1/src/types/device.ts)
- Device sync helpers in [src/services/deviceService.ts](/c:/new/smart-aqua-pro-v1/src/services/deviceService.ts)
- Monitoring actions now publish command/control updates from [src/hooks/useMonitoringController.ts](/c:/new/smart-aqua-pro-v1/src/hooks/useMonitoringController.ts)

## Phase 2: ESP32 manual control + telemetry

Goal: make Arduino IDE talk to Firebase.

1. Use an ESP32 in Arduino IDE.
2. Connect Wi-Fi.
3. Upload telemetry every few seconds.
4. Poll `commands/latest`.
5. Execute:
   - `feed_now`
   - `set_filter_state`
   - `set_light_state`
6. Report the latest sensor values back to `telemetry`.

Starter sketch:

- [docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino](/c:/new/smart-aqua-pro-v1/docs/arduino/SmartAquaPhase1/SmartAquaPhase1.ino)

## Phase 3: Feeding and filtration automation

Goal: move scheduled logic to the ESP32.

1. Read `control/feedingTimes`.
2. Add NTP time sync on the ESP32.
3. Trigger the feeder at matching times.
4. Read `filtrationStartTime` and `filtrationRuntimeHours`.
5. Turn filtration on/off from schedule.
6. Add the ammonia rule:
   - if `ammoniaPpm >= ammoniaThreshold`, force the filter on

Keep lighting manual-only for now.

## Phase 4: Logs and alerts

Goal: make the system useful for monitoring, not just switching.

1. Save telemetry snapshots to the Firestore `sensor_readings` collection.
2. Add alert documents for:
   - temperature out of range
   - water level below threshold
   - water quality below threshold
   - ammonia above threshold
3. Show those logs in the dashboard and `Data Logs` page.

## Phase 5: Hardening

1. Replace test-mode database rules.
2. Give each aquarium a device ID and owner mapping.
3. Add device heartbeat timeout detection.
4. Replace insecure HTTPS handling on the ESP32 with certificate validation.
5. Move secrets out of source and into environment variables.

Rule files now live in the repo:

- [firebase.json](/c:/new/smart-aqua-pro-v1/firebase.json)
- [firestore.rules](/c:/new/smart-aqua-pro-v1/firestore.rules)
- [firestore.indexes.json](/c:/new/smart-aqua-pro-v1/firestore.indexes.json)
- [docs/firebase-security-rules.md](/c:/new/smart-aqua-pro-v1/docs/firebase-security-rules.md)

## Suggested build order for your team

1. Get Realtime Database enabled in Firebase.
2. Put one ESP32 online and make telemetry appear.
3. Test `Feed Now` from the Monitoring page.
4. Test manual filter on/off.
5. Add scheduled feeding.
6. Add scheduled filtration.
7. Add alerts and historical logs.

## Arduino IDE checklist

1. Board: `ESP32 Dev Module`
2. Libraries:
   - `ArduinoJson`
3. Fill in:
   - Wi-Fi SSID and password
   - Firebase Realtime Database URL
   - Firebase auth token strategy for your project
   - aquarium/device ID
4. Match the actuator pins to your wiring before upload.

## Notes for this repo

- The monitoring UI now treats lighting automation as out of scope for this phase.
- Feeding and filtration automation settings remain editable.
- Manual light control still exists in Monitoring.
