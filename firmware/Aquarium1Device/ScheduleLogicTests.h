#pragma once
#include "ScheduleLogic.h"
// Compile-time regression tests execute the actual schedule implementation.
static_assert(ScheduleLogic::minuteOfDay("23:59") == 1439);
static_assert(ScheduleLogic::minuteOfDay("24:00") == -1);
static_assert(ScheduleLogic::minuteOfDay("8:00") == -1);
static_assert(ScheduleLogic::minuteOfDay("") == -1);
static_assert(ScheduleLogic::minuteOfDay("12:60") == -1);
static_assert(ScheduleLogic::inWindow(360, 360, 960));
static_assert(!ScheduleLogic::inWindow(1320, 360, 960));
static_assert(ScheduleLogic::inWindow(30, 1320, 240)); // overnight
static_assert(!ScheduleLogic::inWindow(120, 1320, 240));
static_assert(ScheduleLogic::inWindow(0, 420, 1440)); // 24-hour filtration
static_assert(ScheduleLogic::lightDuration(1320, 120) == 240);
static_assert(ScheduleLogic::lightDuration(360, 360) == 0);
static_assert([]() constexpr {
  ScheduleLogic::Override state;
  if (!state.evaluate(true, 100)) return false;
  state.manual();
  if (state.evaluate(true, 100)) return false; // polling preserves override
  if (!state.evaluate(false, 200)) return false; // next boundary resumes schedule
  state.manual();
  if (state.evaluate(false, 200)) return false;
  state.reset();
  return state.evaluate(false, 200);
}());
static_assert(ScheduleLogic::latestBoundary(1440+30, 1320, 240) == 1320);
static_assert(ScheduleLogic::latestBoundary(1440+120, 1320, 240) == 1440+120);
// Daily boundary changes even when a 24h filter remains ON across midnight.
static_assert(ScheduleLogic::latestBoundary(1440+420, 420, 1440) == 1440+420);
