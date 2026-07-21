#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <ESP32Servo.h>
#include <Wire.h>
#include <RTClib.h>
#include "secrets.h"

// Pins
const int SERVO_PIN = 18;
const int FILTER_RELAY_PIN = 19;
const int RTC_SDA_PIN = 21;
const int RTC_SCL_PIN = 22;
const int TEMP_SENSOR_PIN = 23;
const int LIGHT_RELAY_PIN = 25;
const int WATER_LEVEL_PIN = 34;
const int TDS_SENSOR_PIN = 35;

// Relay behavior
const int RELAY_ON = HIGH;
const int RELAY_OFF = LOW;

// Servo behavior
const int SERVO_REST_ANGLE = 0;
const int SERVO_FEED_ANGLE = 90;
const int SERVO_MOVE_DELAY_MS = 1200;

// Timing
const unsigned long telemetryIntervalMs = 5000;
const unsigned long commandPollIntervalMs = 2000;
const unsigned long controlPollIntervalMs = 2000;
const unsigned long historyLogIntervalMs = 300000;
const unsigned long wifiConnectTimeoutMs = 30000;
const unsigned long wifiRetryIntervalMs = 15000;
const long LOCAL_TIME_UTC_OFFSET_SECONDS = 8L * 60L * 60L;

const int MAX_FEED_TIMES = 8;

// Water level calibration
const int WATER_LEVEL_SAMPLE_COUNT = 8;
const int WATER_LEVEL_RAW_EMPTY = 0;
const int WATER_LEVEL_RAW_FULL = 1850;
const float WATER_PRESENT_MIN_PERCENT = 1.0f;

// TDS measurement
const int TDS_SAMPLE_COUNT = 45;
const int TDS_TRIM_COUNT = 6;
const int TDS_RAW_INVALID_LOW = 20;
const int TDS_RAW_INVALID_HIGH = 4090;
const float TDS_VREF = 3.3f;
const float TDS_ADC_RANGE = 4095.0f;
const float TDS_DEFAULT_TEMP_C = 25.0f;
const float TDS_CALIBRATION_FACTOR = 1.0f;

Servo feederServo;
RTC_DS3231 rtc;
bool rtcReady = false;

OneWire oneWire(TEMP_SENSOR_PIN);
DallasTemperature temperatureSensors(&oneWire);

String lastCommandId = "";
unsigned long lastTelemetryAt = 0;
unsigned long lastCommandPollAt = 0;
unsigned long lastControlPollAt = 0;
unsigned long lastHistoryLogAt = 0;
unsigned long lastWifiConnectAttemptAt = 0;
bool lastHttpGetSucceeded = false;

float currentTemperatureC = 0.0f;
bool currentTemperatureReadingValid = false;
float currentWaterLevelPercent = 0.0f;
bool currentWaterPresent = false;
float currentTdsPpm = 0.0f;
float currentWaterPurityPercent = 0.0f;
bool currentTdsReadingValid = false;
float currentPh = 0.0f;

// Control profile values from Firebase
String controlMode = "manual";
bool automationEnabled = false;
String feedingTimes[MAX_FEED_TIMES];
int feedingTimeCount = 0;
String filtrationStartTime = "07:00";
int filtrationRuntimeHours = 8;
String manualLightState = "Off";
String manualFilterState = "Inactive";
bool filterOutputState = false;
bool lightOutputState = false;
bool filterOverrideActive = false;
bool filterOverrideState = false;
bool lastFiltrationWindowActive = false;

// Prevent duplicate scheduled feeds in same minute
long lastScheduledFeedMinuteKey = -1;
String firebaseIdToken = "";
unsigned long firebaseIdTokenExpiresAt = 0;

bool hasDeviceIdentityConfig() {
  return String(FIREBASE_WEB_API_KEY).length() > 0 &&
    String(DEVICE_EMAIL).length() > 0 &&
    String(DEVICE_PASSWORD).length() > 0;
}

bool hasLegacyDatabaseAuth() {
  return String(FIREBASE_AUTH).length() > 0;
}

bool hasValidFirebaseIdToken() {
  return firebaseIdToken.length() > 0 &&
    firebaseIdTokenExpiresAt != 0 &&
    static_cast<long>(firebaseIdTokenExpiresAt - millis()) > 0;
}

String buildDatabaseUrl(
  const String& path,
  const String& authToken,
  const String& extraQuery = ""
) {
  String url = String(FIREBASE_DATABASE_URL) + path + ".json";
  bool hasQuery = false;

  if (extraQuery.length() > 0) {
    url += "?" + extraQuery;
    hasQuery = true;
  }

  if (authToken.length() > 0) {
    url += hasQuery ? "&auth=" : "?auth=";
    url += authToken;
  }

  return url;
}

String formatTwoDigits(int value) {
  if (value < 10) {
    return "0" + String(value);
  }

  return String(value);
}

String getDateKey(const DateTime& timestamp) {
  return String(timestamp.year()) + "-" +
    formatTwoDigits(timestamp.month()) + "-" +
    formatTwoDigits(timestamp.day());
}

String getTimeKey(const DateTime& timestamp) {
  return formatTwoDigits(timestamp.hour()) + "-" +
    formatTwoDigits(timestamp.minute()) + "-" +
    formatTwoDigits(timestamp.second());
}

String getTimestampText(const DateTime& timestamp) {
  return String(timestamp.year()) + "-" +
    formatTwoDigits(timestamp.month()) + "-" +
    formatTwoDigits(timestamp.day()) + "T" +
    formatTwoDigits(timestamp.hour()) + ":" +
    formatTwoDigits(timestamp.minute()) + ":" +
    formatTwoDigits(timestamp.second());
}

uint64_t getRtcEpochMillisUtc(const DateTime& timestamp) {
  const int64_t localEpochSeconds = static_cast<int64_t>(timestamp.unixtime());
  const int64_t utcEpochSeconds = localEpochSeconds - LOCAL_TIME_UTC_OFFSET_SECONDS;

  if (utcEpochSeconds <= 0) {
    return 0ULL;
  }

  return static_cast<uint64_t>(utcEpochSeconds) * 1000ULL;
}

bool authenticateDeviceIdentity() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Cannot authenticate device identity because WiFi is disconnected.");
    return false;
  }

  if (!hasDeviceIdentityConfig()) {
    if (hasLegacyDatabaseAuth()) {
      return true;
    }

    Serial.println("Device identity is not configured. Continuing with unauthenticated RTDB requests.");
    return false;
  }

  if (hasValidFirebaseIdToken()) {
    return true;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  const String url =
    "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" +
    String(FIREBASE_WEB_API_KEY);

  DynamicJsonDocument requestJson(256);
  requestJson["email"] = DEVICE_EMAIL;
  requestJson["password"] = DEVICE_PASSWORD;
  requestJson["returnSecureToken"] = true;

  String requestBody;
  serializeJson(requestJson, requestBody);

  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(false);

  Serial.println("Authenticating device identity with Firebase...");

  const int responseCode = http.POST(requestBody);
  const String responseBody = responseCode > 0 ? http.getString() : "";

  Serial.print("Device auth response: ");
  Serial.println(responseCode);

  if (responseCode < 200 || responseCode >= 300) {
    if (responseBody.length() > 0) {
      Serial.println(responseBody);
    }

    http.end();
    firebaseIdToken = "";
    firebaseIdTokenExpiresAt = 0;
    return false;
  }

  DynamicJsonDocument responseJson(1024);
  const DeserializationError error = deserializeJson(responseJson, responseBody);

  if (error) {
    Serial.print("Device auth JSON parse failed: ");
    Serial.println(error.c_str());
    http.end();
    firebaseIdToken = "";
    firebaseIdTokenExpiresAt = 0;
    return false;
  }

  firebaseIdToken = String((const char*)(responseJson["idToken"] | ""));
  const unsigned long expiresInSeconds =
    String((const char*)(responseJson["expiresIn"] | "3600")).toInt();
  const unsigned long safeExpiresInSeconds =
    expiresInSeconds > 60 ? expiresInSeconds - 60 : expiresInSeconds;
  firebaseIdTokenExpiresAt = millis() + (safeExpiresInSeconds * 1000UL);

  Serial.println("Device identity authenticated.");
  http.end();
  return firebaseIdToken.length() > 0;
}

String getDatabaseAuthToken() {
  if (hasDeviceIdentityConfig()) {
    return firebaseIdToken;
  }

  return String(FIREBASE_AUTH);
}

bool ensureDatabaseAuthToken() {
  if (hasDeviceIdentityConfig()) {
    return authenticateDeviceIdentity();
  }

  return true;
}

bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  lastWifiConnectAttemptAt = millis();
  Serial.print("Connecting to WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.persistent(false);
  WiFi.disconnect(false, false);
  delay(300);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startedAt = millis();

  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < wifiConnectTimeoutMs) {
    Serial.print(".");
    delay(500);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected. IP address: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("WiFi connection timed out. Sensor reads will continue offline.");
  return false;
}

String httpsGet(const String& path) {
  lastHttpGetSucceeded = false;

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping GET because WiFi is disconnected.");
    return "";
  }

  if (hasDeviceIdentityConfig() && !ensureDatabaseAuthToken()) {
    Serial.println("Skipping GET because the device is not authenticated.");
    return "";
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = buildDatabaseUrl(path, getDatabaseAuthToken(), "ts=" + String(millis()));
  http.begin(client, url);
  http.addHeader("Cache-Control", "no-cache");
  http.addHeader("Pragma", "no-cache");
  http.setReuse(false);

  Serial.print("GET ");
  Serial.println(url);

  String payload = "";
  const int responseCode = http.GET();

  Serial.print("GET response: ");
  Serial.println(responseCode);

  if (responseCode > 0) {
    lastHttpGetSucceeded = true;
    payload = http.getString();
    Serial.println(payload);
  } else {
    Serial.print("GET failed: ");
    Serial.println(http.errorToString(responseCode));
  }

  http.end();
  return payload;
}

bool httpsPut(const String& path, const String& payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Skipping PUT because WiFi is disconnected.");
    return false;
  }

  if (hasDeviceIdentityConfig() && !ensureDatabaseAuthToken()) {
    Serial.println("Skipping PUT because the device is not authenticated.");
    return false;
  }

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = buildDatabaseUrl(path, getDatabaseAuthToken());
  http.begin(client, url);
  http.addHeader("Content-Type", "application/json");
  http.setReuse(false);

  Serial.print("PUT ");
  Serial.println(url);
  Serial.println(payload);

  const int responseCode = http.PUT(payload);

  Serial.print("PUT response: ");
  Serial.println(responseCode);

  if (responseCode > 0) {
    Serial.println(http.getString());
  } else {
    Serial.print("PUT failed: ");
    Serial.println(http.errorToString(responseCode));
  }

  http.end();

  return responseCode >= 200 && responseCode < 300;
}

bool readTemperatureSensor(float& outputTempC) {
  temperatureSensors.requestTemperatures();
  const float tempC = temperatureSensors.getTempCByIndex(0);

  if (tempC == DEVICE_DISCONNECTED_C || tempC < -55.0f || tempC > 125.0f) {
    Serial.println("Temperature sensor read failed.");
    return false;
  }

  outputTempC = tempC;
  return true;
}

float clampPercent(float value) {
  if (value < 0.0f) {
    return 0.0f;
  }

  if (value > 100.0f) {
    return 100.0f;
  }

  return value;
}

float mapFloat(
  float value,
  float inMin,
  float inMax,
  float outMin,
  float outMax
) {
  if (inMax == inMin) {
    return outMin;
  }

  const float ratio = (value - inMin) / (inMax - inMin);
  return outMin + (ratio * (outMax - outMin));
}

int sortAndGetMedianValue(int values[], int count) {
  for (int i = 0; i < count - 1; i++) {
    for (int j = i + 1; j < count; j++) {
      if (values[i] > values[j]) {
        const int temp = values[i];
        values[i] = values[j];
        values[j] = temp;
      }
    }
  }

  if ((count & 1) == 1) {
    return values[count / 2];
  }

  return (values[(count / 2) - 1] + values[count / 2]) / 2;
}

float getTrimmedMeanValue(const int values[], int count, int trimCount) {
  if (count <= 0) {
    return 0.0f;
  }

  const int safeTrimCount = min(trimCount, (count - 1) / 2);
  long total = 0;
  int usedCount = 0;

  for (int i = safeTrimCount; i < count - safeTrimCount; i++) {
    total += values[i];
    usedCount++;
  }

  return usedCount == 0 ? 0.0f : total / float(usedCount);
}

float readWaterLevelPercent() {
  long total = 0;

  for (int i = 0; i < WATER_LEVEL_SAMPLE_COUNT; i++) {
    total += analogRead(WATER_LEVEL_PIN);
    delay(5);
  }

  const float rawAverage = total / float(WATER_LEVEL_SAMPLE_COUNT);
  const float rawRange = float(WATER_LEVEL_RAW_FULL - WATER_LEVEL_RAW_EMPTY);

  if (rawRange == 0.0f) {
    return 0.0f;
  }

  const float percent =
    ((rawAverage - WATER_LEVEL_RAW_EMPTY) * 100.0f) / rawRange;

  Serial.print("Water level raw: ");
  Serial.println(rawAverage);

  return clampPercent(percent);
}

float estimateTdsPpmFromRaw(float rawMedian, float temperatureC) {
  const float averageVoltage = rawMedian * (TDS_VREF / TDS_ADC_RANGE);
  const float safeTemperatureC =
    (temperatureC < -55.0f || temperatureC > 125.0f) ? TDS_DEFAULT_TEMP_C : temperatureC;
  const float compensationCoefficient = 1.0f + 0.02f * (safeTemperatureC - 25.0f);
  const float compensationVoltage = averageVoltage / compensationCoefficient;
  const float tdsPpm =
    (
      133.42f * compensationVoltage * compensationVoltage * compensationVoltage -
      255.86f * compensationVoltage * compensationVoltage +
      857.39f * compensationVoltage
    ) * 0.5f;

  const float calibratedTdsPpm = tdsPpm * TDS_CALIBRATION_FACTOR;

  return calibratedTdsPpm < 0.0f ? 0.0f : calibratedTdsPpm;
}

float convertTdsPpmToPurityPercent(float ppm) {
  if (ppm <= 300.0f) {
    return mapFloat(ppm, 0.0f, 300.0f, 100.0f, 85.0f);
  }

  if (ppm <= 500.0f) {
    return mapFloat(ppm, 300.0f, 500.0f, 84.0f, 65.0f);
  }

  if (ppm <= 1000.0f) {
    return mapFloat(ppm, 500.0f, 1000.0f, 64.0f, 0.0f);
  }

  return 0.0f;
}

bool readTdsPurityPercent(float& outputPercent) {
  int samples[TDS_SAMPLE_COUNT];

  for (int i = 0; i < TDS_SAMPLE_COUNT; i++) {
    samples[i] = analogRead(TDS_SENSOR_PIN);
    delay(5);
  }

  int medianBuffer[TDS_SAMPLE_COUNT];
  for (int i = 0; i < TDS_SAMPLE_COUNT; i++) {
    medianBuffer[i] = samples[i];
  }

  const int rawMedian = sortAndGetMedianValue(medianBuffer, TDS_SAMPLE_COUNT);
  const float rawTrimmedMean = getTrimmedMeanValue(
    medianBuffer,
    TDS_SAMPLE_COUNT,
    TDS_TRIM_COUNT
  );

  Serial.print("TDS raw: ");
  Serial.println(rawTrimmedMean);

  if (rawMedian <= TDS_RAW_INVALID_LOW || rawMedian >= TDS_RAW_INVALID_HIGH) {
    Serial.println("TDS reading unavailable. Sensor may be dry, disconnected, or unpowered.");
    outputPercent = 0.0f;
    return false;
  }

  currentTdsPpm = estimateTdsPpmFromRaw(rawTrimmedMean, currentTemperatureC);

  Serial.print("Estimated TDS ppm: ");
  Serial.println(currentTdsPpm);

  outputPercent = clampPercent(convertTdsPpmToPurityPercent(currentTdsPpm));
  return true;
}

void readSensors() {
  currentWaterLevelPercent = readWaterLevelPercent();
  currentWaterPresent = currentWaterLevelPercent >= WATER_PRESENT_MIN_PERCENT;

  Serial.print("Water level percent: ");
  Serial.println(currentWaterLevelPercent);
  Serial.print("Water present: ");
  Serial.println(currentWaterPresent ? "yes" : "no");

  if (currentWaterPresent) {
    float latestTempC = currentTemperatureC;

    if (readTemperatureSensor(latestTempC)) {
      currentTemperatureC = latestTempC;
      currentTemperatureReadingValid = true;
      Serial.print("Real temperature C: ");
      Serial.println(currentTemperatureC);
    } else {
      currentTemperatureReadingValid = false;
      Serial.println("Temperature reading unavailable.");
    }
  } else {
    currentTemperatureReadingValid = false;
    Serial.println("Temperature reading unavailable because no water is detected.");
  }

  if (currentWaterPresent) {
    currentTdsReadingValid = readTdsPurityPercent(currentWaterPurityPercent);
  } else {
    currentTdsPpm = 0.0f;
    currentWaterPurityPercent = 0.0f;
    currentTdsReadingValid = false;
    Serial.println("TDS reading unavailable because no water is detected.");
  }

  if (currentTdsReadingValid) {
    Serial.print("Water purity (TDS) percent: ");
    Serial.println(currentWaterPurityPercent);
  } else {
    Serial.println("Water purity (TDS) percent: unavailable");
  }

  currentPh = 0.0f;
}

void setFilterState(bool enabled) {
  if (filterOutputState == enabled) {
    return;
  }

  filterOutputState = enabled;
  digitalWrite(FILTER_RELAY_PIN, enabled ? RELAY_ON : RELAY_OFF);
  Serial.print("Filter state: ");
  Serial.println(enabled ? "Active" : "Inactive");
}

void setLightState(bool enabled) {
  if (lightOutputState == enabled) {
    return;
  }

  lightOutputState = enabled;
  digitalWrite(LIGHT_RELAY_PIN, enabled ? RELAY_ON : RELAY_OFF);
  Serial.print("Light state: ");
  Serial.println(enabled ? "On" : "Off");
}

void runFeeder() {
  Serial.println("Feeder running...");

  feederServo.write(SERVO_REST_ANGLE);
  delay(800);

  feederServo.write(SERVO_FEED_ANGLE);
  delay(1600);

  feederServo.write(SERVO_REST_ANGLE);
  delay(900);

  Serial.println("Feeder stopped");
}

void clearFeedingTimes() {
  for (int i = 0; i < MAX_FEED_TIMES; i++) {
    feedingTimes[i] = "";
  }
  feedingTimeCount = 0;
}

void applyControlProfile() {
  setLightState(manualLightState == "On");

  if (!automationEnabled) {
    setFilterState(manualFilterState == "Active");
  }
}

void pollControlProfile() {
  const String payload =
    httpsGet("/devices/" + String(AQUARIUM_ID) + "/control");

  if (payload.length() == 0 || payload == "null") {
    Serial.println("No control profile available.");
    return;
  }

  DynamicJsonDocument json(1024);
  const DeserializationError error = deserializeJson(json, payload);

  if (error) {
    Serial.print("Control JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  controlMode = String((const char*)(json["mode"] | "manual"));
  automationEnabled = json["automationEnabled"] | false;
  filtrationStartTime = String((const char*)(json["filtrationStartTime"] | "07:00"));
  filtrationRuntimeHours = json["filtrationRuntimeHours"] | 8;
  manualLightState = String((const char*)(json["manualLightState"] | "Off"));
  manualFilterState = String((const char*)(json["manualFilterState"] | "Inactive"));

  clearFeedingTimes();

  JsonArray times = json["feedingTimes"].as<JsonArray>();
  if (!times.isNull()) {
    for (JsonVariant value : times) {
      if (feedingTimeCount >= MAX_FEED_TIMES) {
        break;
      }

      const char* timeText = value | "";
      if (strlen(timeText) > 0) {
        feedingTimes[feedingTimeCount++] = String(timeText);
      }
    }
  }

  Serial.print("Control mode: ");
  Serial.println(controlMode);
  Serial.print("Automation enabled: ");
  Serial.println(automationEnabled ? "true" : "false");
  Serial.print("Filtration start: ");
  Serial.println(filtrationStartTime);
  Serial.print("Filtration runtime hours: ");
  Serial.println(filtrationRuntimeHours);
  Serial.print("Feeding times loaded: ");
  Serial.println(feedingTimeCount);

  applyControlProfile();
}

bool matchesFeedingTime(const String& timeText, int currentHour, int currentMinute) {
  if (timeText.length() != 5 || timeText.charAt(2) != ':') {
    return false;
  }

  const int scheduleHour = timeText.substring(0, 2).toInt();
  const int scheduleMinute = timeText.substring(3, 5).toInt();

  return scheduleHour == currentHour && scheduleMinute == currentMinute;
}

long getScheduledFeedMinuteKey(
  const String& timeText,
  int currentYear,
  int currentMonth,
  int currentDay,
  int currentHour,
  int currentMinute
) {
  if (timeText.length() != 5 || timeText.charAt(2) != ':') {
    return -1;
  }

  const int scheduleHour = timeText.substring(0, 2).toInt();
  const int scheduleMinute = timeText.substring(3, 5).toInt();

  if (
    scheduleHour < 0 ||
    scheduleHour > 23 ||
    scheduleMinute < 0 ||
    scheduleMinute > 59
  ) {
    return -1;
  }

  DateTime scheduledToday(
    currentYear,
    currentMonth,
    currentDay,
    scheduleHour,
    scheduleMinute,
    0
  );

  const long scheduledMinuteKey = scheduledToday.unixtime() / 60;
  const int currentMinutes = (currentHour * 60) + currentMinute;
  const int scheduleMinutes = (scheduleHour * 60) + scheduleMinute;

  if (currentMinutes == scheduleMinutes) {
    return scheduledMinuteKey;
  }

  if (currentMinutes == ((scheduleMinutes + 1) % 1440)) {
    return scheduledMinuteKey;
  }

  return -1;
}

bool parseTimeText(const String& timeText, int& hourOut, int& minuteOut) {
  if (timeText.length() != 5 || timeText.charAt(2) != ':') {
    return false;
  }

  const int parsedHour = timeText.substring(0, 2).toInt();
  const int parsedMinute = timeText.substring(3, 5).toInt();

  if (parsedHour < 0 || parsedHour > 23 || parsedMinute < 0 || parsedMinute > 59) {
    return false;
  }

  hourOut = parsedHour;
  minuteOut = parsedMinute;
  return true;
}

bool isFiltrationWindowActive(const DateTime& now) {
  int startHour = 0;
  int startMinute = 0;

  if (!parseTimeText(filtrationStartTime, startHour, startMinute)) {
    return false;
  }

  if (filtrationRuntimeHours <= 0) {
    return false;
  }

  const int startMinutes = (startHour * 60) + startMinute;
  const int currentMinutes = (now.hour() * 60) + now.minute();
  const int runtimeMinutes = filtrationRuntimeHours * 60;

  if (runtimeMinutes >= 1440) {
    return true;
  }

  const int endMinutes = startMinutes + runtimeMinutes;

  if (endMinutes < 1440) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  const int wrappedEndMinutes = endMinutes - 1440;
  return currentMinutes >= startMinutes || currentMinutes < wrappedEndMinutes;
}

void checkScheduledFeeding() {
  if (!rtcReady || !automationEnabled) {
    return;
  }

  DateTime now = rtc.now();

  for (int i = 0; i < feedingTimeCount; i++) {
    const long scheduledMinuteKey = getScheduledFeedMinuteKey(
      feedingTimes[i],
      now.year(),
      now.month(),
      now.day(),
      now.hour(),
      now.minute()
    );

    if (scheduledMinuteKey < 0 || scheduledMinuteKey == lastScheduledFeedMinuteKey) {
      continue;
    }

    if (matchesFeedingTime(feedingTimes[i], now.hour(), now.minute()) ||
        scheduledMinuteKey == ((now.unixtime() / 60) - 1)) {
      Serial.print("Scheduled feeding matched at ");
      Serial.println(feedingTimes[i]);
      runFeeder();
      lastScheduledFeedMinuteKey = scheduledMinuteKey;
      return;
    }
  }
}

void applyScheduledFiltration() {
  if (!rtcReady) {
    return;
  }

  if (!automationEnabled) {
    filterOverrideActive = false;
    lastFiltrationWindowActive = false;
    setFilterState(manualFilterState == "Active");
    return;
  }

  const DateTime now = rtc.now();
  const bool windowActive = isFiltrationWindowActive(now);

  if (windowActive != lastFiltrationWindowActive) {
    filterOverrideActive = false;
    lastFiltrationWindowActive = windowActive;
  }

  if (filterOverrideActive) {
    setFilterState(filterOverrideState);
    return;
  }

  setFilterState(windowActive);
}

void uploadTelemetry() {
  DynamicJsonDocument json(320);

  json["temperatureC"] = currentTemperatureC;
  json["temperatureReadingValid"] = currentTemperatureReadingValid;
  json["waterLevelPercent"] = currentWaterLevelPercent;
  json["waterPresent"] = currentWaterPresent;
  json["tdsPpm"] = currentTdsPpm;
  json["tdsPercent"] = currentWaterPurityPercent;
  json["tdsReadingValid"] = currentTdsReadingValid;
  json["filterState"] = filterOutputState ? "Active" : "Inactive";
  json["ph"] = currentPh;
  json["online"] = true;
  JsonObject updatedAt = json.createNestedObject("updatedAt");
  updatedAt[".sv"] = "timestamp";

  String payload;
  serializeJson(json, payload);

  const bool success =
    httpsPut("/devices/" + String(AQUARIUM_ID) + "/telemetry", payload);

  if (success) {
    Serial.println("Telemetry uploaded successfully.");
  } else {
    Serial.println("Telemetry upload failed.");
  }
}

void writeTelemetryHistorySnapshot() {
  if (!rtcReady) {
    return;
  }

  const DateTime now = rtc.now();
  const uint64_t recordedAtEpochMs = getRtcEpochMillisUtc(now);

  DynamicJsonDocument json(320);
  json["temperatureC"] = currentTemperatureC;
  json["temperatureReadingValid"] = currentTemperatureReadingValid;
  json["waterLevelPercent"] = currentWaterLevelPercent;
  json["waterPresent"] = currentWaterPresent;
  json["tdsPpm"] = currentTdsPpm;
  json["tdsPercent"] = currentWaterPurityPercent;
  json["tdsReadingValid"] = currentTdsReadingValid;
  json["filterState"] = filterOutputState ? "Active" : "Inactive";
  json["ph"] = currentPh;
  json["online"] = true;
  json["recordedAt"] = getTimestampText(now);
  json["recordedAtEpoch"] = recordedAtEpochMs;

  String payload;
  serializeJson(json, payload);

  const String historyPath =
    "/devices/" + String(AQUARIUM_ID) + "/history/" + getDateKey(now) + "/" + getTimeKey(now);

  const bool success = httpsPut(historyPath, payload);

  if (success) {
    Serial.println("Telemetry history snapshot saved.");
  } else {
    Serial.println("Telemetry history snapshot failed.");
  }
}

void handleLatestCommand(const JsonDocument& command) {
  const char* commandId = command["commandId"] | "";

  if (strlen(commandId) == 0 || lastCommandId == String(commandId)) {
    return;
  }

  lastCommandId = String(commandId);
  const char* type = command["type"] | "";

  Serial.print("Received command: ");
  Serial.println(type);

  if (String(type) == "feed_now") {
    runFeeder();
    return;
  }

  if (String(type) == "set_filter_state") {
    const char* state = command["state"] | "Inactive";
    const bool enableFilter = String(state) == "Active";

    if (automationEnabled) {
      filterOverrideActive = true;
      filterOverrideState = enableFilter;
    }

    setFilterState(enableFilter);
    return;
  }

  if (String(type) == "set_light_state") {
    const char* state = command["state"] | "Off";
    setLightState(String(state) == "On");
  }
}

void pollLatestCommand() {
  const String payload =
    httpsGet("/devices/" + String(AQUARIUM_ID) + "/commands/latest");

  if (payload.length() == 0 || payload == "null") {
    Serial.println("No command available.");
    return;
  }

  DynamicJsonDocument json(512);
  const DeserializationError error = deserializeJson(json, payload);

  if (error) {
    Serial.print("Command JSON parse failed: ");
    Serial.println(error.c_str());
    return;
  }

  handleLatestCommand(json);
}

void setupRtc() {
  Wire.begin(RTC_SDA_PIN, RTC_SCL_PIN);

  if (!rtc.begin()) {
    Serial.println("RTC not found.");
    rtcReady = false;
    return;
  }

  if (rtc.lostPower()) {
    Serial.println("RTC lost power, setting time from compile time.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  rtcReady = true;

  DateTime now = rtc.now();
  Serial.print("RTC time: ");
  Serial.print(now.year());
  Serial.print("-");
  Serial.print(now.month());
  Serial.print("-");
  Serial.print(now.day());
  Serial.print(" ");
  Serial.print(now.hour());
  Serial.print(":");
  if (now.minute() < 10) {
    Serial.print("0");
  }
  Serial.print(now.minute());
  Serial.print(":");
  if (now.second() < 10) {
    Serial.print("0");
  }
  Serial.println(now.second());
}

void setup() {
  pinMode(FILTER_RELAY_PIN, OUTPUT);
  pinMode(LIGHT_RELAY_PIN, OUTPUT);
  pinMode(WATER_LEVEL_PIN, INPUT);
  pinMode(TDS_SENSOR_PIN, INPUT);

  digitalWrite(FILTER_RELAY_PIN, RELAY_OFF);
  digitalWrite(LIGHT_RELAY_PIN, RELAY_OFF);
  filterOutputState = false;
  lightOutputState = false; 

  Serial.begin(115200);
  Serial.println();
  Serial.println("SmartAqua RTC + Servo + Water Level + TDS starting...");

  analogReadResolution(12);

  feederServo.setPeriodHertz(50);
  feederServo.attach(SERVO_PIN, 500, 2400);
  feederServo.write(SERVO_REST_ANGLE);

  temperatureSensors.begin();
  setupRtc();
  connectWifi();

  if (WiFi.status() == WL_CONNECTED) {
    authenticateDeviceIdentity();
  }

  pollControlProfile();
}

void loop() {
  const unsigned long now = millis();

  if (WiFi.status() != WL_CONNECTED && now - lastWifiConnectAttemptAt >= wifiRetryIntervalMs) {
    connectWifi();
  }

  checkScheduledFeeding();
  applyScheduledFiltration();

  if (now - lastTelemetryAt >= telemetryIntervalMs) {
    readSensors();

    if (WiFi.status() == WL_CONNECTED) {
      uploadTelemetry();
    } else {
      Serial.println("Skipping telemetry upload because WiFi is disconnected.");
    }

    lastTelemetryAt = now;
  }

  if (rtcReady && (lastHistoryLogAt == 0 || now - lastHistoryLogAt >= historyLogIntervalMs)) {
    writeTelemetryHistorySnapshot();
    lastHistoryLogAt = now;
  }

  if (WiFi.status() == WL_CONNECTED && now - lastCommandPollAt >= commandPollIntervalMs) {
    pollLatestCommand();
    lastCommandPollAt = now;
  }

  if (WiFi.status() == WL_CONNECTED && now - lastControlPollAt >= controlPollIntervalMs) {
    pollControlProfile();
    checkScheduledFeeding();
    applyScheduledFiltration();
    lastControlPollAt = now;
  }
}
