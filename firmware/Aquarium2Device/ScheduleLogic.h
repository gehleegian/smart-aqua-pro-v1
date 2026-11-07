#pragma once
#include <stdint.h>
#include <initializer_list>

// Pure schedule logic shared with the host regression tests.
namespace ScheduleLogic {
constexpr int minuteOfDay(const char *text) {
  if (!text || !text[0] || !text[1] || text[2] != ':' ||
      !text[3] || !text[4] || text[5]) return -1;
  for (int i : {0, 1, 3, 4}) if (text[i] < '0' || text[i] > '9') return -1;
  const int hour = (text[0]-'0')*10 + text[1]-'0';
  const int minute = (text[3]-'0')*10 + text[4]-'0';
  return hour < 24 && minute < 60 ? hour*60 + minute : -1;
}
constexpr bool inWindow(int now, int start, int duration) {
  return now >= 0 && now < 1440 && start >= 0 && start < 1440 &&
    duration > 0 && duration <= 1440 && (now-start+1440)%1440 < duration;
}
constexpr int lightDuration(int start, int end) {
  if (start < 0 || end < 0 || start == end) return 0;
  return (end-start+1440)%1440;
}
struct Override {
  bool initialized = false, overridden = false, previous = false;
  int64_t lastBoundary = -1;
  constexpr void reset() { initialized = false; overridden = false; lastBoundary = -1; }
  constexpr bool evaluate(bool scheduled, int64_t boundary) {
    if (!initialized || boundary != lastBoundary) overridden = false;
    initialized = true;
    previous = scheduled;
    lastBoundary = boundary;
    return !overridden;
  }
  constexpr void manual() { if (initialized) overridden = true; }
};
// Absolute minute of most recent daily ON/OFF boundary, including yesterday.
constexpr int64_t latestBoundary(int64_t localMinute, int start, int duration) {
  const int now = int(localMinute % 1440);
  const int end = (start + duration) % 1440;
  const int64_t day = localMinute - now;
  const int64_t on = day + start - (now < start ? 1440 : 0);
  const int64_t off = day + end - (now < end ? 1440 : 0);
  return on > off ? on : off;
}
}
