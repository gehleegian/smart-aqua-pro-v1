#include <Arduino.h>
#include <WiFi.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP32Servo.h>
#include <Preferences.h>
#include <esp_http_client.h>
#include <esp_crt_bundle.h>
#include <esp_log.h>
#include <time.h>
#include "Config.h"
#include "FeederConfig.h"
#include "ScheduleLogic.h"
#include "ScheduleLogicTests.h"
#include "EchoFilter.h"
#include "PowerSignal.h"
#include "WaterLevel.h"

// Aquarium 1 supervised integration-test firmware. No fabricated telemetry.
constexpr uint8_t PH_PIN = 34, TDS_PIN = 32, TURB_PIN = 35;
constexpr uint8_t TRIG_PIN = 26, ECHO_PIN = 27;
constexpr uint8_t LIGHT_PIN = 16, FILTER_PIN = 17, SERVO_PIN = 15;
constexpr uint8_t POWER_PIN = 33;
constexpr float PH4_V = 2.438f, PH686_V = 2.287f, PH918_V = 2.103f;
constexpr float EMPTY_CM = 27.0f, FULL_CM = 20.2f;
constexpr float CLEAR_V = 0.967f, CLOUDY_V = 0.246f;
// Midpoint separates the two tested samples, NOT a calibrated NTU threshold.
constexpr float TURB_MID_V = (CLEAR_V + CLOUDY_V) / 2.0f;
constexpr float TURB_HYST_V = 0.02f; // anti-flicker margin, not a water-quality rule
#ifndef AQUARIUM_TDS_METER_REFERENCE_ENABLED
#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 0
#endif
constexpr bool TDS_METER_REFERENCE_ENABLED = AQUARIUM_TDS_METER_REFERENCE_ENABLED != 0;
// Meter comparisons are enabled only for the device checked by its owner.
// Empirical linear estimate; extrapolation is allowed but unverified.
constexpr float TDS_LOW_V = 0.169f, TDS_LOW_PPM = 80.0f;
constexpr float TDS_HIGH_V = 1.304f, TDS_HIGH_PPM = 314.0f;
// Observed sample span; half a displayed millivolt accounts for Serial rounding.
constexpr float TDS_CHECKED_MIN_V = 0.169f - 0.0005f;
constexpr float TDS_CHECKED_MAX_V = 1.304f + 0.0005f;

OneWire bus18(18), bus19(19);
DallasTemperature temp18(&bus18), temp19(&bus19);
bool armed = false, lightOn = false, filterOn = false;
bool localStop = false; // optional serial DISARM stays latched until ARM/reset
bool turbKnown = false, cloudy = false;
float phV = NAN, tdsV = NAN, turbV = NAN, phValue = NAN;
float tdsPpm = NAN;
float powerSignalV = NAN, supplyV = NAN;
PowerSignal::State measuredPower = PowerSignal::State::Unknown;
float t18 = NAN, t19 = NAN, distanceCm = NAN, levelPct = NAN;
bool temperaturesValid = false, levelValid = false;
float profileTargetHeightCm = 0;
uint32_t sampleAt = 0, lastSample = 0, lastCloud = 0, lastWifi = 0;
uint32_t temp18RetryAt = 0, temp19RetryAt = 0;
String idToken, refreshToken, lastCommand, serialLine;
bool serialOverflow = false, commandBaseline = false;
uint32_t tokenAt = 0, tokenLifetimeMs = 0, lastAuthAttempt = 0;
uint32_t cloudDelayMs = 3000;
uint32_t lastConnectionReport = 0;
bool authAttempted = false;
Servo feeder;
bool feedCompleted = false;
uint32_t lastFeedEnd = 0;
Preferences scheduleStore;
bool scheduleStoreReady = false;
int64_t lastAutoFeedMinute = 0;
ScheduleLogic::Override lightSchedule, filterSchedule;
String scheduleSignature;
bool automationWasEnabled = false;
constexpr int64_t LOCAL_UTC_OFFSET_SECONDS = 8 * 60 * 60; // Asia/Singapore
double commandWatermarkMs = 0;

void outputsOff() {
  digitalWrite(LIGHT_PIN, HIGH);
  digitalWrite(FILTER_PIN, HIGH);
  lightOn = false;
  filterOn = false;
}

void disarm() {
  outputsOff();
  armed = false;
  commandBaseline = false;
}

void setOutput(bool light, bool on) {
  if (on && !armed) {
    Serial.println("IGNORED: command path not ready or local stop is latched.");
    return;
  }
  digitalWrite(light ? LIGHT_PIN : FILTER_PIN, on ? LOW : HIGH);
  if (light) lightOn = on; else filterOn = on;
  Serial.printf("%s output commanded %s; physical operation NOT verified.\n",
                light ? "LIGHT" : "FILTER", on ? "ON" : "OFF");
}

void runManualFeed() {
  if (!FEEDER_TEST_ENABLED || !armed || localStop) {
    Serial.println("Feed rejected: feeder not enabled or controls not ready.");
    return;
  }
  if (feedCompleted && millis() - lastFeedEnd < FEEDER_COOLDOWN_MS) {
    Serial.println("Feed rejected: cooldown active.");
    return;
  }
  feeder.setPeriodHertz(50);
  feeder.attach(SERVO_PIN, 500, 2500);
  if (!feeder.attached()) {
    Serial.println("Feed rejected: servo PWM unavailable.");
    return;
  }
  // First establish provisional home; never energize the servo at boot.
  feeder.write(FEEDER_HOME_DEG);
  responsiveWait(FEEDER_TRAVEL_MS);
  if (armed && !localStop && WiFi.status() == WL_CONNECTED) {
    feeder.write(FEEDER_DISPENSE_DEG);
    responsiveWait(FEEDER_TRAVEL_MS);
    const uint32_t holdStart = millis();
    // Keep network requests out of this timed section so HTTPS timeouts cannot
    // extend the configured dwell. Serial stop and Wi-Fi loss end it early.
    while (armed && !localStop && WiFi.status() == WL_CONNECTED &&
           millis() - holdStart < FEEDER_HOLD_MS) {
      serialCommands();
      delay(2);
    }
  }
  feeder.write(FEEDER_HOME_DEG);
  responsiveWait(FEEDER_TRAVEL_MS);
  feeder.detach();
  pinMode(SERVO_PIN, OUTPUT);
  digitalWrite(SERVO_PIN, LOW);
  lastFeedEnd = millis();
  feedCompleted = true;
  Serial.println("Feed cycle ended; home commanded. Mechanical position NOT verified.");
}

void help() {
  Serial.println("Commands (115200 baud, Newline):");
  Serial.println("ARM | DISARM | LIGHT ON | LIGHT OFF | FILTER ON | FILTER OFF | STATUS");
  Serial.println("Cloud mode: use website Manual controls; no serial ARM required. Local ON disabled.");
}

void serialCommands() {
  while (Serial.available()) {
    const char c = char(Serial.read());
    if (c == '\r') continue;
    if (c != '\n') {
      if (serialLine.length() < 64 && !serialOverflow) serialLine += c;
      else serialOverflow = true;
      continue;
    }
    serialLine.trim();
    serialLine.toUpperCase();
    if (serialOverflow) Serial.println("Command too long; discarded.");
    else if (serialLine == "ARM") {
      outputsOff();
      localStop = false;
      armed = !CLOUD_ENABLED;
      commandBaseline = false;
      Serial.println("ARMED for supervised test. No output has been turned on.");
    } else if (serialLine == "DISARM") {
      localStop = true;
      disarm();
      Serial.println("DISARMED; both relay outputs OFF.");
    } else if (serialLine == "LIGHT OFF") setOutput(true, false);
    else if (serialLine == "FILTER OFF") setOutput(false, false);
    else if (serialLine == "LIGHT ON" && !CLOUD_ENABLED) setOutput(true, true);
    else if (serialLine == "FILTER ON" && !CLOUD_ENABLED) setOutput(false, true);
    else if (serialLine == "STATUS") {
      Serial.printf("%s | light=%s | filter=%s | cloud=%s\n",
                    armed ? "ARMED" : "DISARMED", lightOn ? "ON" : "OFF",
                    filterOn ? "ON" : "OFF",
                    CLOUD_ENABLED ? "enabled" : "disabled");
      if (POWER_SENSOR_ANALOG)
        Serial.printf("Voltage GPIO33: %.3f V | estimated DC supply: %.2f V\n", powerSignalV, supplyV);
      else Serial.printf("Digital detector GPIO33=%d\n", digitalRead(POWER_PIN));
    } else if (serialLine.length()) help();
    serialLine = "";
    serialOverflow = false;
  }
}

void responsiveWait(uint32_t duration) {
  const uint32_t start = millis();
  while (millis() - start < duration) {
    serialCommands();
    delay(2);
  }
}

float voltage(uint8_t pin) {
  analogReadMilliVolts(pin);
  responsiveWait(5);
  uint32_t sum = 0;
  for (int i = 0; i < 50; ++i) {
    sum += analogReadMilliVolts(pin);
    responsiveWait(10);
  }
  return sum / 50000.0f;
}

bool validTemperature(float value) {
  // Reject disconnected readings and DS18B20 power-on sentinel conservatively.
  return isfinite(value) && value >= -55 && value <= 125 && value != 85.0f;
}

void recoverTemperatureProbe(DallasTemperature &probe, uint8_t pin,
                             float previousReading, uint32_t &retryAt) {
  // getDeviceCount() is cached by begin(). A probe missed at boot otherwise
  // stays undiscoverable even after its power/contact has recovered.
  const bool needsRecovery = probe.getDeviceCount() != 1 ||
    (sampleAt != 0 && !validTemperature(previousReading));
  const uint32_t now = millis();
  if (!needsRecovery || now - retryAt < 10000UL) return;
  retryAt = now;
  Serial.printf("Temperature GPIO%u: rescanning failed probe bus.\n", pin);
  probe.begin();
  probe.setResolution(12);
  probe.setWaitForConversion(false);
  Serial.printf("Temperature GPIO%u: detected %u device(s); awaiting fresh conversion.\n",
                pin, unsigned(probe.getDeviceCount()));
}

float meterReferencedTds(float v) {
  if (!TDS_METER_REFERENCE_ENABLED || !isfinite(v) || v <= 0.0f || v >= 3.3f ||
      !(TDS_HIGH_V > TDS_LOW_V) || !(TDS_HIGH_PPM > TDS_LOW_PPM)) return NAN;
  const float result = TDS_LOW_PPM + (v - TDS_LOW_V) *
    (TDS_HIGH_PPM - TDS_LOW_PPM) / (TDS_HIGH_V - TDS_LOW_V);
  return isfinite(result) && result >= 0.0f ? result : NAN;
}

float fitPH(float v) {
  if (!isfinite(v) || !(PH4_V > PH686_V && PH686_V > PH918_V)) return NAN;
  const float result = v >= PH686_V
    ? 4.01f + (v - PH4_V) * (6.86f - 4.01f) / (PH686_V - PH4_V)
    : 6.86f + (v - PH686_V) * (9.18f - 6.86f) / (PH918_V - PH686_V);
  // Match the existing client validity policy. Never clamp to a normal pH.
  return isfinite(result) && result > 0.0f && result <= 14.0f ? result : NAN;
}

void sampleSensors() {
  recoverTemperatureProbe(temp18, 18, t18, temp18RetryAt);
  recoverTemperatureProbe(temp19, 19, t19, temp19RetryAt);
  temp18.requestTemperatures();
  temp19.requestTemperatures();
  responsiveWait(800);
  t18 = temp18.getTempCByIndex(0);
  t19 = temp19.getTempCByIndex(0);
  const bool ok18 = validTemperature(t18) && temp18.getDeviceCount() == 1;
  const bool ok19 = validTemperature(t19) && temp19.getDeviceCount() == 1;
  if (ok18) t18 += TEMP18_OFFSET_C; else t18 = NAN;
  if (ok19) t19 += TEMP19_OFFSET_C; else t19 = NAN;
  temperaturesValid = ok18 && ok19;

  phV = voltage(PH_PIN);
  tdsV = voltage(TDS_PIN);
  // ADC clipping cannot measure a higher concentration; never publish it as ppm.
  tdsPpm = analogRead(TDS_PIN) >= 4095 ? NAN : meterReferencedTds(tdsV);
  turbV = voltage(TURB_PIN);
  if (POWER_SENSOR_ANALOG) {
    powerSignalV = voltage(POWER_PIN);
    supplyV = powerSignalV * POWER_DIVIDER_RATIO;
    measuredPower = PowerSignal::classify(powerSignalV, POWER_SIGNAL_OFF_V,
                                         POWER_SIGNAL_ON_V, analogRead(POWER_PIN) >= 4095);
  }
  // Buffer points define the transfer curve, not hard input-voltage limits.
  // Extrapolation is identified below; its accuracy needs an independent check.
  phValue = fitPH(phV);
  if (turbV >= 0.15f && turbV < 3.0f) {
    if (!turbKnown) cloudy = turbV < TURB_MID_V;
    else if (turbV < TURB_MID_V - TURB_HYST_V) cloudy = true;
    else if (turbV > TURB_MID_V + TURB_HYST_V) cloudy = false;
    turbKnown = true;
  } else turbKnown = false;

  uint32_t echoes[5] = {};
  unsigned validEchoes = 0;
  for (unsigned i = 0; i < 5; ++i) {
    if (i) responsiveWait(100);
    digitalWrite(TRIG_PIN, LOW);
    delayMicroseconds(5);
    digitalWrite(TRIG_PIN, HIGH);
    delayMicroseconds(20);
    digitalWrite(TRIG_PIN, LOW);
    const uint32_t echo = pulseIn(ECHO_PIN, HIGH, 50000UL);
    const float cm = echo * 0.0343f / 2.0f;
    if (echo && cm >= 20.0f && cm <= 800.0f) {
      echoes[i] = echo;
      ++validEchoes;
    }
  }
  const uint32_t us = medianEcho(echoes);
  distanceCm = us ? us * 0.0343f / 2.0f : NAN;
  // AJ-SR04M assumption: below 20 cm is blind zone, not a valid full reading.
  levelValid = isfinite(distanceCm) && distanceCm >= 20.0f && distanceCm <= 800.0f;
  levelPct = levelValid ? constrain((EMPTY_CM - distanceCm) * 100.0f /
                                     (EMPTY_CM - FULL_CM), 0.0f, 100.0f) : NAN;
  if (PROFILE_LEVEL_ENABLED) {
    const float result = WaterLevel::percent(distanceCm, profileTargetHeightCm);
    levelValid = result >= 0;
    levelPct = levelValid ? result : NAN;
  }
  sampleAt = millis();
  Serial.println("\n--- AQUARIUM 1 REAL SENSOR SAMPLE ---");
  Serial.printf("Temp GPIO18: %.2f C | GPIO19: %.2f C | mean: %.2f C\n",
                t18, t19, temperaturesValid ? (t18 + t19) / 2.0f : NAN);
  Serial.printf("pH: %.2f | input %.3f V (%s)\n", phValue, phV,
    !isfinite(phValue) ? "invalid: check input/probe/calibration" :
    phV < PH918_V || phV > PH4_V ? "outside buffer span: extrapolated; verify with meter" : "within buffer span");
  Serial.printf("Turbidity: %s | GPIO35 %.3f V | module approx %.3f V\n",
                turbKnown ? (cloudy ? "CLOUDY" : "CLEAR") : "UNKNOWN", turbV, turbV * 2);
  if (PROFILE_LEVEL_ENABLED)
    Serial.printf("Distance: %.1f cm | level %.1f %% | empty 27.0 cm | profile target height %.3f cm\n",
                  distanceCm, levelPct, profileTargetHeightCm);
  else Serial.printf("Distance: %.1f cm | level %.1f %% (27.0 empty / 20.2 chosen full)\n", distanceCm, levelPct);
  Serial.printf("Ultrasonic: %u/5 valid echoes; current-batch median only\n", validEchoes);
  if (isfinite(tdsPpm)) {
    Serial.printf("TDS: %.0f ppm | GPIO32 %.3f V | %s; no temperature compensation\n", tdsPpm, tdsV,
                  tdsV < TDS_CHECKED_MIN_V || tdsV > TDS_CHECKED_MAX_V
                    ? "outside checked span: extrapolated; verify with meter" : "within checked span");
  } else Serial.printf("TDS input %.3f V: invalid/clipped input or reference disabled; no ppm published.\n", tdsV);
  if (POWER_SENSOR_ANALOG) {
    Serial.printf("Voltage GPIO33: %.3f V | estimated DC supply: %.2f V | power: %s\n",
                  powerSignalV, supplyV, PowerSignal::label(measuredPower));
  } else {
    Serial.printf("Digital detector GPIO33=%d | polarity %s\n", digitalRead(POWER_PIN),
                  POWER_PRESENT_LEVEL < 0 ? "UNCONFIRMED" : "configured");
  }
  Serial.printf("Outputs light=%d filter=%d\n", lightOn, filterOn);
}

// HTTPS uses ESP-IDF's built-in root certificate bundle; never setInsecure().
// No response body, URL, password or token is printed to Serial.
struct HttpBody { String text; bool overflow = false; };
esp_err_t receiveHttp(esp_http_client_event_t *event) {
  if (event->event_id == HTTP_EVENT_ON_DATA) {
    HttpBody *body = static_cast<HttpBody *>(event->user_data);
    if (body->text.length() + event->data_len > 16384) {
      body->overflow = true;
      return ESP_FAIL;
    }
    body->text.concat(static_cast<const char *>(event->data), event->data_len);
  }
  return ESP_OK;
}

int request(const String &url, esp_http_client_method_t method,
            const String &payload, String &response,
            const char *contentType = "application/json") {
  HttpBody body;
  // RTDB auth is in the query string. Its JWT exceeds the default HTTP TX
  // buffer; ESP-IDF fails before sending an oversized request line.
  if (url.length() > 7680) return -1;
  esp_http_client_config_t config = {};
  config.url = url.c_str();
  config.method = method;
  config.timeout_ms = 4000;
  config.buffer_size_tx = int(url.length() + 512);
  config.crt_bundle_attach = esp_crt_bundle_attach;
  config.event_handler = receiveHttp;
  config.user_data = &body;
  config.disable_auto_redirect = true;
  esp_http_client_handle_t client = esp_http_client_init(&config);
  if (!client) return -1;
  if (payload.length()) {
    esp_http_client_set_header(client, "Content-Type", contentType);
    esp_http_client_set_post_field(client, payload.c_str(), payload.length());
  }
  const esp_err_t result = esp_http_client_perform(client);
  if (result != ESP_OK) Serial.printf("HTTPS transport failure: %s\n", esp_err_to_name(result));
  if (body.overflow) Serial.println("HTTPS response exceeded bounded buffer.");
  const int status = result == ESP_OK && !body.overflow ? esp_http_client_get_status_code(client) : -1;
  esp_http_client_cleanup(client);
  response = body.text;
  return status;
}

String encode(const String &input) {
  String output;
  const char hex[] = "0123456789ABCDEF";
  for (size_t i = 0; i < input.length(); ++i) {
    const unsigned char c = input[i];
    if (isalnum(c) || c == '-' || c == '_' || c == '.' || c == '~') output += char(c);
    else { output += '%'; output += hex[c >> 4]; output += hex[c & 15]; }
  }
  return output;
}

bool authenticate() {
  if (idToken.length() && millis() - tokenAt < tokenLifetimeMs) return true;
  if (authAttempted && millis() - lastAuthAttempt < 30000) return false;
  authAttempted = true;
  lastAuthAttempt = millis();
  const bool refreshing = refreshToken.length() > 0;
  String payload, response;
  String url;
  if (refreshing) {
    url = String("https://securetoken.googleapis.com/v1/token?key=") + FIREBASE_API_KEY;
    payload = "grant_type=refresh_token&refresh_token=" + encode(refreshToken);
  } else {
    url = String("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=") + FIREBASE_API_KEY;
    JsonDocument login;
    login["email"] = DEVICE_EMAIL;
    login["password"] = DEVICE_PASSWORD;
    login["returnSecureToken"] = true;
    serializeJson(login, payload);
  }
  const int status = request(url, HTTP_METHOD_POST, payload, response,
                            refreshing ? "application/x-www-form-urlencoded" : "application/json");
  JsonDocument result;
  if (status != 200 || deserializeJson(result, response)) {
    idToken = "";
    if (status == 400 || status == 401 || status == 403) refreshToken = "";
    Serial.printf("Device authentication failed (HTTP %d). Check private configuration.\n", status);
    return false;
  }
  const String uid = result[refreshing ? "user_id" : "localId"] | "";
  const String token = result[refreshing ? "id_token" : "idToken"] | "";
  const String refresh = result[refreshing ? "refresh_token" : "refreshToken"] | "";
  const String expires = result[refreshing ? "expires_in" : "expiresIn"] | "0";
  const long seconds = expires.toInt();
  if (uid != DEVICE_UID || token.isEmpty() || refresh.isEmpty() || seconds <= 120 || seconds > 86400) {
    idToken = "";
    refreshToken = "";
    Serial.println("Rejected authentication: wrong device UID or malformed token response.");
    return false;
  }
  idToken = token;
  refreshToken = refresh;
  tokenAt = millis();
  tokenLifetimeMs = (seconds - 120) * 1000UL;
  Serial.println("Device signed in. RTDB rules still determine aquarium access.");
  return true;
}

int database(const char *child, esp_http_client_method_t method,
             const String &payload, String &response) {
  const String url = String(DATABASE_URL) + "/devices/" + AQUARIUM_ID + "/" +
                     child + ".json?auth=" + encode(idToken);
  const int status = request(url, method, payload, response);
  if (status == 401) idToken = "";
  return status;
}

bool cloudConfigurationValid() {
  const String aquarium = AQUARIUM_ID;
  if (!strlen(WIFI_SSID) || !strlen(FIREBASE_API_KEY) || !strlen(DEVICE_EMAIL) ||
      !strlen(DEVICE_PASSWORD) || aquarium.isEmpty() || aquarium == ENCLOSURE_ID) return false;
  for (size_t i = 0; i < aquarium.length(); ++i)
    if (!isalnum(aquarium[i]) && aquarium[i] != '_' && aquarium[i] != '-') return false;
  return true;
}

bool validAutomation(JsonDocument &control) {
  if (!control["automationEnabled"].as<bool>()) return true;
  const int on = ScheduleLogic::minuteOfDay(control["lightOnTime"] | "");
  const int off = ScheduleLogic::minuteOfDay(control["lightOffTime"] | "");
  const int start = ScheduleLogic::minuteOfDay(control["filtrationStartTime"] | "");
  const double hours = control["filtrationRuntimeHours"] | 0.0;
  if (on < 0 || off < 0 || on == off || start < 0 || !isfinite(hours) ||
      hours < 1 || hours > 24 || !control["feedingTimes"].is<JsonArray>()) return false;
  JsonArray times = control["feedingTimes"].as<JsonArray>();
  if (!times.size()) return false;
  for (JsonVariant value : times)
    if (!value.is<const char *>() || ScheduleLogic::minuteOfDay(value.as<const char *>()) < 0) return false;
  return true;
}

int64_t localEpochMinute() {
  return (int64_t(time(nullptr)) + LOCAL_UTC_OFFSET_SECONDS) / 60;
}

void applyRelaySchedules(JsonDocument &control) {
  const bool enabled = control["automationEnabled"].as<bool>();
  String feedingSignature;
  serializeJson(control["feedingTimes"], feedingSignature);
  const String signature = String(control["lightOnTime"] | "") + "|" +
    String(control["lightOffTime"] | "") + "|" +
    String(control["filtrationStartTime"] | "") + "|" +
    String(control["filtrationRuntimeHours"].as<double>(), 4) + "|" +
    feedingSignature;
  if (signature != scheduleSignature || enabled != automationWasEnabled) {
    lightSchedule.reset();
    filterSchedule.reset();
    scheduleSignature = signature;
    automationWasEnabled = enabled;
    // Enabling/editing never catches up a feed from the current minute.
    lastAutoFeedMinute = max(lastAutoFeedMinute, localEpochMinute());
  }
  if (!enabled || !armed || localStop) return;
  const int64_t minute = localEpochMinute();
  const int now = minute % 1440;
  const int on = ScheduleLogic::minuteOfDay(control["lightOnTime"]);
  const int off = ScheduleLogic::minuteOfDay(control["lightOffTime"]);
  const int lightMinutes = ScheduleLogic::lightDuration(on, off);
  const int start = ScheduleLogic::minuteOfDay(control["filtrationStartTime"]);
  const int filterMinutes = int(control["filtrationRuntimeHours"].as<double>() * 60);
  const bool scheduledLight = ScheduleLogic::inWindow(now, on, lightMinutes);
  const bool scheduledFilter = ScheduleLogic::inWindow(now, start, filterMinutes);
  if (lightSchedule.evaluate(scheduledLight, ScheduleLogic::latestBoundary(minute, on, lightMinutes)) &&
      lightOn != scheduledLight) setOutput(true, scheduledLight);
  if (filterSchedule.evaluate(scheduledFilter, ScheduleLogic::latestBoundary(minute, start, filterMinutes)) &&
      filterOn != scheduledFilter) setOutput(false, scheduledFilter);
}

void applyScheduledFeed(JsonDocument &control) {
  if (!control["automationEnabled"].as<bool>() || !armed || localStop) return;
  const int64_t minute = localEpochMinute();
  if (minute <= lastAutoFeedMinute) return;
  for (JsonVariant value : control["feedingTimes"].as<JsonArray>()) {
    if (ScheduleLogic::minuteOfDay(value.as<const char *>()) != minute % 1440) continue;
    // Persist before motion: retries, duplicate times, clock rollback and a reset
    // must not replay a scheduled feeding. Failed reservations skip the feed.
    lastAutoFeedMinute = minute;
    if (!scheduleStoreReady || scheduleStore.putLong64("feedMinute", minute) != sizeof(int64_t)) {
      Serial.println("Scheduled feed skipped: persistent reservation failed.");
      return;
    }
    Serial.println("Scheduled feeding due (UTC+8).");
    runManualFeed();
    return;
  }
}

bool cloudCycle() {
  if (!authenticate()) return false;
  String response;
  int status = database("control", HTTP_METHOD_GET, "", response);
  JsonDocument control;
  if (status != 200 || deserializeJson(control, response) || !control.is<JsonObject>()) {
    Serial.printf("Control unavailable (HTTP %d): register/claim device and save Manual settings.\n", status);
    return false;
  }
  if ((control["mode"] != "manual" && control["mode"] != "automation") ||
      !control["automationEnabled"].is<bool>()) {
    Serial.println("Invalid control profile: save control settings.");
    return false;
  }
  const bool scheduleValid = validAutomation(control);
  if (PROFILE_LEVEL_ENABLED) {
    JsonObject geometry = control["waterLevelProfile"].as<JsonObject>();
    profileTargetHeightCm = geometry["tankLengthCm"].is<double>() && geometry["tankWidthCm"].is<double>() &&
      geometry["tankHeightCm"].is<double>() && geometry["workingWaterVolumeLiters"].is<double>()
      ? WaterLevel::targetHeight(geometry["tankLengthCm"].as<float>(), geometry["tankWidthCm"].as<float>(),
          geometry["tankHeightCm"].as<float>(), geometry["workingWaterVolumeLiters"].as<float>()) : 0;
    const float result = WaterLevel::percent(distanceCm, profileTargetHeightCm);
    levelValid = result >= 0;
    levelPct = levelValid ? result : NAN;
  }
  if (!scheduleValid) {
    // Incomplete legacy schedules must not disable otherwise valid manual actions.
    lightSchedule.reset();
    filterSchedule.reset();
    automationWasEnabled = false;
    Serial.println("Automation skipped: save complete lighting, filtration and feeding times. Manual controls remain available.");
  }
  status = database("commands/latest", HTTP_METHOD_GET, "", response);
  JsonDocument command;
  if (status != 200 || deserializeJson(command, response)) {
    Serial.printf("Command access failed (HTTP %d).\n", status);
    return false;
  }
  const String commandId = command["commandId"] | "";
  const bool establishingBaseline = !commandBaseline;
  // Schedule transitions are evaluated before manual commands, so a fresh
  // manual action wins this poll and remains until the next daily boundary.
  if (!establishingBaseline && scheduleValid) applyRelaySchedules(control);
  if (!commandBaseline) {
    // Retained commands are never replayed after boot/reconnect/ARM.
    lastCommand = commandId;
    commandWatermarkMs = double(time(nullptr)) * 1000.0;
    commandBaseline = true;
    armed = !localStop;
    lastAutoFeedMinute = max(lastAutoFeedMinute, localEpochMinute());
    Serial.println("Web controls ready; manual commands work with automation enabled.");
    if (scheduleValid) applyRelaySchedules(control);
  } else if (commandId.length() && commandId != lastCommand) {
    lastCommand = commandId;
    const String aquarium = command["aquariumId"] | "";
    const String requester = command["requestedBy"] | "";
    const String type = command["type"] | "";
    const String state = command["state"] | "";
    const double requestedMs = command["requestedAt"] | 0.0;
    const double nowMs = double(time(nullptr)) * 1000.0;
    if (aquarium != AQUARIUM_ID || requester.isEmpty() || !command["requestedAt"].is<double>()) {
      Serial.println("Rejected malformed/mismatched command.");
    } else if (requestedMs <= commandWatermarkMs || requestedMs > nowMs + 5000 ||
               nowMs - requestedMs > 30000) {
      // Supervised-test freshness policy: new since baseline, max age 30 seconds.
      Serial.println("Rejected old/replayed/future command. Send a new command with a correct client clock.");
    } else if (type == "set_light_state" && (state == "On" || state == "Off")) {
      commandWatermarkMs = requestedMs;
      setOutput(true, state == "On");
      lightSchedule.manual();
    } else if (type == "set_filter_state" && (state == "Active" || state == "Inactive")) {
      commandWatermarkMs = requestedMs;
      setOutput(false, state == "Active");
      filterSchedule.manual();
    } else if (type == "feed_now" && command["durationMs"].is<double>() &&
               command["durationMs"].as<double>() > 0) {
      commandWatermarkMs = requestedMs;
      // Fixed physical dwell applies to both existing web and mobile clients;
      // legacy durationMs must never lengthen this device's configured hold.
      runManualFeed();
      lastAutoFeedMinute = max(lastAutoFeedMinute, localEpochMinute());
      if (scheduleStoreReady) scheduleStore.putLong64("feedMinute", lastAutoFeedMinute);
    } else Serial.println("Command not actuated: unsupported or invalid command.");
  }
  if (!establishingBaseline && scheduleValid) applyScheduledFeed(control);

  // Connection freshness is independent of sensor health. Never substitute a
  // sentinel/old value, and never let one failed probe hide working sensors.
  if (millis() - sampleAt > 15000) sampleSensors();
  JsonDocument telemetry;
  telemetry["temperatureReadingValid"] = temperaturesValid;
  if (temperaturesValid) telemetry["temperatureC"] = (t18 + t19) / 2.0f;
  if (!temperaturesValid) Serial.println("Temperature sensor fault: valid probe pair unavailable; other telemetry continues.");
  telemetry["waterLevelReadingValid"] = levelValid;
  if (PROFILE_LEVEL_ENABLED) {
    if (profileTargetHeightCm > 0) telemetry["waterLevelTargetHeightCm"] = profileTargetHeightCm;
  }
  if (levelValid) {
    telemetry["waterLevelPercent"] = levelPct;
    telemetry["waterPresent"] = levelPct > 0;
  }
  telemetry["phReadingValid"] = isfinite(phValue);
  if (isfinite(phValue)) telemetry["ph"] = phValue;
  // Publish only measured inputs within the meter-compared span; never clamp.
  telemetry["tdsReadingValid"] = isfinite(tdsPpm);
  if (isfinite(tdsPpm)) telemetry["tdsPpm"] = tdsPpm;
  // Two-sample comparison is categorical, never fabricated NTU.
  telemetry["turbidityState"] = turbKnown ? (cloudy ? "Cloudy" : "Clear") : "Unknown";
  telemetry["filterState"] = filterOn ? "Active" : "Inactive"; // commanded, not flow feedback
  telemetry["lightState"] = lightOn ? "On" : "Off"; // commanded relay output
  telemetry["equipmentStatus"] = "Unknown";
  if (POWER_SENSOR_ANALOG) telemetry["powerStatus"] = PowerSignal::label(measuredPower);
  else if (POWER_PRESENT_LEVEL == 0 || POWER_PRESENT_LEVEL == 1)
    telemetry["powerStatus"] = digitalRead(POWER_PIN) == POWER_PRESENT_LEVEL ? "Online" : "Power Interruption";
  else telemetry["powerStatus"] = "Unknown";
  telemetry["online"] = true;
  telemetry["updatedAt"][".sv"] = "timestamp";
  String payload;
  serializeJson(telemetry, payload);
  status = database("telemetry", HTTP_METHOD_PUT, payload, response);
  Serial.printf("Telemetry snapshot HTTP %d\n", status);
  return status == 200;
}

void setup() {
  digitalWrite(LIGHT_PIN, HIGH);
  digitalWrite(FILTER_PIN, HIGH);
  pinMode(LIGHT_PIN, OUTPUT);
  pinMode(FILTER_PIN, OUTPUT);
  outputsOff();
  digitalWrite(SERVO_PIN, LOW);
  pinMode(SERVO_PIN, OUTPUT); // no servo PWM until a fresh authorized Feed command
  pinMode(TRIG_PIN, OUTPUT);
  digitalWrite(TRIG_PIN, LOW);
  pinMode(ECHO_PIN, INPUT);
  // Passive divider requires high-impedance ADC input: never enable a pull-up.
  pinMode(POWER_PIN, POWER_SENSOR_ANALOG ? INPUT : INPUT_PULLUP);
  Serial.begin(115200);
  scheduleStoreReady = scheduleStore.begin("aq1-schedule", false);
  if (scheduleStoreReady) lastAutoFeedMinute = scheduleStore.getLong64("feedMinute", 0);
  analogReadResolution(12);
  if (POWER_SENSOR_ANALOG) analogSetPinAttenuation(POWER_PIN, ADC_11db);
  for (uint8_t pin : {PH_PIN, TDS_PIN, TURB_PIN}) {
    pinMode(pin, INPUT);
    analogSetPinAttenuation(pin, ADC_11db);
  }
  temp18.begin(); temp19.begin();
  temp18.setResolution(12); temp19.setResolution(12);
  temp18.setWaitForConversion(false); temp19.setWaitForConversion(false);
  // Prevent low-level HTTP debug logs from exposing token-bearing URLs.
  esp_log_level_set("HTTP_CLIENT", ESP_LOG_NONE);
  Serial.printf("\nAquarium 1 %s | supervised integration test\n", ENCLOSURE_ID);
  Serial.println("Keep both 10k turbidity divider resistors. Do not immerse exposed sensor PCB.");
  Serial.println("Both relays start OFF. GPIO commands are not proof of lamp/flow operation.");
  help();
  if (CLOUD_ENABLED && cloudConfigurationValid()) {
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    configTime(0, 0, "pool.ntp.org", "time.google.com");
  } else if (CLOUD_ENABLED) Serial.println("Cloud configuration incomplete; cloud remains inactive.");
  else Serial.println("LOCAL MODE: sensor readings and serial light/filter tests available now.");
}

void loop() {
  serialCommands();
  if (!lastSample || millis() - lastSample >= 5000) {
    sampleSensors();
    lastSample = millis();
  }
  if (CLOUD_ENABLED && cloudConfigurationValid()) {
    if (millis() - lastConnectionReport >= 10000) {
      lastConnectionReport = millis();
      Serial.printf("Connection: WiFi status=%d (3=connected) | network time=%s | authenticated=%s | web ready=%s\n",
                    int(WiFi.status()), time(nullptr) >= 1760000000 ? "ready" : "waiting",
                    idToken.length() ? "yes" : "no", commandBaseline && armed ? "yes" : "no");
    }
    if (WiFi.status() != WL_CONNECTED) {
      if (armed) { disarm(); Serial.println("Wi-Fi lost: disarmed, both outputs OFF."); }
      if (millis() - lastWifi >= 15000) { lastWifi = millis(); WiFi.reconnect(); }
    } else if (time(nullptr) < 1760000000) {
      if (armed) disarm();
      // Wait for network time before certificate verification; never bypass TLS.
    } else if (millis() - lastCloud >= cloudDelayMs) {
      if (cloudCycle()) cloudDelayMs = 3000;
      else {
        disarm();
        cloudDelayMs = min(cloudDelayMs * 2, uint32_t(30000));
        Serial.println("Cloud unavailable: outputs OFF. Reconnect will establish a new command baseline.");
      }
      lastCloud = millis();
    }
  }
  delay(2);
}
