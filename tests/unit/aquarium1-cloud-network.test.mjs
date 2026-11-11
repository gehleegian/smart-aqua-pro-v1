// Offline HTTP-result/control-flow fixtures only. No live telemetry or commands.
import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { existsSync, readFileSync } from 'node:fs';

const repo = new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const actual = new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url);
for (const [name, path] of [['repository', repo], ...(existsSync(actual) ? [['owner upload', actual]] : [])]) {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const body = fn => source.match(new RegExp(`(?:bool|void) ${fn}\\([^\\n]*\\) \\{([\\s\\S]*?)\\n\\}`))?.[1];
  function context(status, authenticated = true, lightOn = true, filterOn = true) {
    const state = vm.createContext({ armed: true, commandBaseline: true, localStop: false,
      lightOn, filterOn, status, lastAuthHttpStatus: status, configuredControl: { mode: 'manual', automationEnabled: false },
      controlIsObject: true, malformed: false, requests: 0, response: '', HTTP_METHOD_GET: 'GET',
      authenticate: () => authenticated, Serial: { println() {}, printf() {} } });
    state.database = () => { state.requests++; return state.status; };
    state.deserializeJson = () => state.malformed ? 1 : 0;
    for (const [fn, args] of [['pauseCloudForWifiLoss', ''], ['temporaryCloudFailure', 'status'], ['retryCloudWithoutRelayShutdown', 'stage, status']]) {
      assert.ok(body(fn));
      vm.runInContext(`function ${fn}(${args}) { ${body(fn)}\n}`, state);
    }
    return state;
  }
  const cloud = source.slice(source.indexOf('bool cloudCycle()'), source.indexOf('void setup()'));
  const controlPrefix = cloud.slice(cloud.indexOf('{') + 1, cloud.indexOf('  const bool scheduleValid'))
    .replace('String response;', 'let response;').replace('int status = database', 'let status = database')
    .replace('JsonDocument control;', 'const control = configuredControl;')
    .replace('control.is<JsonObject>()', 'controlIsObject')
    .replace('control["automationEnabled"].is<bool>()', '(typeof control["automationEnabled"] === "boolean")')
    .replace(/"\s*\n\s*"/g, '" + "'); // C++ adjacent log string literals
  const commandStart = cloud.search(/  status = database\(\s*"commands\/latest"/);
  assert.ok(commandStart > 0);
  const commandPrefix = cloud.slice(commandStart, cloud.indexOf('  const String commandId'))
    .replace('JsonDocument command;', 'const command = {};');

  test(`Aquarium 1 ${name}: control/command timeouts keep all relay combinations without processing actions`, () => {
    for (const status of [-1, 0, 408, 429, 500, 503, 599])
      for (const light of [true, false]) for (const filter of [true, false])
        for (const prefix of [controlPrefix, commandPrefix]) {
          const state = context(status, true, light, filter);
          assert.equal(vm.runInContext(`(() => { ${prefix} return 'continue'; })()`, state), true);
          assert.equal(state.lightOn, light);
          assert.equal(state.filterOn, filter);
          assert.equal(state.armed, false);
          assert.equal(state.commandBaseline, false);
          assert.equal(state.requests, 1);
        }
  });

  test(`Aquarium 1 ${name}: auth timeouts retry, but denial and malformed data fail closed`, () => {
    for (const status of [-1, 408, 429, 503]) {
      const state = context(status, false);
      assert.equal(vm.runInContext(`(() => { ${controlPrefix} return 'continue'; })()`, state), true);
      assert.equal(state.requests, 0); // no RTDB access using expired/missing credentials
      assert.equal(state.armed, false);
      assert.equal(state.lightOn, true);
    }
    for (const status of [301, 400, 401, 403, 404]) for (const authenticated of [true, false]) {
      const state = context(status, authenticated);
      assert.equal(vm.runInContext(`(() => { ${controlPrefix} return 'continue'; })()`, state), false);
      assert.equal(state.requests, authenticated ? 1 : 0);
    }
    for (const patch of [{ malformed: true }, { controlIsObject: false },
      { configuredControl: { mode: 'invalid', automationEnabled: false } },
      { configuredControl: { mode: 'manual', automationEnabled: 'true' } }]) {
      const state = Object.assign(context(200), patch);
      assert.equal(vm.runInContext(`(() => { ${controlPrefix} return 'continue'; })()`, state), false);
    }
    const ok = context(200);
    assert.equal(vm.runInContext(`(() => { ${controlPrefix} return 'continue'; })()`, ok), 'continue');
    assert.equal(ok.armed, true);
    const auth = source.slice(source.indexOf('bool authenticate()'), source.indexOf('int database('));
    assert.match(auth, /lastAuthHttpStatus = status/);
    assert.ok(auth.indexOf('lastAuthHttpStatus = status') < auth.indexOf('deserializeJson(result, response)'));
    assert.match(auth, /millis\(\) - lastAuthAttempt < 30000/); // cooldown remains; status persists
    const baseline = cloud.slice(cloud.indexOf('if (!commandBaseline)'), cloud.indexOf('} else if (commandId.length()'));
    assert.match(baseline, /lastCommand = commandId/);
    assert.doesNotMatch(baseline, /setOutput|runManualFeed/);
  });

  test(`Aquarium 1 ${name}: version/reset diagnostics distinguish a restart from a cloud pause`, () => {
    assert.match(source, /AQ1 network-hold-v3 \| reset reason=%d/);
    assert.match(source, /esp_reset_reason\(\)/);
    assert.match(source, /AQ1 network-hold-v3 \| uptime=%lu ms/);
    assert.match(source, /Cloud retry: %s HTTP %d/);
  });
}
