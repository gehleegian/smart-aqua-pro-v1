#pragma once
// Provisional bench positions, NOT a measured mechanical calibration.
// Enable only after the owner confirms an empty, unobstructed feeder test.
constexpr bool FEEDER_TEST_ENABLED = true; // owner confirmed empty and arm clear
// Reversed provisional sweep for the owner's requested left turn.
constexpr int FEEDER_HOME_DEG = 135;
constexpr int FEEDER_DISPENSE_DEG = 45;
constexpr uint32_t FEEDER_HOLD_MS = 1500; // owner-requested dwell
constexpr uint32_t FEEDER_TRAVEL_MS = 600; // settle allowance, not position feedback
constexpr uint32_t FEEDER_COOLDOWN_MS = 5000; // owner-requested cooldown after return
