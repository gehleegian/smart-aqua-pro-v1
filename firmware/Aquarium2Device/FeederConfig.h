#pragma once
// Aquarium 2: owner-confirmed SG90 360-degree CONTINUOUS rotation.
// Pulses command speed/direction, NOT an angular position. No homing is possible
// without feedback. Keep the feeder EMPTY and clear during website calibration.
constexpr bool FEEDER_TEST_ENABLED = true;
// Leave false until stop, rightward direction and both travel times are observed.
// While false, website Feed Now is a supervised calibration test; schedules stay off.
constexpr bool FEEDER_CALIBRATED = false;
constexpr bool FEEDER_RETURN_TEST_ENABLED = true; // website-only round-trip calibration
constexpr int FEEDER_STOP_US = 1500; // nominal neutral; physical stop unconfirmed
constexpr int FEEDER_FORWARD_US = 1600; // owner observed rightward motion at this pulse
constexpr int FEEDER_REVERSE_US = 1400; // provisional opposite direction
constexpr uint32_t FEEDER_JOG_MS = 900; // single-leg fallback when return test is disabled
constexpr uint32_t FEEDER_FORWARD_MS = 900; // owner confirmed this right turn is correct
constexpr uint32_t FEEDER_REVERSE_MS = 900; // initial return estimate; endpoint NOT verified
constexpr uint32_t FEEDER_MAX_RUN_MS = 1000; // hard per-leg limit, not servo calibration
constexpr uint32_t FEEDER_HOLD_MS = 1000; // owner-requested 1-second neutral dwell
constexpr uint32_t FEEDER_COOLDOWN_MS = 5000;
