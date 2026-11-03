# SmartAqua Pro RTDB Emulator Test Plan

## Purpose

This plan defines isolated security tests for `database.rules.json`. It does not create application telemetry, modify production Firebase data, or verify physical ESP32 behavior.

## Environment gate

Use only a Firebase `demo-*` project with the Authentication and Realtime Database emulators. Do not use the production project ID or production credentials.

Minimum environment:

- A Node.js version supported by the selected Firebase CLI.
- A current Firebase CLI.
- JDK 21 or newer selected by the terminal when using the currently installed Firebase CLI `15.34.0`.
- `@firebase/rules-unit-testing` installed as a development dependency.
- A test runner approved for the repository.

Verified environment on October 17, 2026:

- Temurin OpenJDK `21.0.12.1` LTS.
- Firebase CLI `15.34.0`.
- Node.js `24.15.0`.
- npm `11.12.1`.
- `@firebase/rules-unit-testing` `5.0.2`, compatible with the repository's Firebase 12 dependency.
- Isolated project ID `demo-smartaqua-rtdb-auth`.

The emulator starts successfully and loads `database.rules.json`. The suite is run with `npm run test:rtdb-rules`.

## Fixture policy

Seed only the authorization records and minimal deterministic RTDB values required to exercise a rule. Seed them through the rules-testing administrative context while security rules are disabled. Do not add a generator, random readings, simulated aquarium conditions, application-visible mock telemetry, or any production record.

Recommended test principals:

- `user-a`: verified human with mirrored role `User`.
- `user-b`: verified human with mirrored role `User`.
- `admin-a`: verified human with mirrored role `Admin`.
- `device-a`: token claim `principalType: "device"`, assigned only to Aquarium A.
- `device-b`: token claim `principalType: "device"`, assigned only to Aquarium B.
- anonymous context.

Use separate authenticated test contexts to represent two simultaneous sessions for `user-a`.

## Required test cases

| ID | Scenario | Expected result |
| --- | --- | --- |
| AUTH-01 | Anonymous read or write anywhere under `/devices` | Deny |
| AUTH-02 | Any client reads or writes `/authorization` | Deny |
| AUTH-03 | Unknown top-level or device child path | Deny |
| USER-01 | User A reads Aquarium A telemetry, control, latest command, and one history date | Allow |
| USER-02 | User A reads or writes Aquarium B | Deny |
| USER-03 | User B reads or writes Aquarium A | Deny |
| USER-04 | Two contexts with User A's UID read Aquarium A | Allow both |
| USER-05 | Unverified User A accesses Aquarium A | Deny |
| USER-06 | User A writes telemetry | Deny |
| USER-07 | User A writes any history record | Deny |
| USER-08 | User A writes a complete valid control profile | Allow |
| USER-08B | User A partially updates approved control fields, then deletes a required field or adds an unknown field | Allow approved updates; deny invalid changes |
| USER-09 | User A writes an unknown control field | Deny |
| USER-10 | User A writes an invalid mode, state, time, runtime, or field type | Deny |
| USER-11 | User A deletes the control profile | Deny |
| CMD-01 | User A submits valid `feed_now` for Aquarium A with its own requester UID | Allow |
| CMD-02 | User A submits valid filter or light state command | Allow |
| CMD-03 | Command aquarium ID differs from the path | Deny |
| CMD-04 | Command requester differs from `auth.uid` | Deny |
| CMD-05 | Command contains an unknown field or invalid type-specific state/duration | Deny |
| CMD-06 | User deletes `commands/latest` | Deny |
| ADMIN-01 | Admin reads telemetry, control, latest command, or history | Deny |
| ADMIN-02 | Admin writes telemetry, control, latest command, or history | Deny |
| DEVICE-01 | Device A writes schema-valid telemetry for Aquarium A | Allow |
| DEVICE-02 | Device A reads Aquarium A control and latest command | Allow |
| DEVICE-03 | Device A accesses Aquarium B | Deny |
| DEVICE-04 | Device A writes control or creates a command | Deny |
| DEVICE-05 | Device A writes history before protocol approval | Deny |
| DEVICE-06 | Human UID listed as a device but without the device claim writes telemetry | Deny |
| DEVICE-07 | Claimed device not listed in `deviceUids` writes telemetry | Deny |
| DEVICE-08 | Assigned device writes unknown, incomplete, or mistyped telemetry | Deny |
| STATE-01 | Aquarium authorization is missing | Deny |
| STATE-02 | Aquarium state is `revoked` | Deny |
| STATE-03 | Aquarium state is `transitioning` | Deny |
| STATE-04 | Mirrored user role is missing or `Admin` | Deny human device-data access |
| TRANSFER-01 | Set Aquarium A to `transitioning`; old and new owners access it | Deny both |
| TRANSFER-02 | Activate Aquarium A for new owner; old owner accesses it | Deny old owner |
| TRANSFER-03 | Activate Aquarium A for new owner; new owner accesses it | Allow new owner |
| PARENT-01 | Authorized owner reads `/devices` | Deny |
| PARENT-02 | Authorized owner reads `/devices/AquariumA` | Deny |
| PARENT-03 | Authorized owner reads `/devices/AquariumA/history` | Deny |
| PARENT-04 | Authorized owner reads `/devices/AquariumA/history/{dateKey}` | Allow |
| PARENT-05 | Owner attempts parent or multi-location writes that include unauthorized children | Deny |

## Executed results

The complete suite contains 40 Node tests. Some tests contain multiple assertions to cover all operations represented by one scenario ID.

| Run | Result | Failures | Notes |
| --- | --- | --- | --- |
| First isolated run | 40 passed | 0 | Draft rules compiled and loaded successfully |
| Second isolated run | 40 passed | 0 | Confirmed fixture cleanup and repeatability |

The Firebase CLI's lookup of the intentionally nonexistent `demo-*` project returned `403 PERMISSION_DENIED`; the CLI then continued with its protected local demo configuration as expected. All rule evaluations occurred on `127.0.0.1:9000`, and the emulator shut down after each run.

## Validation procedure

1. Parse `database.rules.json` as JSON before starting the emulator.
2. Start only the Authentication and Realtime Database emulators with a `demo-*` project.
3. Initialize the rules test environment with the repository rules file.
4. Seed each test independently through the administrative setup context.
5. Use `assertSucceeds` and `assertFails` for every expected result.
6. Clear the emulated database after each test.
7. Run the complete suite twice to expose fixture leakage or order dependence.
8. Review the RTDB rule coverage report and add cases for every unexecuted rule branch.
9. Run web and mobile integration checks against the same emulator only after unit rules pass.
10. Stop the emulators and confirm no production project was contacted.

## Hardware-dependent verification

The emulator can verify identity, aquarium isolation, payload validation, and permission boundaries. It cannot prove ESP32 credential storage, token renewal, Wi-Fi recovery, command execution, sensor accuracy, history retry behavior, or long-duration hardware stability. Those remain physical-device tests after the firmware and provisioning protocol are approved.
