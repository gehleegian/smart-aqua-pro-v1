// Offline HTTP-result/control-flow checks only; no telemetry or equipment writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';

const repo = new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const actual = new URL('../../../Aquarium1Device/Aquarium1Device.ino', import.meta.url);
const paths = [repo, ...(existsSync(actual) ? [actual] : [])];

for (const path of paths) {
  const source = readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
  const name = path === repo ? 'repository' : 'owner upload';
  test(`Aquarium 1 ${name}: transient telemetry errors retain controls and pending sample`, () => {
    // Execute the firmware's actual HTTP-result branch (valid in JS as well as C++).
    const tail = source.match(/  if \(status == 200\) telemetrySamplePending = false;[\s\S]*?return status == 200;/)?.[0];
    assert.ok(tail);
    const evaluate = new Function('status', `let telemetrySamplePending = true;
      const Serial = { println() {} };
      const result = (() => { ${tail} })();
      return { result, telemetrySamplePending };`);
    assert.deepEqual(evaluate(200), { result: true, telemetrySamplePending: false });
    for (const status of [-1, 0, 408, 429, 500, 503, 599])
      assert.deepEqual(evaluate(status), { result: true, telemetrySamplePending: true });
    for (const status of [201, 301, 400, 401, 403, 404, 409, 422, 600])
      assert.deepEqual(evaluate(status), { result: false, telemetrySamplePending: true });
  });

  test(`Aquarium 1 ${name}: control failures, local stop and replay protections remain`, () => {
    const cloud = source.slice(source.indexOf('bool cloudCycle()'), source.indexOf('void setup()'));
    assert.match(cloud, /if \(!authenticate\(\)\)\s*\{?\s*return retryCloudWithoutRelayShutdown\("authentication", lastAuthHttpStatus\)/);
    assert.match(cloud, /Control unavailable[\s\S]*?return false;/);
    assert.match(cloud, /Invalid control profile[\s\S]*?return false;/);
    assert.match(cloud, /Command access failed[\s\S]*?return false;/);
    assert.match(cloud, /armed = !localStop/);
    assert.match(cloud, /requestedMs <= commandWatermarkMs/);
    assert.match(cloud, /flushCommandAck\(commandId\)/);
    assert.match(source, /WiFi.status\(\) != WL_CONNECTED[\s\S]*?pauseCloudForWifiLoss\(\)/);
    assert.match(source, /serialLine == "DISARM"[\s\S]*?localStop = true;[\s\S]*?disarm\(\)/);
    assert.match(source, /if \(cloudCycle\(\)\)[\s\S]*?else \{\s*if \(WiFi.status\(\) != WL_CONNECTED\) pauseCloudForWifiLoss\(\);\s*else disarm\(\)/);
  });
}
