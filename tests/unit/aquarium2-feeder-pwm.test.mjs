import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual firmware routines with stubbed driver calls. These are
// control-flow tests, not simulated sensor telemetry or physical verification.
const source = readFileSync(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const config = readFileSync(new URL('../../firmware/Aquarium2Device/FeederConfig.h', import.meta.url), 'utf8');
const routines = source.slice(source.indexOf('void stopFeederPwm()'), source.indexOf('\nvoid help()'))
  .replace(/(?:void|bool|uint32_t) (\w+)\([^)]*\) \{/g, (match, name) => {
    const params = { stopFeederPwm: '', feederDuty: 'degrees', writeFeederPosition: 'degrees, phase', runManualFeed: '' };
    assert.ok(Object.hasOwn(params, name));
    return `function ${name}(${params[name]}) {`;
  })
  .replace(/const (?:uint32_t|bool) /g, 'const ')
  .replace(/bool pwmOk/g, 'let pwmOk')
  .replace(/uint32_t\(degrees\)/g, 'Math.trunc(degrees)')
  .replace(/\(unsigned long\)/g, '')
  .replace(/(\d)U\b/g, '$1');

function harness(options = {}) {
  const events = [];
  let ticks = 0;
  let now = 10000;
  const state = {
    SERVO_PIN: 23, LOW: 0, OUTPUT: 1, WL_CONNECTED: 3,
    armed: true, localStop: false, feederPwmAttached: false,
    feedCompleted: false, lastFeedEnd: 0,
    WiFi: { status: () => options.wifi ?? 3 },
    Serial: { println: text => events.push(['log', text]), printf: (...args) => events.push(['log', ...args]) },
    ledcAttach: (...args) => { events.push(['attach', ...args]); return options.attach !== false; },
    ledcWrite: (pin, duty) => { events.push(['write', pin, duty]); ticks = duty; return options.write !== false; },
    ledcRead: () => { events.push(['read']); return options.duty ?? ticks; },
    ledcReadFreq: () => options.hz ?? 50,
    ledcDetach: pin => { events.push(['detach', pin]); return true; },
    digitalWrite: (...args) => events.push(['digital', ...args]),
    pinMode: (...args) => events.push(['mode', ...args]),
    responsiveWait: ms => { events.push(['wait', ms]); now += ms; options.afterWait?.(state, ms); },
    serialCommands: () => {},
    delay: ms => { now += ms; },
    millis: () => now,
  };
  for (const [, name, value] of config.matchAll(/constexpr (?:bool|int|uint32_t) (FEEDER_\w+) = (true|false|\d+)/g)) {
    state[name] = value === 'true' ? true : value === 'false' ? false : Number(value);
  }
  vm.createContext(state);
  // Integer division in feederDuty is explicit here to match the C++ routine.
  vm.runInContext(routines, state);
  const duty = state.feederDuty;
  state.feederDuty = degrees => Math.floor(duty(degrees));
  return { state, events };
}

test('SG90 home/dispense preserve 1750/1250us targets with 16-bit ticks', () => {
  const { state } = harness();
  assert.equal(state.feederDuty(135), 5734);
  assert.equal(state.feederDuty(45), 4096);
});

test('failed PWM attachment never emits movement pulses or reports checked sequence', () => {
  const { state, events } = harness({ attach: false });
  assert.equal(state.runManualFeed(), false);
  assert.ok(events.some(e => e[0] === 'log' && e[1].includes('attach failed')));
  assert.ok(!events.some(e => e[0] === 'write'));
  assert.equal(state.feederPwmAttached, false);
});

for (const [name, options] of [
  ['failed write', { write: false }],
  ['wrong frequency', { hz: 100 }],
  ['wrong duty', { duty: 0 }],
]) {
  test(`${name} aborts, detaches PWM, and does not dispense`, () => {
    const { state, events } = harness(options);
    assert.equal(state.runManualFeed(), false);
    assert.equal(events.filter(e => e[0] === 'write').length, 1);
    assert.ok(events.some(e => e[0] === 'detach'));
    assert.ok(events.some(e => e[0] === 'log' && e[1].startsWith('Feed aborted')));
    assert.equal(state.feederPwmAttached, false);
    assert.equal(state.feedCompleted, true, 'apply cooldown even after an attempted cycle fails');
  });
}

test('successful driver sequence is home, dispense, return with delayed readback and cleanup', () => {
  const { state, events } = harness();
  assert.equal(state.runManualFeed(), true);
  assert.deepEqual(events.filter(e => e[0] === 'write').map(e => e[2]), [5734, 4096, 5734]);
  assert.deepEqual(events.find(e => e[0] === 'attach'), ['attach', 23, 50, 16]);
  const firstRead = events.findIndex(e => e[0] === 'read');
  assert.deepEqual(events[firstRead - 1], ['wait', 40]);
  assert.ok(events.some(e => e[0] === 'log' && e[1] === 'Feed PWM sequence checked; mechanical movement NOT verified.'));
  assert.equal(state.feederPwmAttached, false);
  assert.equal(state.feedCompleted, true);
  assert.ok(!events.some(e => e[0] === 'digital' && [16, 17].includes(e[1])), 'feeder never operates either relay');
  const attaches = events.filter(e => e[0] === 'attach').length;
  assert.equal(state.runManualFeed(), false);
  assert.equal(events.filter(e => e[0] === 'attach').length, attaches, 'cooldown rejects repeated feed');
});

test('disarmed, local stop, or Wi-Fi loss blocks pulse writes', () => {
  for (const condition of ['armed', 'localStop', 'wifi']) {
    const { state, events } = harness(condition === 'wifi' ? { wifi: 0 } : {});
    state.feederPwmAttached = true;
    if (condition === 'armed') state.armed = false;
    if (condition === 'localStop') state.localStop = true;
    assert.equal(state.writeFeederPosition(135, 'test'), false);
    assert.ok(!events.some(e => e[0] === 'write'));
  }
  assert.match(source, /void disarm\(\) \{[^}]*stopFeederPwm\(\);/);
});

test('stop during PWM settling aborts without dispense or return pulse', () => {
  const { state, events } = harness({ afterWait: s => {
    s.armed = false;
    s.localStop = true;
    s.stopFeederPwm();
  } });
  assert.equal(state.runManualFeed(), false);
  assert.equal(events.filter(e => e[0] === 'write').length, 1);
  assert.ok(events.some(e => e[0] === 'log' && e[1].startsWith('Feed aborted')));
  assert.equal(state.feederPwmAttached, false);
});
