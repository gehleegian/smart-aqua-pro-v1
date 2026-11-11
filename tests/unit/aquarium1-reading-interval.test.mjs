// Offline timing/control tests only. Never publish or generate sensor telemetry.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const repo = new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const actual = new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const sources = [['repository', repo], ...(existsSync(actual) ? [['owner upload sketch', actual]] : [])];

for (const [name, path] of sources) {
  const source = readFileSync(path, 'utf8');
  const interval = Number(source.match(/SENSOR_READ_INTERVAL_MS\s*=\s*(\d+)/)?.[1]);
  const helper = source.match(/void sampleSensorsIfDue\(\) \{([\s\S]*?)\n\}/)?.[1];

  test(`${name}: first sample is immediate; loop/cloud share a non-blocking 10-second batch timer`, () => {
    assert.equal(interval, 10000);
    assert.ok(helper);
    assert.doesNotMatch(helper, /delay\(|responsiveWait\(/);
    let now = 1, batches = 0;
    const state = vm.createContext({ lastSample: 0, telemetrySamplePending: false,
      SENSOR_READ_INTERVAL_MS: interval, millis: () => now,
      sampleSensors: () => { batches++; now += 2500; } });
    const due = () => vm.runInContext(helper, state);
    due();
    assert.equal(batches, 1);
    assert.equal(state.lastSample, 2501);
    assert.equal(state.telemetrySamplePending, true);
    state.telemetrySamplePending = false;
    for (const elapsed of [0, 1, 3000, 9999]) {
      now = 2501 + elapsed;
      due(); // loop
      due(); // cloud path cannot bypass the same timer
      assert.equal(batches, 1);
      assert.equal(state.telemetrySamplePending, false);
    }
    now = 12501;
    due();
    assert.equal(batches, 2);
    assert.equal(state.lastSample, 15001);
    assert.equal(state.telemetrySamplePending, true);
    due();
    assert.equal(batches, 2);
  });

  test(`${name}: controls run before pending-sample guard; failed uploads retain retry`, () => {
    const cloud = source.slice(source.indexOf('bool cloudCycle()'), source.indexOf('void setup()'));
    const loop = source.slice(source.indexOf('void loop()'));
    const guard = cloud.indexOf('if (!telemetrySamplePending) return true;');
    assert.ok(guard > cloud.indexOf('applyScheduledFeed(control)'));
    assert.ok(guard > cloud.indexOf('setOutput(true, state == "On")'));
    assert.ok(guard < cloud.indexOf('JsonDocument telemetry;'));
    assert.match(cloud, /if \(status == 200\) telemetrySamplePending = false;/);
    const commit = cloud.match(/if \(status == 200\) telemetrySamplePending = false;/)[0];
    for (const status of [-1, 401, 500, 200]) {
      const pending = vm.createContext({ status, telemetrySamplePending: true });
      vm.runInContext(commit, pending);
      assert.equal(pending.telemetrySamplePending, status !== 200);
    }
    assert.match(cloud, /telemetry\["updatedAt"\]\["\.sv"\] = "timestamp"/);
    assert.equal((source.match(/sampleSensors\(\);/g) ?? []).length, name === 'repository' ? 1 : 2,
      'only the timer calls sampling; owner sketch additionally has its forward declaration');
    assert.match(loop, /serialCommands\(\);\s*sampleSensorsIfDue\(\);/);
    assert.match(loop, /cloudDelayMs = 3000/);
    assert.match(loop, /WiFi\.status\(\) != WL_CONNECTED/);
    assert.match(source, /EMPTY_CM = 27\.0f/);
    assert.match(source, /FULL_CM = 22\.4134f/);
  });
}
