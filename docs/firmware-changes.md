# Firmware changes for the device contract (for Gian)

The working ESP32 firmware isn't in this repo, so this is a checklist of changes to make in it, with example snippets. The data shapes come from `docs/device-contract.md`. When this conflicts with that file, that file wins.

**Assumptions in the snippets — please check them against your sketch:**
- **Library:** the snippets use the Mobizt `Firebase_ESP_Client` API (`Firebase.RTDB.*`, `FirebaseJson`). If you use a different library, keep the paths and payloads and change only the calls.
- **Pins:** names like `PIN_AC_SENSE` and `PIN_RESET_BUTTON` are placeholders. Use your real pin assignments; we haven't chosen any.
- **Calibration:** values marked `CALIBRATE` have to be measured on the real hardware. Don't copy the placeholder numbers.

**Don't break the live tank:** the rules stay backward compatible, so you can flash these changes one at a time. The suggested order is in `docs/migration-live.md`, step 3.

---

## 1. 15 s send interval

The app treats a device as offline after 60 s without data (3 missed sends). Your current firmware sends about every 7.4 s, which also works. 15 s halves the database writes.

```cpp
const uint32_t TELEMETRY_INTERVAL_MS = 15000;
uint32_t lastTelemetryMs = 0;

void loop() {
  if (millis() - lastTelemetryMs >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryMs = millis();
    sendTelemetry();
  }
  // ... command polling / stream handling, schedules ...
}
```

- [ ] Send every 15 s (not faster than 5 s).
- [ ] Use `millis()` only for intervals. **Never** send it as a timestamp. Old data contains `recordedAtEpoch: 853755456`, which is about 9.9 days of uptime and looks like `millis()`.

## 2. Server-timestamp `updatedAt` and NTP

`updatedAt` must be the RTDB server timestamp, not the ESP32's own clock. NTP is still needed for anything time-of-day on the device, such as feeding and light schedules.

```cpp
#include <time.h>

void setupTime() {
  // Asia/Manila is UTC+8 with no DST.
  configTime(8 * 3600, 0, "pool.ntp.org", "time.google.com");
  struct tm now;
  for (int i = 0; i < 20 && !getLocalTime(&now, 500); i++) { /* wait up to ~10 s */ }
}

// In the telemetry JSON:
json.set("updatedAt/.sv", "timestamp");   // becomes epoch ms on the server
```

- [ ] `updatedAt` = `{".sv":"timestamp"}`.
- [ ] Call `configTime(...)` after Wi-Fi connects. Don't run schedules until `getLocalTime()` succeeds.

## 3. Validity flags for every sensor

Each sensor sends its value plus a `<sensor>ReadingValid` boolean. When a read fails, set the flag to `false`. Don't send `0` as a stand-in value. The app shows "Sensor error" and never alerts on it.

```cpp
FirebaseJson json;

// Temperature (DS18B20)
float t = ds.getTempCByIndex(0);
bool tOk = (t != DEVICE_DISCONNECTED_C) && (t != 85.0f) && (t > -10 && t < 60);
json.set("temperatureC", tOk ? t : 0);         // value is ignored when the flag is false
json.set("temperatureReadingValid", tOk);

// pH (new flag)
float ph = readPh();                            // your existing conversion
bool phOk = isfinite(ph) && ph > 0.0f && ph <= 14.0f && phProbeConnected();
json.set("ph", ph);
json.set("phReadingValid", phOk);

// Water level
json.set("waterLevelPercent", level);           // 0–100
json.set("waterPresent", waterPresent);         // send false when the tank is actually empty

json.set("online", true);
json.set("updatedAt/.sv", "timestamp");
Firebase.RTDB.setJSON(&fbdo, ("devices/" + aquariumId + "/telemetry").c_str(), &json);
```

- [ ] Add `phReadingValid` (new).
- [ ] Add `turbidityReadingValid` (new; see §8).
- [ ] Keep `temperatureReadingValid` and `tdsReadingValid`.
- [ ] Never send a placeholder `0` as a real reading. Set the flag to `false` instead.
- [ ] Send only the fields listed in the contract §2. Any other field makes the whole write fail.

## 4. Write `commandAck` after running a command

Read `devices/{aquariumId}/commands/latest`, run the command, then write the ack. The rules accept the ack only if its `commandId` equals the current `commands/latest/commandId` and `executedAt` is the server timestamp.

```cpp
String lastHandledCommandId;

void handleCommand(FirebaseJson &cmd) {
  FirebaseJsonData id, type, state, dur;
  cmd.get(id, "commandId"); cmd.get(type, "type");
  if (!id.success || id.stringValue == lastHandledCommandId) return;   // run once
  lastHandledCommandId = id.stringValue;

  bool ok = false; String err;
  if (type.stringValue == "feed_now")          { cmd.get(dur, "durationMs"); ok = runFeeder(dur.intValue, err); }
  else if (type.stringValue == "set_filter_state") { cmd.get(state, "state"); ok = setFilter(state.stringValue == "Active", err); }
  else if (type.stringValue == "set_light_state")  { cmd.get(state, "state"); ok = setLight(state.stringValue == "On", err); }
  else if (type.stringValue == "sync_control")     { ok = reloadControl(err); }
  else { err = "unsupported command type"; }

  FirebaseJson ack;
  ack.set("commandId", id.stringValue);
  ack.set("status", ok ? "done" : "failed");
  ack.set("executedAt/.sv", "timestamp");
  if (!ok && err.length()) ack.set("error", err.substring(0, 200));
  Firebase.RTDB.setJSON(&fbdo, ("devices/" + aquariumId + "/commandAck/latest").c_str(), &ack);
}
```

- [ ] Ack within 30 s; after that the web shows "No response".
- [ ] Remember the last `commandId` so a reboot or reconnect doesn't feed twice. Ideally keep it in `Preferences`.
- [ ] Never write under `commands/`. The device is read-only there.

## 5. WiFiManager setup and a 5 s reset

```cpp
#include <WiFiManager.h>   // tzapu/WiFiManager

const int PIN_RESET_BUTTON = /* choose */;
WiFiManager wm;

void setupWifi() {
  pinMode(PIN_RESET_BUTTON, INPUT_PULLUP);
  wm.setConfigPortalTimeout(180);
  if (!wm.autoConnect("SmartAqua-Setup")) ESP.restart();   // captive portal on first boot
}

void checkResetButton() {            // call from loop()
  static uint32_t pressedAt = 0;
  if (digitalRead(PIN_RESET_BUTTON) == LOW) {
    if (!pressedAt) pressedAt = millis();
    if (millis() - pressedAt >= 5000) { wm.resetSettings(); ESP.restart(); }
  } else pressedAt = 0;
}
```

- [ ] Hard-coded Wi-Fi SSID and password removed from the sketch. **Never commit Wi-Fi credentials.**
- [ ] Holding the button for 5 s clears the saved Wi-Fi and reopens the setup portal.
- [ ] Optional: put a password on the portal.

## 6. Read `deviceBindings` at boot

The device should look up its aquarium instead of having `aquariumId` compiled in. The rules let a device read **only** `deviceBindings/{its own uid}`.

```cpp
String aquariumId;

bool loadBinding() {
  String path = "deviceBindings/" + String(auth.token.uid.c_str());
  if (Firebase.RTDB.getString(&fbdo, path.c_str())) { aquariumId = fbdo.stringData(); return aquariumId.length() > 0; }
  return false;   // not provisioned yet: retry every 30 s, do not send telemetry
}
```

- [ ] `aquariumId` comes from `deviceBindings`.
- [ ] Until the binding exists, fall back to the compiled-in value.
- [ ] The binding is written by provisioning (QR claim, a later sprint). For the live device we will add `deviceBindings/esp32-SAQ-7K3M-9R2X` during the switchover (see migration step 1b).

## 7. Real `powerStatus` and `equipmentStatus`

Today both are always `"Unknown"`, so the app can't evaluate them.

```cpp
// Power: needs an AC-sense input (e.g. an opto-isolated mains detector) and the ESP32 on battery/UPS.
const int PIN_AC_SENSE = /* choose */;
String powerStatus() {
  return digitalRead(PIN_AC_SENSE) == HIGH ? "Online" : "Power Interruption";
}

// Equipment: report what the firmware can actually observe.
String equipmentStatus() {
  if (anyActuatorFault()) return "Fault";      // e.g. a relay commanded on but no current/flow feedback
  if (anySensorInvalid()) return "Warning";
  return "Normal";
}
```

- [ ] `powerStatus` is one of `Online` / `Power Interruption`. Send `Unknown` only if there's no AC-sense hardware.
- [ ] `equipmentStatus` is one of `Normal` / `Warning` / `Fault` / `Unknown`.
- [ ] **Needs a decision (Jay and Gian):**
  - What hardware detects mains loss? The manuscript requires power-interruption detection, but the ESP32 can't report an outage it loses power in, so it needs a battery or UPS.
  - What counts as an equipment fault? There's no filter-flow or current sensor yet.

## 8. Fix TDS (currently invalid) and add turbidity

Aquarium 1 sends `tdsReadingValid: false` and no `tdsPpm`, so TDS is never assessed.

```cpp
// Gravity-style analog TDS probe. Temperature-compensated.
const float TDS_K = /* CALIBRATE with a reference solution */ 1.0f;
float readTdsPpm(float tempC, bool &ok) {
  float v = analogReadMilliVolts(PIN_TDS) / 1000.0f;           // ADC1 pin only (ADC2 conflicts with Wi-Fi)
  float comp = v / (1.0f + 0.02f * (tempC - 25.0f));
  float ppm = (133.42f * comp*comp*comp - 255.86f * comp*comp + 857.39f * comp) * 0.5f * TDS_K;
  ok = isfinite(ppm) && ppm > 0.0f && ppm < 2000.0f && v > 0.01f;   // ~0 V = dry or disconnected probe
  return ppm;
}
json.set("tdsPpm", ppm);
json.set("tdsReadingValid", tdsOk);

// Turbidity: analog module. NTU needs a calibration curve.
float ntu = turbidityToNtu(analogReadMilliVolts(PIN_TURBIDITY));   // CALIBRATE
json.set("turbidity", ntu);
json.set("turbidityReadingValid", turbidityCalibrated && isfinite(ntu) && ntu >= 0);
```

- [ ] TDS sends `tdsPpm` with `tdsReadingValid: true` once the probe reads correctly.
- [ ] Use an ADC1 pin (GPIO32–39): ADC2 doesn't work while Wi-Fi is on. The bench test in `docs/arduino/SmartAquaPhase1/` uses GPIO32.
- [ ] Turbidity is sent with `turbidityReadingValid: false` until it's calibrated.
- [ ] **Needs Gian's hardware:** calibration constants, and checking accuracy against reference instruments.

## 9. Also please check

- [ ] **Readings outside the profile limits:** Aquarium 1 reads 26.5 °C, pH 8.1 and a water level around 16 %. Are these real, or does the probe need calibrating?
- [ ] **Device token:** how is it minted and stored? It must not be in the sketch or in git. Note the token's lifetime and how it is refreshed.
- [ ] **Firmware in the repo:** commit the firmware (without secrets) to `firmware/`, so future changes can be reviewed and applied directly.
