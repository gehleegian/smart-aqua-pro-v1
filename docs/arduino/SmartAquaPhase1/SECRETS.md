# Arduino `secrets.h` Setup

You can use the sketch in two modes:

1. simple mode now
2. device identity mode later

## Simple mode now

If you do not want device email/password yet, leave these blank:

```cpp
const char* FIREBASE_AUTH = "";
const char* FIREBASE_WEB_API_KEY = "";
const char* DEVICE_EMAIL = "";
const char* DEVICE_PASSWORD = "";
```

Then keep only the values you already know:

```cpp
#pragma once

const char* WIFI_SSID = "YourWifiName";
const char* WIFI_PASSWORD = "YourWifiPassword";

const char* FIREBASE_DATABASE_URL =
  "https://your-project-default-rtdb.region.firebasedatabase.app";
const char* FIREBASE_AUTH = "";
const char* FIREBASE_WEB_API_KEY = "";
const char* DEVICE_EMAIL = "";
const char* DEVICE_PASSWORD = "";
const char* AQUARIUM_ID = "your-aquarium-id";
```

In this mode, the sketch will keep using plain RTDB requests.

## Device identity mode later

When you are ready for stricter Firebase device security, fill in:

- `FIREBASE_WEB_API_KEY`
- `DEVICE_EMAIL`
- `DEVICE_PASSWORD`

Those come from the website provisioning flow.

## Important note

Simple mode works only if your currently deployed Realtime Database rules still allow the ESP32 to read and write without device-auth enforcement.
