# Aquarium 2 setup - 2026-11-07

Live enclosure ID and device Auth UID are redacted for publication. Use the
private registration manifest; `REDACTED-AQUARIUM2-ID` below is not a claimable ID.
Project: practice-smartaqua. User confirmed the same wiring as Aquarium 1.

## Registration completed

setup-aquarium2.mjs created a separate password identity with principalType=device,
verified email/password sign-in and a refreshed/revocation-checked device-role
token, and used the existing provision-device.mjs registry transaction to reserve
Aquarium 2's own aquarium ID. The private device registry and UID binding were
read back and matched. State at registration was unclaimed with no owner assigned.
No human account, sample aquarium, Aquarium 1 record, rule, or command was changed.

User 2 must sign into their own normal account, use Aquariums > Add Aquarium,
enter REDACTED-AQUARIUM2-ID and the actual tank profile, and save. Existing account,
email-policy and ownership checks apply. Setup does not guess a User 2 UID or
assign a customer on their behalf. There is no additional customer claim code.

## Private files

The external private directory C:/Users/marin/firebase-private contains
aquarium2-device-login.json, aquarium2-registration.json and
aquarium2-firmware-secrets.h. Credentials are unique to Aquarium 2; Wi-Fi settings
and the public project API key were copied privately from Aquarium 1. Existing
files are exclusively created or verified rather than overwritten. No passwords,
keys or tokens were printed. Do not publish the filled header or compiled binary.

## Firmware files and checks

Complete Arduino folder: C:/new/Aquarium2Device. Open Aquarium2Device.ino directly;
Config.h loads Aquarium 2's external header. FeederConfig.h, ScheduleLogic.h and
ScheduleLogicTests.h accompany the sketch. Source matches Aquarium 1's latest
control implementation except identity configuration, human-readable tank labels,
and the separate aq2-schedule persistent feeding namespace. Static contract,
source-parity/isolation test and targeted lint passed. Real-settings compilation
passed: 1,154,865 bytes flash (88%) and 48,156 bytes global RAM (14%). The compiler
also executed the included schedule-boundary regression assertions.

Pin map: light16, filter17, servo15, temperatures18/19, pH34, TDS32, turbidity35,
ultrasonic TRIG26/ECHO27, optocoupler OUT33. Keep the turbidity divider, separate
temperature pull-ups, and 3.3V-safe digital inputs. The same control cycle uses
135/45-degree provisional positions, 1.5-second dwell and five-second cooldown.
UTC+8 schedules and manual override behavior match Aquarium 1.

Sensor references are starting values copied from Aquarium 1 and still require
verification on this tank. Power polarity is unconfirmed; TDS is unavailable
remotely; categorical turbidity is Serial-only. No measurements were fabricated.
Post-upload serial observation verified Wi-Fi connected, network time ready,
authenticated=yes and both temperature probes returning 24.06C. Ultrasound gave
26.0–26.4cm during observation; these are real readings, not accuracy verification.
pH input was approximately 2.095V, outside the copied buffer fit (nan), turbidity
0.142V/Unknown, and TDS 0.142V below the homemade baseline. Check these sensor
connections/references on this tank before treating them as calibrated. Relay
load operation, servo alignment, schedule action and sensor accuracy remain
unverified. No equipment commands were sent by setup.

## Port and upload

The user explicitly confirmed COM3 is Aquarium 2 and authorized upload. The
upload completed with verified flash hashes and successful reset. Its detected
chip MAC differs from Aquarium 1. Both relays booted OFF; no servo cycle was
triggered. The post-upload live registry audit still showed unclaimed, no device
grant/control/command/telemetry. web ready=no is expected until User 2 claims
and saves control settings. No grants were bypassed to force communication.
After a claim an enabled schedule may resume after authenticated access.
