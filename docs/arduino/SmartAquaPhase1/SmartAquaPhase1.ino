#include <Wire.h>
#include <RTClib.h>
#include <OneWire.h>
#include <DallasTemperature.h>

RTC_DS3231 rtc;

// =====================================================
// PIN ASSIGNMENTS
// =====================================================

// RTC
const int RTC_SDA = 21;
const int RTC_SCL = 22;

// AJ-SR04M ultrasonic sensor
const int TRIG_PIN = 26;
const int ECHO_PIN = 27;

// pH sensor
const int PH_PIN = 34;

// Temperature sensors
const int TEMP1_PIN = 18;
const int TEMP2_PIN = 19;

// =====================================================
// TEMPERATURE CALIBRATION OFFSETS
// =====================================================

// Leave at 0.0 until the ice-water calibration is finished.
const float TEMP1_OFFSET = 0.0;
const float TEMP2_OFFSET = 0.0;

// After calibration, change only the required value.
// Example only:
// const float TEMP2_OFFSET = 1.75;

// =====================================================
// TEMPERATURE SENSOR OBJECTS
// =====================================================

OneWire oneWire1(TEMP1_PIN);
OneWire oneWire2(TEMP2_PIN);

DallasTemperature temperature1(&oneWire1);
DallasTemperature temperature2(&oneWire2);

// =====================================================
// ULTRASONIC READING
// =====================================================

float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(3);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000);

  if (duration == 0) {
    return -1.0;
  }

  return duration * 0.0343 / 2.0;
}

// =====================================================
// PH VOLTAGE READING
// =====================================================

float readPHInputVoltage() {
  unsigned long totalMillivolts = 0;

  for (int i = 0; i < 30; i++) {
    totalMillivolts += analogReadMilliVolts(PH_PIN);
    delay(10);
  }

  float averageMillivolts = totalMillivolts / 30.0;
  return averageMillivolts / 1000.0;
}

// =====================================================
// SETUP
// =====================================================

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println();
  Serial.println("SmartAqua combined sensor test");
  Serial.println("--------------------------------");

  // RTC
  Wire.begin(RTC_SDA, RTC_SCL);

  if (!rtc.begin()) {
    Serial.println("ERROR: DS3231 RTC not detected!");

    while (true) {
      delay(1000);
    }
  }

  Serial.println("RTC detected.");

  // Set compile time only if RTC battery power was lost
  if (rtc.lostPower()) {
    Serial.println("RTC lost power. Setting compile time.");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }

  // Ultrasonic
  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  // ESP32 analog input
  analogReadResolution(12);
  analogSetPinAttenuation(PH_PIN, ADC_11db);

  // Temperature sensors
  temperature1.begin();
  temperature2.begin();

  temperature1.setResolution(12);
  temperature2.setResolution(12);

  // Start both conversions without waiting separately
  temperature1.setWaitForConversion(false);
  temperature2.setWaitForConversion(false);

  Serial.print("Sensors detected on GPIO18: ");
  Serial.println(temperature1.getDeviceCount());

  Serial.print("Sensors detected on GPIO19: ");
  Serial.println(temperature2.getDeviceCount());

  Serial.println("--------------------------------");
}

// =====================================================
// MAIN LOOP
// =====================================================

void loop() {
  DateTime now = rtc.now();

  // Read ultrasonic sensor
  float distanceCm = readDistanceCm();

  // Read pH-board voltage
  int phRaw = analogRead(PH_PIN);
  float espVoltage = readPHInputVoltage();

  // Reconstruct voltage before the 10k/10k divider
  float phBoardVoltage = espVoltage * 2.0;

  // Start both temperature conversions
  temperature1.requestTemperatures();
  temperature2.requestTemperatures();

  // A 12-bit DS18B20 conversion can require up to 750 ms
  delay(800);

  float temp1C = temperature1.getTempCByIndex(0);
  float temp2C = temperature2.getTempCByIndex(0);

  // Apply calibration only to valid readings
  if (temp1C != DEVICE_DISCONNECTED_C) {
    temp1C += TEMP1_OFFSET;
  }

  if (temp2C != DEVICE_DISCONNECTED_C) {
    temp2C += TEMP2_OFFSET;
  }

  // Date and time
  Serial.printf(
    "%04d-%02d-%02d %02d:%02d:%02d",
    now.year(),
    now.month(),
    now.day(),
    now.hour(),
    now.minute(),
    now.second()
  );

  // Ultrasonic result
  if (distanceCm < 0) {
    Serial.print(" | Distance: no echo");
  } else {
    Serial.print(" | Distance: ");
    Serial.print(distanceCm, 1);
    Serial.print(" cm");
  }

  // Temperature sensor 1
  Serial.print(" | Temp 1: ");

  if (temp1C == DEVICE_DISCONNECTED_C) {
    Serial.print("not detected");
  } else {
    Serial.print(temp1C, 2);
    Serial.print(" C");
  }

  // Temperature sensor 2
  Serial.print(" | Temp 2: ");

  if (temp2C == DEVICE_DISCONNECTED_C) {
    Serial.print("not detected");
  } else {
    Serial.print(temp2C, 2);
    Serial.print(" C");
  }

  // pH electrical readings
  Serial.print(" | pH raw: ");
  Serial.print(phRaw);

  Serial.print(" | ESP voltage: ");
  Serial.print(espVoltage, 3);
  Serial.print(" V");

  Serial.print(" | pH board voltage: ");
  Serial.print(phBoardVoltage, 3);
  Serial.println(" V");

  delay(500);
}