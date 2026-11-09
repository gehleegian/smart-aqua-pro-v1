// Offline control-flow harness for the actual firmware power publication block.
// No sensor telemetry is written to a live service; this is not hardware proof.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

export function powerPublicationBlock(source) {
  const start = source.indexOf('  // Report the same measured signal');
  const end = source.indexOf('  telemetry["online"]', start);
  assert.ok(start >= 0 && end > start, 'power block must precede online publication');
  return source.slice(start, end).replace(/\r\n/g, '\n').trimEnd();
}

export function firmwarePower(device, options = {}) {
  assert.ok(device === 1 || device === 2);
  const root = new URL(`../../firmware/Aquarium${device}Device/`, import.meta.url);
  const source = readFileSync(new URL(`Aquarium${device}Device.ino`, root), 'utf8');
  const config = readFileSync(new URL('Config.h', root), 'utf8');
  const header = readFileSync(new URL('PowerSignal.h', root), 'utf8').replace(/\r\n/g, '\n');
  assert.match(header, /enum class State \{ Unknown, Absent, Present \}/);
  const states = { Unknown: 0, Absent: 1, Present: 2 };
  const stateNames = (body) => body.replace(/State::(\w+)/g, 'states.$1');
  const classifierBody = header.match(/constexpr State classify\([^)]*\) \{([\s\S]*?)\n\}/)?.[1];
  const labelBody = header.match(/constexpr const char\* label\([^)]*\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(classifierBody && labelBody);
  const classify = Function('states', 'signal', 'off', 'on', 'saturated', stateNames(classifierBody).replace('const float midpoint', 'const midpoint').replace(/\b(\d+(?:\.\d+)?)f\b/g, '$1'));
  const label = Function('states', 'state', stateNames(labelBody));
  const number = (key) => {
    const match = config.match(new RegExp(`constexpr (?:float|int) ${key} = (-?[\\d.]+)f?;`));
    assert.ok(match, `missing ${key}`);
    return Number(match[1]);
  };
  const context = {
    telemetry: {}, POWER_PIN: 33,
    POWER_SENSOR_ANALOG: /POWER_SENSOR_ANALOG = true/.test(config),
    POWER_PRESENT_LEVEL: options.presentLevel ?? number('POWER_PRESENT_LEVEL'),
    measuredPower: classify(states, options.signalV ?? NaN, number('POWER_SIGNAL_OFF_V'), number('POWER_SIGNAL_ON_V'), options.saturated ?? false),
    PowerSignal: { State: states, label: (state) => label(states, state) },
    digitalRead: (pin) => { assert.equal(pin, 33); reads += 1; return options.digitalLevel; },
  };
  let reads = 0;
  const block = powerPublicationBlock(source)
    .replace('PowerSignal::State reportedPower', 'let reportedPower')
    .replaceAll('PowerSignal::State::', 'PowerSignal.State.')
    .replaceAll('PowerSignal::label', 'PowerSignal.label');
  vm.runInNewContext(block, context);
  return { telemetry: context.telemetry, digitalReads: reads };
}
