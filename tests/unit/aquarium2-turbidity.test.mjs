import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Offline execution of the actual classifier; no sensor or Firebase writes.
const source = readFileSync(new URL('../../firmware/Aquarium2Device/Aquarium2Device.ino', import.meta.url), 'utf8');
const constants = source.match(/constexpr float CLEAR_V[\s\S]*?(?=#ifndef AQUARIUM_TDS_METER_REFERENCE_ENABLED)/)?.[0];
const routine = source.match(/void updateTurbidity\([\s\S]*?(?=void sampleSensors\(\))/)?.[0];
assert.ok(constants && routine);
const js = (constants + routine)
  .replace(/constexpr float /g, 'globalThis.')
  .replace(/, CLOUDY_V =/g, '; globalThis.CLOUDY_V =')
  .replace('void updateTurbidity(float inputV, bool adcClipped)', 'function updateTurbidity(inputV, adcClipped)')
  .replace(/\b(\d+(?:\.\d+)?)f\b/g, '$1');
function harness() {
  const state = { turbKnown: false, cloudy: false, isfinite: Number.isFinite };
  vm.createContext(state);
  vm.runInContext(js, state);
  return state;
}

test('Aquarium 2 uses medians of the fresh unclipped owner samples, not Aquarium 1 or clipped references', () => {
  const state = harness();
  assert.equal(state.CLEAR_V, 2.340);
  assert.equal(state.CLOUDY_V, 0.283);
  assert.equal(state.TURB_MID_V, (2.340 + 0.283) / 2);
  for (const value of [0.283, 0.282, 0.291]) {
    state.updateTurbidity(value, false);
    assert.equal(state.turbKnown, true);
    assert.equal(state.cloudy, true);
  }
});

test('fresh clear samples label Clear; full-scale raw ADC remains Unknown', () => {
  const state = harness();
  for (const value of [2.343, 2.340, 2.336]) {
    state.updateTurbidity(value, false);
    assert.equal(state.turbKnown, true);
    assert.equal(state.cloudy, false);
  }
  state.updateTurbidity(3.129, true);
  assert.equal(state.turbKnown, false, 'saturation must not be represented as verified clear water');
  assert.match(source, /turbRaw = analogRead\(TURB_PIN\);\s*updateTurbidity\(turbV, turbRaw >= 4095\)/);
  assert.match(source, /ADC CLIPPED: clarity unavailable/);
  assert.doesNotMatch(source, /module approx/);
});

test('invalid/out-of-measurement-range inputs reset state to Unknown without clamping', () => {
  for (const value of [NaN, Infinity, -1, 0, 0.149, 3.0, 3.129, 5]) {
    const state = harness();
    state.updateTurbidity(0.283, false);
    state.updateTurbidity(value, false);
    assert.equal(state.turbKnown, false);
  }
});

test('existing 20mV hysteresis prevents flicker and recovers after invalid input', () => {
  const state = harness();
  state.updateTurbidity(0.283, false);
  state.updateTurbidity(state.TURB_MID_V + 0.01, false);
  assert.equal(state.cloudy, true);
  state.updateTurbidity(state.TURB_MID_V + 0.021, false);
  assert.equal(state.cloudy, false);
  state.updateTurbidity(state.TURB_MID_V - 0.01, false);
  assert.equal(state.cloudy, false);
  state.updateTurbidity(state.TURB_MID_V - 0.021, false);
  assert.equal(state.cloudy, true);
  state.updateTurbidity(3.129, true);
  state.updateTurbidity(0.283, false);
  assert.equal(state.turbKnown, true);
  assert.equal(state.cloudy, true);
});

test('clear -> cloudy -> clear uses fresh classifications without stale state', () => {
  const state = harness();
  for (const [value, expectedCloudy] of [[2.340, false], [0.283, true], [2.336, false]]) {
    state.updateTurbidity(value, false);
    assert.equal(state.turbKnown, true);
    assert.equal(state.cloudy, expectedCloudy);
  }
});

test('classification stays categorical; it does not invent numeric NTU or change Aquarium 1', () => {
  const a = readFileSync(new URL('../../firmware/Aquarium1Device/Aquarium1Device.ino', import.meta.url), 'utf8');
  assert.match(a, /CLEAR_V = 0\.967f, CLOUDY_V = 0\.246f/);
  assert.doesNotMatch(source, /telemetry\["turbidity"\]\s*=/);
  assert.match(source, /telemetry\["turbidityState"\] = turbKnown \? \(cloudy \? "Cloudy" : "Clear"\) : "Unknown"/);
});
