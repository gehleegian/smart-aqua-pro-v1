import assert from 'node:assert/strict';
import test from 'node:test';
import { nextScheduledText, upcomingEvents, validateSchedule } from '../../src/utils/schedule.ts';

const base = { feedingTimes: ['08:00', '18:00'], lightOnTime: '07:00', lightOffTime: '20:00', filtrationStartTime: '06:00', filtrationRuntimeHours: 12 };
// 2026-11-07 15:30 in Manila = 07:30 UTC.
const NOW = Date.UTC(2026, 10, 7, 7, 30);

test('a valid schedule has no errors', () => {
  assert.deepEqual(validateSchedule(base), []);
});

test('feeding times closer than 30 minutes are refused, including across midnight', () => {
  assert.match(validateSchedule({ ...base, feedingTimes: ['08:00', '08:20'] })[0], /08:00 and 08:20 are less than 30 minutes apart/);
  assert.match(validateSchedule({ ...base, feedingTimes: ['23:50', '00:10'] })[0], /less than 30 minutes apart/);
  assert.deepEqual(validateSchedule({ ...base, feedingTimes: ['08:00', '08:30'] }), []);
});

test('runtime 1–24 h, HH:mm only, both light times or neither', () => {
  assert.ok(validateSchedule({ ...base, filtrationRuntimeHours: 0 }).some((e) => /1–24 hours/.test(e)));
  assert.ok(validateSchedule({ ...base, filtrationRuntimeHours: 25 }).some((e) => /1–24 hours/.test(e)));
  assert.ok(validateSchedule({ ...base, feedingTimes: ['8am'] }).some((e) => /HH:mm/.test(e)));
  assert.ok(validateSchedule({ ...base, lightOffTime: '' }).some((e) => /both/.test(e)));
  assert.ok(validateSchedule({ ...base, lightOffTime: '07:00' }).some((e) => /same time/.test(e)));
  assert.ok(validateSchedule({ ...base, feedingTimes: [] }).some((e) => /at least one/.test(e)));
});

test('next scheduled is computed in Asia/Manila time', () => {
  assert.equal(nextScheduledText(base, NOW), 'Next scheduled: Feed at 18:00, Light off at 20:00');
  // 21:00 Manila: next feed is tomorrow 08:00, next light change tomorrow 07:00.
  assert.equal(nextScheduledText(base, Date.UTC(2026, 10, 7, 13, 0)), 'Next scheduled: Light on at 07:00, Feed at 08:00');
  const events = upcomingEvents(base, NOW);
  assert.deepEqual(events.map((e) => `${e.kind}@${e.time}`), ['feed@18:00', 'filter_off@18:00', 'light_off@20:00', 'filter_on@06:00', 'light_on@07:00', 'feed@08:00']);
  assert.equal(new Date(events[0].at).toISOString(), '2026-11-07T10:00:00.000Z');
});
