import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFile } from 'node:fs/promises';

// Existing app modules use extensionless local TypeScript imports.
registerHooks({ resolve(specifier, context, nextResolve) {
  try { return nextResolve(specifier, context); }
  catch (error) {
    if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier))
      return nextResolve(`${specifier}.ts`, context);
    throw error;
  }
} });
const web = await import('../../src/types/device.ts');
const webHelpers = await import('../../src/utils/monitoringHelpers.ts');
const mobile = await import('../../../smart-aqua-mobile/src/utils/aquarium-control.ts');
const settings = { enabled: true, feedingTimes: ['08:00', '17:30'],
  lightOnTime: '22:00', lightOffTime: '06:00', filtrationStartTime: '23:00', filtrationRuntimeHours: 4 };
const aquarium = { id: 'aquarium-test', light: 'Off', filter: 'Inactive', feeder: 'Inactive', automationSettings: settings };
const webParser = await import('../../src/utils/deviceTelemetryParser.ts');
const mobileParser = await import('../../../smart-aqua-mobile/src/utils/device-telemetry-parser.ts');

test('scheduled output reports override saved manual values on both clients', () => {
  const now = 1794000000000;
  const fallback = { light: 'Off', filter: 'Inactive', feeder: 'Inactive' };
  const raw = { temperatureC: 25, waterLevelPercent: 80, online: true, updatedAt: now,
    lightState: 'On', filterState: 'Active' };
  for (const [parse, resolve] of [[webParser.normalizeTelemetry, web.getReportedManualStatus],
    [mobileParser.mapTelemetry, mobile.getReportedManualStatus]]) {
    const live = resolve(fallback, parse(raw), now);
    assert.deepEqual(live, { light: 'On', filter: 'Active', feeder: 'Inactive' });
    const displayArgs = { aquariumId: 'aquarium-test', locks: {}, manualStatus: live,
      now, savingManualKey: '' };
    assert.equal(webHelpers.getManualActionDisplay({ ...displayArgs, field: 'light' }).buttonLabel, 'Turn Off Light');
    assert.equal(webHelpers.getManualActionDisplay({ ...displayArgs, field: 'filter' }).buttonLabel, 'Stop Filtration');
    const off = resolve(live, parse({ ...raw, lightState: 'Off', filterState: 'Inactive' }), now);
    assert.deepEqual(off, fallback);
    assert.deepEqual(resolve(fallback, parse(raw), now + 31000), fallback);
    assert.deepEqual(resolve(fallback, parse({ ...raw, online: false }), now), fallback);
    assert.deepEqual(resolve(fallback, parse({ ...raw, lightState: 'bad', filterState: 'bad' }), now), fallback);
    assert.deepEqual(resolve(fallback, null, now), fallback);
    assert.deepEqual(resolve(fallback, parse({ ...raw, lightState: undefined }), now),
      { ...fallback, filter: 'Active' });
  }
});

test('web and mobile send complete identical schedules in either tab', () => {
  for (const mode of ['manual', 'automation']) {
    const a = web.buildDeviceControlProfile({ aquarium, automationSettings: settings, mode });
    const b = mobile.buildDeviceControlProfile(aquarium, mode, settings);
    delete a.updatedAt; delete b.updatedAt;
    assert.deepEqual(a, b);
    assert.equal(a.automationEnabled, true);
    assert.equal(a.lightOnTime, '22:00');
    assert.equal(a.lightOffTime, '06:00');
    assert.equal(a.mode, mode);
  }
});
test('both clients reject incomplete/malformed schedules and ambiguous equal light times', () => {
  for (const changes of [{ lightOnTime: '' }, { lightOffTime: '24:00' },
    { feedingTimes: ['08:75'] }, { lightOnTime: '06:00', lightOffTime: '06:00' },
    { filtrationRuntimeHours: 25 }, { feedingTimes: [] }]) {
    assert.equal(webHelpers.prepareAutomationSettings({ ...settings, ...changes }).settings, null);
    assert.equal(mobile.prepareAutomationSettings({ ...settings, ...changes }).settings, null);
  }
  assert.ok(webHelpers.prepareAutomationSettings(settings).settings);
  assert.ok(mobile.prepareAutomationSettings(settings).settings);
});
test('manual controls route through real command handler in both modes', async () => {
  const view = await readFile(new URL('../../src/components/monitoring/AquariumDetailsView.tsx', import.meta.url), 'utf8');
  assert.match(view, /onClick=\{\(\) => onManualAction\(field\)\}/);
  const hook = await readFile(new URL('../../../smart-aqua-mobile/src/hooks/use-aquarium-control.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(hook, /mode !== 'manual'/);
  assert.match(hook, /await publishDeviceCommand/);
});
