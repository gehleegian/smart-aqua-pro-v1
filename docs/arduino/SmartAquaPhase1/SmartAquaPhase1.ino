#include <Arduino.h>

const int TDS_PIN = 32;

// Keep equipment inactive during this sensor test.
const int LIGHT_RELAY_PIN = 16;
const int PUMP_RELAY_PIN = 17;
const int SERVO_PIN = 15;

void setup() {
  // Your relays are active LOW.
  digitalWrite(LIGHT_RELAY_PIN, HIGH);
  digitalWrite(PUMP_RELAY_PIN, HIGH);
  pinMode(LIGHT_RELAY_PIN, OUTPUT);
  pinMode(PUMP_RELAY_PIN, OUTPUT);

  digitalWrite(SERVO_PIN, LOW);
  pinMode(SERVO_PIN, OUTPUT);

  Serial.begin(115200);

  pinMode(TDS_PIN, INPUT);
  analogReadResolution(12);
  analogSetPinAttenuation(TDS_PIN, ADC_11db);

  delay(1000);
  Serial.println("TDS test - GPIO32");
  Serial.println("Voltage only; NOT calibrated ppm.");
}

void loop() {
  const int samples = 50;
  uint32_t totalRaw = 0;
  uint32_t totalMillivolts = 0;
  uint32_t minimumMv = 0xFFFFFFFFUL;
  uint32_t maximumMv = 0;

  analogRead(TDS_PIN);
  delay(5);

  for (int i = 0; i < samples; i++) {
    totalRaw += analogRead(TDS_PIN);

    uint32_t mv = analogReadMilliVolts(TDS_PIN);
    totalMillivolts += mv;

    if (mv < minimumMv) minimumMv = mv;
    if (mv > maximumMv) maximumMv = mv;

    delay(10);
  }

  float averageRaw = totalRaw / (float)samples;
  float voltage = totalMillivolts / (samples * 1000.0f);

  Serial.print("TDS raw average: ");
  Serial.print(averageRaw, 0);

  Serial.print(" | ESP voltage: ");
  Serial.print(voltage, 3);
  Serial.print(" V");

  Serial.print(" | Min: ");
  Serial.print(minimumMv / 1000.0f, 3);

  Serial.print(" V | Max: ");
  Serial.print(maximumMv / 1000.0f, 3);
  Serial.println(" V");

  if (voltage >= 3.0f) {
    Serial.println("WARNING: Near ADC upper range; check output voltage.");
  } else if (voltage < 0.15f) {
    Serial.println(
      "Low signal: could be low conductivity or a wiring/power fault."
    );
  }

  delay(500);
}