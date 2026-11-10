#pragma once

// Local tests work without Wi-Fi. Set true only after registering/claiming the
// device and configuring its UNIQUE Firebase email/password (not a human login).
#ifndef AQUARIUM_CLOUD_ENABLED
#define AQUARIUM_CLOUD_ENABLED 1
#endif
constexpr bool CLOUD_ENABLED = AQUARIUM_CLOUD_ENABLED != 0;
#if defined(AQUARIUM_COMPILE_CHECK)
// Offline compiler coverage only. Never upload a build made with this flag.
constexpr char WIFI_SSID[] = "COMPILE_CHECK_ONLY";
constexpr char WIFI_PASSWORD[] = "COMPILE_CHECK_ONLY";
constexpr char FIREBASE_API_KEY[] = "COMPILE_CHECK_ONLY";
constexpr char DEVICE_EMAIL[] = "compile@example.invalid";
constexpr char DEVICE_PASSWORD[] = "COMPILE_CHECK_ONLY";
constexpr char AQUARIUM_ID[] = "compile-check-only";
#elif __has_include("C:/Users/marin/firebase-private/aquarium1-firmware-secrets.h")
#include "C:/Users/marin/firebase-private/aquarium1-firmware-secrets.h"
#else
constexpr char WIFI_SSID[] = "";
constexpr char WIFI_PASSWORD[] = "";
constexpr char FIREBASE_API_KEY[] = "";
constexpr char DEVICE_EMAIL[] = "";
constexpr char DEVICE_PASSWORD[] = "";
// Use the reserved aquariumId from the registration manifest, NOT enclosure ID.
constexpr char AQUARIUM_ID[] = "";
#endif
constexpr char DEVICE_UID[] = "esp32-SAQ-7K3M-9R2X";
constexpr char ENCLOSURE_ID[] = "SAQ-7K3M-9R2X";
constexpr char DATABASE_URL[] =
    "https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app";

// Both GPIO18 and GPIO19 probes are in the water (confirmed by owner).
// Publish their mean only when BOTH return valid completed conversions.
constexpr float TEMP18_OFFSET_C = 0.0f;
constexpr float TEMP19_OFFSET_C = 0.0f;

// Aquarium 1: passive 30k/7.5k voltage-divider module, S -> GPIO33.
// Nominal 5:1 scaling; verify against a multimeter before claiming accuracy.
constexpr bool POWER_SENSOR_ANALOG = true;
constexpr float POWER_DIVIDER_RATIO = 5.0f;
// Supervised COM5 measurements: unplugged 0.142 V; restored 2.514 V
// (initial ON 2.515 V). Midpoint is a presence discriminator, not undervoltage.
constexpr float POWER_SIGNAL_OFF_V = 0.142f;
constexpr float POWER_SIGNAL_ON_V = 2.515f;
constexpr bool PROFILE_LEVEL_ENABLED = false; // fixed 27.0 cm empty / 20.2 cm full
#define AQUARIUM_TDS_METER_REFERENCE_ENABLED 1
// Digital mode is unused on Aquarium 1.
constexpr int POWER_PRESENT_LEVEL = -1;

// Web-command test: outputs start OFF. Authenticated Manual-mode access establishes
// a command baseline; only NEW web commands may then switch outputs on.
// Cloud failures turn both relays OFF; reconnect skips retained commands.
// NOT unattended livestock mode.
// Manual feeder uses FeederConfig.h. UTC+8 schedules use the cloud
// automationEnabled toggle independently of the UI's selected mode tab.
