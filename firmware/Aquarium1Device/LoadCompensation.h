#pragma once
#include <math.h>

// EXPERIMENTAL AQ1 5V/2A-adapter profile, owner screenshots 2026-11-11.
// Output-unit estimates, NOT measured input voltages or reference calibration.
// Assumes unchanged water/probe mounting during the owner's paired tests.
// No learning, baseline locking, automatic equipment cycling or source detection.
// Set false for laptop USB or to restore unadjusted current measurements.
namespace LoadCompensation {
constexpr bool ENABLED = true;

// Index: OFF, light only, filter only, both ON.
// OFF: initial and final settled pH 8.9, TDS 89, level 68.7%.
// The intermediate OFF pH 9.3 is drift, not silently used as a calibration point.
// ON entries are arithmetic midpoints of the two screenshots for each state.
constexpr float PH_REFERENCE[4] = {8.9f, (4.7f + 4.8f) / 2.0f, (10.0f + 9.5f) / 2.0f, 5.2f};
constexpr float TDS_REFERENCE_PPM[4] = {89.0f, (179.0f + 183.0f) / 2.0f, (105.0f + 102.0f) / 2.0f, (204.0f + 172.0f) / 2.0f};
constexpr float LEVEL_REFERENCE_PERCENT[4] = {68.7f, 68.7f, (53.8f + 52.5f) / 2.0f, (53.8f + 54.8f) / 2.0f};
// Preserve the scale used when collecting those screenshots, even if the
// current full-water reference is recalibrated later.
constexpr float OBSERVATION_SPAN_CM = 27.0f - 20.2f;

inline unsigned stateIndex(bool light, bool filter) {
  return (light ? 1U : 0U) + (filter ? 2U : 0U);
}

inline float phShift(bool light, bool filter) {
  return ENABLED ? PH_REFERENCE[stateIndex(light, filter)] - PH_REFERENCE[0] : 0.0f;
}

inline float tdsShift(bool light, bool filter) {
  return ENABLED ? TDS_REFERENCE_PPM[stateIndex(light, filter)] - TDS_REFERENCE_PPM[0] : 0.0f;
}

inline float distanceShift(bool light, bool filter) {
  // Infer distance shift using the historical observation span, not today's FULL_CM.
  // It is not a measured distance or a dimension/operational-volume calculation.
  return ENABLED ? (LEVEL_REFERENCE_PERCENT[0] - LEVEL_REFERENCE_PERCENT[stateIndex(light, filter)]) * OBSERVATION_SPAN_CM / 100.0f : 0.0f;
}

inline float voltage(float raw, bool clipped) {
  // Never turn clipped/disconnected inputs into plausible compensated values.
  return !clipped && isfinite(raw) && raw > 0.0f && raw < 3.3f ? raw : NAN;
}

inline float ph(float raw, bool light, bool filter) {
  if (!isfinite(raw) || raw <= 0.0f || raw > 14.0f) return NAN;
  const float adjusted = raw - phShift(light, filter);
  return isfinite(adjusted) && adjusted > 0.0f && adjusted <= 14.0f ? adjusted : NAN;
}

inline float tds(float raw, bool light, bool filter) {
  if (!isfinite(raw) || raw < 0.0f) return NAN;
  const float adjusted = raw - tdsShift(light, filter);
  // A negative result is unavailable, not zero or a stored OFF value.
  return isfinite(adjusted) && adjusted >= 0.0f ? adjusted : NAN;
}

inline float distance(float raw, float shift) {
  if (!isfinite(raw) || raw < 20.0f || raw > 800.0f) return NAN;
  const float adjusted = raw - shift;
  return isfinite(adjusted) && adjusted >= 20.0f && adjusted <= 800.0f ? adjusted : NAN;
}
}
