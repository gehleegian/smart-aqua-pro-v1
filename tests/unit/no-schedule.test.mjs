// Sprint 5 polish: a tank with no saved schedule shows "No schedule set" and
// never sends the default times to the device as an ENABLED schedule.
// Run: npm run test:schedule
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadTsModule } from '../helpers/loadTsModule.mjs';

const helpers = await loadTsModule(new URL('../../src/utils/monitoringHelpers.ts', import.meta.url));

test('no saved schedule: nothing saved, and the device profile has automation OFF', () => {
  assert.equal(helpers.hasSavedSchedule({}), false);
  assert.equal(helpers.hasSavedSchedule(null), false);
  const settings = helpers.deviceProfileSettings({});
  assert.equal(settings.enabled, false, 'the default times are never run');
  assert.ok(settings.feedingTimes.length > 0, 'well-formed times still go along (RTDB rules require them)');
});

test('a saved schedule is sent as saved; an explicit next schedule wins', () => {
  const saved = { automationSettings: { enabled: true, feedingTimes: ['09:30'], lightOnTime: '07:00', lightOffTime: '19:00', filtrationStartTime: '06:00', filtrationRuntimeHours: 12 } };
  assert.equal(helpers.hasSavedSchedule(saved), true);
  assert.deepEqual(helpers.deviceProfileSettings(saved).feedingTimes, ['09:30']);
  assert.equal(helpers.deviceProfileSettings(saved).enabled, true);
  const next = { ...saved.automationSettings, enabled: false };
  assert.equal(helpers.deviceProfileSettings({}, next), next);
});
