import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

for (const aquarium of [1, 2]) {
  const source = readFileSync(new URL(`../../firmware/Aquarium${aquarium}Device/Aquarium${aquarium}Device.ino`, import.meta.url), 'utf8');
  test(`Aquarium ${aquarium}: failed probe recovery is independent and rate-limited`, () => {
    const helper = source.slice(source.indexOf('void recoverTemperatureProbe('), source.indexOf('float fitPH('));
    assert.match(helper, /probe\.getDeviceCount\(\) != 1/);
    assert.match(helper, /sampleAt != 0 && !validTemperature\(previousReading\)/);
    assert.match(helper, /if \(!needsRecovery \|\| now - retryAt < 10000UL\) return/);
    assert.match(helper, /retryAt = now;[\s\S]*probe\.begin\(\);[\s\S]*probe\.setResolution\(12\);[\s\S]*probe\.setWaitForConversion\(false\)/);
    assert.doesNotMatch(helper, /digitalWrite|setOutput|outputsOff|feeder\.|requestTemperatures|temperatureC/);
  });
  test(`Aquarium ${aquarium}: rescan precedes a fresh conversion; validity is never forced`, () => {
    const sample = source.slice(source.indexOf('void sampleSensors() {'), source.indexOf('// HTTPS uses'));
    assert.match(sample, /recoverTemperatureProbe\(temp18, 18, t18, temp18RetryAt\)/);
    assert.match(sample, /recoverTemperatureProbe\(temp19, 19, t19, temp19RetryAt\)/);
    assert.match(sample, /recoverTemperatureProbe\(temp19[^;]+;\s*temp18\.requestTemperatures\(\);\s*temp19\.requestTemperatures\(\);\s*responsiveWait\(800\);\s*t18 = temp18\.getTempCByIndex\(0\);\s*t19 = temp19\.getTempCByIndex\(0\)/);
    assert.match(sample, /temperaturesValid = ok18 && ok19/);
  });
}
