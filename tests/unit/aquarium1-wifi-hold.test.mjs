// Offline control-flow tests; no sensor telemetry or equipment commands.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';

const repo = new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const actual = new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url);
for (const [name, path] of [['repository', repo], ...(existsSync(actual) ? [['owner upload', actual]] : [])]) {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const helper = source.match(/void pauseCloudForWifiLoss\(\) \{([\s\S]*?)\n\}/)?.[1];
  test(`Aquarium 1 ${name}: Wi-Fi loss preserves each output independently and pauses remote actions`, () => {
    assert.ok(helper);
    assert.doesNotMatch(helper, /digitalWrite|outputsOff|setOutput|disarm\(|localStop\s*=/);
    for (const lightOn of [true, false]) for (const filterOn of [true, false]) {
      const state = vm.createContext({ armed: true, commandBaseline: true, localStop: false,
        lightOn, filterOn, relayRevision: 7, Serial: { println() {} } });
      vm.runInContext(helper, state);
      vm.runInContext(helper, state); // repeated offline iterations must not change outputs
      assert.equal(state.lightOn, lightOn);
      assert.equal(state.filterOn, filterOn);
      assert.equal(state.relayRevision, 7);
      assert.equal(state.armed, false);
      assert.equal(state.commandBaseline, false);
      assert.equal(state.localStop, false);
    }
  });

  test(`Aquarium 1 ${name}: loss before or during a cloud poll uses hold; hard stops remain`, () => {
    const loop = source.slice(source.indexOf('void loop()'));
    assert.match(loop, /if \(WiFi.status\(\) != WL_CONNECTED\) \{\s*pauseCloudForWifiLoss\(\);/);
    assert.match(loop, /else \{\s*if \(WiFi.status\(\) != WL_CONNECTED\) pauseCloudForWifiLoss\(\);\s*else disarm\(\);/);
    assert.match(loop, /lastWifi = millis\(\);\s*WiFi.reconnect\(\)/);
    const disarm = source.match(/void disarm\(\) \{([\s\S]*?)\n\}/)?.[1];
    assert.match(disarm, /outputsOff\(\);/);
    assert.match(source, /serialLine == "DISARM"[\s\S]*?localStop = true;[\s\S]*?disarm\(\)/);
    const baseline = source.slice(source.indexOf('if (!commandBaseline) {'), source.indexOf('} else if (commandId.length()'));
    assert.match(baseline, /lastCommand = commandId/);
    assert.match(baseline, /commandBaseline = true/);
    assert.match(baseline, /armed = !localStop/);
    assert.doesNotMatch(baseline, /setOutput|runManualFeed|queueCommandAck/);
    // Feeding is not made offline-capable by retaining relay states.
    const feed = source.slice(source.indexOf('bool runManualFeed()'), source.indexOf('void help()'));
    assert.match(feed, /WiFi.status\(\) == WL_CONNECTED/);
    assert.match(feed, /feeder.detach\(\)/);
    const setup = source.slice(source.indexOf('void setup()'), source.indexOf('void loop()'));
    assert.match(setup, /outputsOff\(\)/); // no unsafe boot/power-restoration auto-ON
  });
}
