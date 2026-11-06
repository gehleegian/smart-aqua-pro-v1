#pragma once
#include <stdint.h>

// Zero denotes an invalid echo. Never reuse an earlier sample as fresh data.
constexpr uint32_t medianEcho(const uint32_t (&samples)[5]) {
  uint32_t sorted[5] = {};
  unsigned count = 0;
  for (unsigned i = 0; i < 5; ++i) {
    if (samples[i] == 0) continue;
    unsigned j = count;
    while (j > 0 && sorted[j - 1] > samples[i]) {
      sorted[j] = sorted[j - 1];
      --j;
    }
    sorted[j] = samples[i];
    ++count;
  }
  return count >= 3 ? sorted[count / 2] : 0;
}

// Compile-time unit fixtures, never used as sensor readings.
namespace EchoFilterTests {
constexpr uint32_t steady[5] = {1210, 1200, 1190, 1205, 1215};
constexpr uint32_t outlier[5] = {1200, 1201, 45000, 1199, 1202};
constexpr uint32_t missing[5] = {0, 1200, 0, 1210, 0};
constexpr uint32_t quorum[5] = {0, 1200, 1210, 1190, 0};
static_assert(medianEcho(steady) == 1205, "sort before selecting median");
static_assert(medianEcho(outlier) == 1201, "reject isolated extreme echo");
static_assert(medianEcho(missing) == 0, "require majority valid echoes");
static_assert(medianEcho(quorum) == 1200, "accept three valid echoes");
}
