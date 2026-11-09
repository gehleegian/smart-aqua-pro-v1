#pragma once
// Aquarium 2 ONLY. Never use Aquarium 1's device login or aquarium ID here.
#ifndef AQUARIUM_CLOUD_ENABLED
#define AQUARIUM_CLOUD_ENABLED 1
#endif
constexpr bool CLOUD_ENABLED = AQUARIUM_CLOUD_ENABLED != 0;
#if defined(AQUARIUM_COMPILE_CHECK)
// Compiler coverage only; never upload a build using this flag.
constexpr char WIFI_SSID[] = "COMPILE_CHECK_ONLY";
constexpr char WIFI_PASSWORD[] = "COMPILE_CHECK_ONLY";
constexpr char FIREBASE_API_KEY[] = "COMPILE_CHECK_ONLY";
constexpr char DEVICE_EMAIL[] = "compile@example.invalid";
constexpr char DEVICE_PASSWORD[] = "COMPILE_CHECK_ONLY";
constexpr char AQUARIUM_ID[] = "compile-check-only";
#elif __has_include("C:/Users/marin/firebase-private/aquarium2-firmware-secrets.h")
#include "C:/Users/marin/firebase-private/aquarium2-firmware-secrets.h"
#else
#error "Aquarium 2 private settings header is missing. Do not substitute Aquarium 1 credentials."
#endif
#if defined(AQUARIUM_COMPILE_CHECK)
constexpr char DEVICE_UID[] = "compile-check-device";
constexpr char ENCLOSURE_ID[] = "COMPILE_CHECK_ONLY";
#else
#include "DeviceIdentity.h" // ignored; copy the example and use the private manifest
#endif
constexpr char DATABASE_URL[] =
  "https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app";

// Owner confirmed identical wiring and matching calibration outputs.
// Reuse Aquarium 1 references; this is not an independent accuracy certification.
constexpr float TEMP18_OFFSET_C = 0.0f;
constexpr float TEMP19_OFFSET_C = 0.0f;
// Aquarium 2 uses a digital optocoupler, NOT Aquarium 1's analog divider.
// Owner-observed GPIO33: 12V present -> 0; 12V removed -> 1 (USB retained).
// Output side VCC must be 3.3V, OUT -> GPIO33, GND -> ESP32 GND.
constexpr int POWER_PRESENT_LEVEL = 0; // confirmed active-LOW digital detector
constexpr bool POWER_SENSOR_ANALOG = false;
constexpr float POWER_DIVIDER_RATIO = 5.0f; // unused in digital mode
constexpr float POWER_SIGNAL_OFF_V = 0.0f; // unused; not a calibration for this device
constexpr float POWER_SIGNAL_ON_V = 0.0f;
#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1
constexpr bool PROFILE_LEVEL_ENABLED = false; // Aquarium 1 only.
