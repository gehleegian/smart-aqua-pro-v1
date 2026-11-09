#pragma once
// Aquarium 2: owner-confirmed SG90, NOT Aquarium 1's MG90S.
// Provisional bench positions, NOT a measured mechanical calibration.
// Main sketch maps 0-180 degrees across 1000-2000us: 135=1750us, 45=1250us.
// Enable only after the owner confirms an empty, unobstructed feeder test.
constexpr bool FEEDER_TEST_ENABLED = true; // owner confirmed empty and arm clear
// Reversed provisional sweep for the owner's requested left turn.
constexpr int FEEDER_HOME_DEG = 135;
constexpr int FEEDER_DISPENSE_DEG = 45;
constexpr uint32_t FEEDER_HOLD_MS = 1500; // owner-requested dwell
constexpr uint32_t FEEDER_TRAVEL_MS = 600; // settle allowance, not position feedback
constexpr uint32_t FEEDER_COOLDOWN_MS = 5000; // owner-requested cooldown after return
