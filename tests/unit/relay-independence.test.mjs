// Offline control-flow checks, not proof of physical relay/pump operation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const device of [1, 2]) {
  const source = readFileSync(new URL(`../../firmware/Aquarium${device}Device/Aquarium${device}Device.ino`, import.meta.url), 'utf8');
  const LIGHT_PIN = Number(source.match(/LIGHT_PIN = (\d+)/)?.[1]);
  const FILTER_PIN = Number(source.match(/FILTER_PIN = (\d+)/)?.[1]);
  function driver() {
    const body = source.match(/void setOutput\(bool light, bool on\) \{([\s\S]*?)\r?\n\}/)?.[1];
    assert.ok(body);
    const pins = new Map([[LIGHT_PIN, 1], [FILTER_PIN, 1]]);
    const context = { armed: true, lightOn: false, filterOn: false, relayRevision: 0, LIGHT_PIN, FILTER_PIN, LOW: 0, HIGH: 1,
      Serial: { println() {}, printf() {} }, digitalWrite: (pin, value) => pins.set(pin, value) };
    vm.createContext(context);
    vm.runInContext(`function setOutput(light, on) { ${body} }`, context);
    return { context, pins };
  }

  test(`Aquarium ${device}: either manual ON order keeps both relay GPIOs active`, () => {
    for (const order of [[true, false], [false, true]]) {
      const { context, pins } = driver();
      for (const light of order) context.setOutput(light, true);
      assert.equal(context.lightOn, true);
      assert.equal(context.filterOn, true);
      assert.equal(pins.get(LIGHT_PIN), 0);
      assert.equal(pins.get(FILTER_PIN), 0);
      context.setOutput(true, false);
      assert.equal(pins.get(FILTER_PIN), 0, 'light OFF must not switch filter OFF');
      context.setOutput(true, true);
      context.setOutput(false, false);
      assert.equal(pins.get(LIGHT_PIN), 0, 'filter OFF must not switch light OFF');
    }
  });

  test(`Aquarium ${device}: automation evaluates both relays independently in the same poll`, () => {
    const block = source.match(/  if \(lightSchedule\.evaluate[\s\S]*?setOutput\(false, scheduledFilter\);/)?.[0];
    assert.ok(block);
    const { context, pins } = driver();
    Object.assign(context, { scheduledLight: true, scheduledFilter: true, minute: 100,
      on: 80, lightMinutes: 120, start: 80, filterMinutes: 120,
      lightSchedule: { evaluate: () => true }, filterSchedule: { evaluate: () => true },
      ScheduleLogic: { latestBoundary: () => 80 } });
    vm.runInContext(block.replaceAll('ScheduleLogic::', 'ScheduleLogic.'), context);
    assert.equal(pins.get(LIGHT_PIN), 0);
    assert.equal(pins.get(FILTER_PIN), 0);
    // An active manual override for the light must not suppress the filter schedule.
    const second = driver();
    Object.assign(second.context, { scheduledLight: true, scheduledFilter: true, minute: 100,
      on: 80, lightMinutes: 120, start: 80, filterMinutes: 120,
      lightSchedule: { evaluate: () => false }, filterSchedule: { evaluate: () => true },
      ScheduleLogic: { latestBoundary: () => 80 } });
    vm.runInContext(block.replaceAll('ScheduleLogic::', 'ScheduleLogic.'), second.context);
    assert.equal(second.pins.get(LIGHT_PIN), 1);
    assert.equal(second.pins.get(FILTER_PIN), 0);
  });
}
