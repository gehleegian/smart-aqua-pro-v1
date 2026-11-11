// Actual sketch routines exercised offline. No live commands or sensor telemetry.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import vm from 'node:vm';

const aq2 = readFileSync(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8');
const body = (source, name) => source.match(new RegExp(`(?:void|bool) ${name}\\([^\\n]*\\) \\{([\\s\\S]*?)\\r?\\n\\}`))?.[1];
for (const [name, path] of [
  ['repository', new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url)],
  ['owner upload', new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url)],
]) {
  if (!existsSync(path)) continue;
  const source = readFileSync(path, 'utf8');
  test(`${name}: ACK serialization/retry is identical to Aquarium 2 and runs before sensor gating`, () => {
    for (const routine of ['queueCommandAck', 'flushCommandAck'])
      assert.equal(body(source, routine).replaceAll('\r\n', '\n'), body(aq2, routine).replaceAll('\r\n', '\n'));
    const cloud = source.slice(source.indexOf('bool cloudCycle()'), source.indexOf('void setup()'));
    assert.ok(cloud.indexOf('flushCommandAck(commandId)') < cloud.indexOf('if (!telemetrySamplePending) return true;'));
    assert.ok(cloud.indexOf('flushCommandAck(commandId)') < cloud.indexOf('sampleSensorsIfDue()'));
    assert.match(cloud, /completed = setOutput\(true, state == "On"\)/);
    assert.match(cloud, /completed = setOutput\(false, state == "Active"\)/);
    assert.match(cloud, /completed = runManualFeed\(\)/);
    assert.match(cloud, /failure = "malformed or mismatched command"/);
    assert.match(cloud, /failure = "old, replayed, or future command"/);
    assert.match(cloud, /if \(validCommandId\(commandId\)\) \{[\s\S]*?queueCommandAck\(commandId, completed, failure\)/);
    const baseline = cloud.slice(cloud.indexOf('  if (!commandBaseline)'), cloud.indexOf('} else if ('));
    assert.doesNotMatch(baseline, /queueCommandAck|runManualFeed|setOutput/);
    assert.match(source, /FULL_CM = 22\.4134f/);
    assert.match(source, /SENSOR_READ_INTERVAL_MS = 10000/);
    assert.match(source, /#include "LoadCompensation.h"/);
  });

  function feederHarness(options = {}) {
    let now = 10000, waits = 0, wifi = 3;
    const writes = [];
    const state = vm.createContext({
      FEEDER_TEST_ENABLED: options.enabled ?? true, armed: options.armed ?? true, localStop: false,
      feedCompleted: options.cooldown ?? false, lastFeedEnd: 9000, lastFeedSucceeded: true,
      FEEDER_COOLDOWN_MS: 5000, FEEDER_HOLD_MS: 1500, FEEDER_TRAVEL_MS: 300,
      FEEDER_HOME_DEG: 135, FEEDER_DISPENSE_DEG: 45, SERVO_PIN: 15, OUTPUT: 1, LOW: 0, WL_CONNECTED: 3,
      WiFi: { status: () => wifi }, Serial: { println() {} }, pinMode() {}, digitalWrite() {},
      feeder: { setPeriodHertz() {}, attach() {}, attached: () => options.attach !== false,
        write: angle => writes.push(angle), detach() {} },
      millis: () => now, delay: ms => { now += ms; },
      responsiveWait: ms => {
        now += ms;
        ++waits;
        if (options.wifiDrop && waits === 2) wifi = 0;
        if (options.wifiDrop && waits === 3) wifi = 3;
      },
      serialCommands: () => { if (options.stop) { state.localStop = true; state.armed = false; } },
    });
    const routine = body(source, 'runManualFeed').replace(/const uint32_t/g, 'const')
      .replace(/bool (feedDwellCompleted|sequenceOk)/g, 'let $1');
    assert.ok(routine);
    vm.runInContext(`function runManualFeed() { ${routine} }`, state);
    state.runManualFeed();
    return { state, writes };
  }

  test(`${name}: feed reports software completion only after existing home/dispense/home cycle`, () => {
    const { state, writes } = feederHarness();
    assert.deepEqual(writes, [135, 45, 135]);
    assert.equal(state.lastFeedSucceeded, true);
    assert.equal(state.feedCompleted, true);
  });

  test(`${name}: disabled, disarmed, cooldown and attach failure cannot reuse an earlier done result`, () => {
    for (const options of [{ enabled: false }, { armed: false }, { cooldown: true }, { attach: false }]) {
      const { state, writes } = feederHarness(options);
      assert.equal(state.lastFeedSucceeded, false);
      assert.deepEqual(writes, []);
    }
  });

  test(`${name}: stop or Wi-Fi interruption is failed even if Wi-Fi recovers during return travel`, () => {
    for (const options of [{ stop: true }, { wifiDrop: true }]) {
      const { state, writes } = feederHarness(options);
      assert.equal(state.lastFeedSucceeded, false);
      assert.deepEqual(writes, [135, 45, 135]);
    }
  });
}
