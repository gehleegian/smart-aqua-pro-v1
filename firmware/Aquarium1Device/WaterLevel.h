#pragma once
namespace WaterLevel {
constexpr float EMPTY_CM = 27.0f;
constexpr float MIN_CM = 20.0f;
constexpr bool positive(float v) { return v > 0 && v < 1.0e30f; }
constexpr float targetHeight(float length, float width, float height, float liters) {
  if (!positive(length) || !positive(width) || !positive(height) || !positive(liters)) return 0;
  const float target = liters * 1000.0f / (length * width);
  return positive(target) && target <= height && EMPTY_CM - target >= MIN_CM ? target : 0;
}
constexpr float percent(float distance, float target) {
  if (!(distance >= MIN_CM && distance <= 800.0f) || !positive(target)) return -1;
  const float measuredHeight = EMPTY_CM - distance;
  const float value = measuredHeight * 100.0f / target;
  return value < 0 ? 0 : value > 100 ? 100 : value;
}
// Isolated compile-time fixtures, never substituted for measurements.
static_assert(targetHeight(50, 30, 25, 9) == 6, "liters to cm");
static_assert(percent(27, 6) == 0, "empty");
static_assert(percent(24, 6) == 50, "half target");
static_assert(percent(21, 6) == 100, "full target");
static_assert(percent(20, 6) == 100, "display capped above target");
static_assert(percent(19, 6) == -1, "blind echo invalid, not full");
static_assert(targetHeight(9, 10, 9, 10) == 0, "impossible capacity");
static_assert(targetHeight(50, 30, 25, 15) == 0, "target inside blind zone");
static_assert(targetHeight(0, 30, 25, 9) == 0, "missing geometry");
}
