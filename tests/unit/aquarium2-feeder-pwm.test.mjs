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
    const params = { stopFeederPwm: '', feederDuty: 'pulseUs', feederTimingValid: '', feederCalibrationReady: '', waitFeederMs: 'duration',
      writeFeederPulse: 'pulseUs, phase', runFeederTimed: 'pulseUs, duration, phase', runManualFeed: '' };
    assert.ok(Object.hasOwn(params, name));
    return `function ${name}(${params[name]}) {`;
  })
  .replace(/const (?:uint32_t|bool) /g, 'const ')
  .replace(/bool (pwmOk|ok)/g, 'let $1')
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
    ledcWrite: (pin, duty) => { events.push(['write', pin, duty, now]); ticks = duty; return options.write !== false; },
    ledcRead: () => { events.push(['read']); return options.duty ?? ticks; },
    ledcReadFreq: () => options.hz ?? 50,
    ledcDetach: pin => { events.push(['detach', pin]); return true; },
    digitalWrite: (...args) => events.push(['digital', ...args]),
    pinMode: (...args) => events.push(['mode', ...args]),
    responsiveWait: ms => { events.push(['wait', ms]); now += ms; options.afterWait?.(state, ms); },
    serialCommands: () => { options.onSerial?.(state); },
    delay: ms => { now += ms; options.afterDelay?.(state, now); },
    millis: () => now,
  };
  for (const [, name, value] of config.matchAll(/constexpr (?:bool|int|uint32_t) (FEEDER_\w+) = (true|false|\d+)/g)) {
    state[name] = value === 'true' ? true : value === 'false' ? false : Number(value);
  }
  if (options.calibrated) Object.assign(state, { FEEDER_CALIBRATED: true, FEEDER_FORWARD_MS: 120, FEEDER_REVERSE_MS: 140 });
  vm.createContext(state);
  // Integer division in feederDuty is explicit here to match the C++ routine.
  vm.runInContext(routines, state);
  const duty = state.feederDuty;
  state.feederDuty = degrees => Math.floor(duty(degrees));
  return { state, events };
}

test('continuous SG90 uses speed/neutral pulses, not Aquarium 1 position angles', () => {
  const { state } = harness();
  const reference = readFileSync(new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url), 'utf8');
  assert.match(reference, /feeder\.attach\(SERVO_PIN, 500, 2500\)/);
  const referenceConfig = readFileSync(new URL('../../firmware/Aquarium1Device/FeederConfig.h', import.meta.url), 'utf8');
  for (const setting of ['COOLDOWN_MS']) {
    assert.equal(config.match(new RegExp(`FEEDER_${setting} = (\\d+)`))?.[1],
      referenceConfig.match(new RegExp(`FEEDER_${setting} = (\\d+)`))?.[1]);
  }
  assert.equal(state.FEEDER_CALIBRATED, false);
  assert.equal(state.FEEDER_HOLD_MS, 1000);
  assert.match(referenceConfig, /FEEDER_HOLD_MS = 1500/, 'Aquarium 1 dwell is unchanged');
  assert.equal(state.feederDuty(1500), 4915);
  assert.equal(state.feederDuty(1600), 5243);
  assert.equal(state.feederDuty(1400), 4588);
  assert.doesNotMatch(config, /FEEDER_HOME_DEG|FEEDER_DISPENSE_DEG/);
  assert.match(referenceConfig, /FEEDER_HOME_DEG = 135/);
  assert.match(referenceConfig, /FEEDER_DISPENSE_DEG = 45/);
});

test('failed PWM attachment never emits movement pulses or reports checked sequence', () => {
  const { state, events } = harness({ attach: false });
  state.runManualFeed();
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
    state.runManualFeed();
    assert.equal(events.filter(e => e[0] === 'write').length, 1);
    assert.ok(events.some(e => e[0] === 'detach'));
    assert.ok(events.some(e => e[0] === 'log' && e[1].startsWith('Feed aborted')));
    assert.equal(state.feederPwmAttached, false);
    assert.equal(state.feedCompleted, true, 'apply cooldown even after an attempted cycle fails');
  });
}

test('website return test preserves the observed forward turn and reverses after a neutral hold', () => {
  const { state, events } = harness();
  state.runManualFeed();
  const writes = events.filter(e => e[0] === 'write');
  assert.deepEqual(writes.map(e => e[2]), [4915, 5243, 4915, 4588, 4915]);
  assert.equal(writes[2][3] - writes[1][3], 900, 'PWM settling is included in the bounded jog');
  assert.equal(writes[3][3] - writes[2][3], 40 + 1000);
  assert.equal(writes[4][3] - writes[3][3], 900);
  assert.ok(events.some(e => e[0] === 'log' && String(e[1]).startsWith('CALIBRATION:') && e[2] === 900 && e[4] === 900));
  assert.deepEqual(events.find(e => e[0] === 'attach'), ['attach', 23, 50, 16]);
  assert.ok(events.some(e => e[0] === 'log' && e[1].includes('NOT a verified feeding cycle')));
  assert.ok(events.some(e => e[0] === 'log' && e[1].includes('angle, physical stop and return NOT verified')));
  assert.equal(state.feederPwmAttached, false);
  assert.equal(state.feedCompleted, true);
  assert.ok(!events.some(e => e[0] === 'digital' && [16, 17].includes(e[1])), 'feeder never operates either relay');
  const attaches = events.filter(e => e[0] === 'attach').length;
  state.runManualFeed();
  assert.equal(events.filter(e => e[0] === 'attach').length, attaches, 'cooldown rejects repeated feed');
});

test('disabling return-test mode retains a single bounded jog without automatic return', () => {
  const { state, events } = harness();
  state.FEEDER_RETURN_TEST_ENABLED = false;
  state.runManualFeed();
  assert.deepEqual(events.filter(e => e[0] === 'write').map(e => e[2]), [4915, 5243, 4915]);
});

test('manual round-trip testing does not enable automatic feeding', () => {
  const { state, events } = harness();
  assert.equal(state.feederTimingValid(), true);
  assert.equal(state.feederCalibrationReady(), false);
  state.runManualFeed();
  assert.equal(state.FEEDER_CALIBRATED, false);
  assert.ok(events.some(e => e[0] === 'write' && e[2] === 4588));
});

test('uncalibrated return test rejects an invalid return time before attaching PWM', () => {
  const { state, events } = harness();
  state.FEEDER_REVERSE_MS = 0;
  state.runManualFeed();
  assert.ok(!events.some(e => e[0] === 'attach'));
  assert.ok(!events.some(e => e[0] === 'write'));
});

test('Wi-Fi loss during the return disables PWM without retrying the cycle', () => {
  const { state, events } = harness({ afterDelay: (s, now) => {
    if (now >= 12500) s.WiFi.status = () => 0;
  } });
  state.runManualFeed();
  assert.deepEqual(events.filter(e => e[0] === 'write').map(e => e[2]), [4915, 5243, 4915, 4588]);
  assert.equal(state.feederPwmAttached, false);
  assert.equal(state.feedCompleted, true);
  assert.equal(events.filter(e => e[0] === 'attach').length, 1);
});

test('stop during neutral hold aborts without a return pulse', () => {
  const { state, events } = harness({ afterDelay: (s, now) => {
    if (now >= 11000) { s.localStop = true; s.armed = false; s.stopFeederPwm(); }
  } });
  state.runManualFeed();
  assert.deepEqual(events.filter(e => e[0] === 'write').map(e => e[2]), [4915, 5243, 4915]);
  assert.equal(state.feederPwmAttached, false);
});

test('disarmed, local stop, or Wi-Fi loss blocks pulse writes', () => {
  for (const condition of ['armed', 'localStop', 'wifi']) {
    const { state, events } = harness(condition === 'wifi' ? { wifi: 0 } : {});
    state.feederPwmAttached = true;
    if (condition === 'armed') state.armed = false;
    if (condition === 'localStop') state.localStop = true;
    assert.equal(state.writeFeederPulse(1600, 'test'), false);
    assert.ok(!events.some(e => e[0] === 'write'));
  }
  assert.match(source, /void disarm\(\) \{[^}]*stopFeederPwm\(\);/);
});

test('stop during PWM settling aborts without any drive or return pulse', () => {
  const { state, events } = harness({ onSerial: s => {
    s.armed = false;
    s.localStop = true;
    s.stopFeederPwm();
  } });
  state.runManualFeed();
  assert.equal(events.filter(e => e[0] === 'write').length, 1);
  assert.ok(events.some(e => e[0] === 'log' && e[1].startsWith('Feed aborted')));
  assert.equal(state.feederPwmAttached, false);
});

test('calibrated cycle stops during the entire hold and performs a bounded timed return', () => {
  const { state, events } = harness({ calibrated: true });
  state.runManualFeed();
  const writes = events.filter(e => e[0] === 'write');
  assert.deepEqual(writes.map(e => e[2]), [4915, 5243, 4915, 4588, 4915]);
  assert.equal(writes[2][3] - writes[1][3], 120);
  assert.equal(writes[3][3] - writes[2][3], 40 + 1000, 'neutral PWM, not rotation, during dwell');
  assert.equal(writes[4][3] - writes[3][3], 140);
  assert.equal(state.feederPwmAttached, false);
});

test('unmeasured, unsafe, or same-direction calibration cannot start a normal cycle', () => {
  for (const patch of [{ FEEDER_FORWARD_MS: 0 }, { FEEDER_REVERSE_MS: 1001 },
    { FEEDER_STOP_US: 2100 }, { FEEDER_REVERSE_US: 1700 }]) {
    const { state, events } = harness({ calibrated: true });
    Object.assign(state, patch);
    state.runManualFeed();
    assert.equal(state.feederCalibrationReady(), false);
    assert.ok(!events.some(e => e[0] === 'attach'));
  }
});

test('Wi-Fi loss mid-jog aborts immediately with no reverse or hold', () => {
  const { state, events } = harness({ afterDelay: (s, now) => {
    if (now >= 10060) s.WiFi.status = () => 0;
  } });
  state.runManualFeed();
  assert.deepEqual(events.filter(e => e[0] === 'write').map(e => e[2]), [4915, 5243]);
  assert.equal(state.feederPwmAttached, false);
});

test('automated feed is gated before schedule reservation while uncalibrated', () => {
  const schedule = source.slice(source.indexOf('void applyScheduledFeed('), source.indexOf('bool cloudCycle()'));
  assert.ok(schedule.indexOf('if (!feederCalibrationReady()) return') < schedule.indexOf('scheduleStore.putLong64'));
  assert.ok(schedule.indexOf('if (!feederCalibrationReady()) return') < schedule.indexOf('runManualFeed()'));
});
