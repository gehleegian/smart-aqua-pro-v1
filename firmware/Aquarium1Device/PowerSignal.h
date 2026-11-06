#pragma once

namespace PowerSignal {
enum class State { Unknown, Absent, Present };

// A two-reference presence discriminator, NOT a voltage accuracy/undervoltage fit.
// Invalid references, nonfinite signals and ADC saturation must never mean OK.
constexpr State classify(float signal, float off, float on, bool saturated = false) {
  if (saturated || !(off >= 0.0f && on > off && on <= 3.3f) ||
      !(signal >= 0.0f && signal <= 3.3f)) return State::Unknown;
  const float midpoint = (off + on) / 2.0f;
  return signal > midpoint ? State::Present
    : signal < midpoint ? State::Absent : State::Unknown;
}
constexpr const char* label(State state) {
  return state == State::Present ? "Online"
    : state == State::Absent ? "Power Interruption" : "Unknown";
}

// Compile-time tests use the observed ON/OFF signal references, not live samples.
static_assert(classify(2.514f, .142f, 2.515f) == State::Present, "restored supply");
static_assert(classify(.142f, .142f, 2.515f) == State::Absent, "unplugged supply");
static_assert(classify(0, .142f, 2.515f) == State::Absent, "zero is not missing");
static_assert(classify((.142f+2.515f)/2, .142f, 2.515f) == State::Unknown, "boundary ambiguous");
static_assert(classify(2.5f, 0, 0) == State::Unknown, "missing reference");
static_assert(classify(2.5f, 2.5f, .1f) == State::Unknown, "reversed references");
static_assert(classify(-1, .142f, 2.515f) == State::Unknown, "negative signal invalid");
static_assert(classify(5, .142f, 2.515f) == State::Unknown, "overrange invalid");
static_assert(classify(2.5f, .142f, 2.515f, true) == State::Unknown, "saturation invalid");
}
