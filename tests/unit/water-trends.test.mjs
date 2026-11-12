import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { summarizeWaterTrend, describeWaterTrend } from '../../src/utils/waterTrends.ts';

// Offline arithmetic fixtures only. No telemetry or database records are produced.
const points = values => values.map((value, index) => ({ at: index * 60_000, value, valid: true }));

test('describes increasing and decreasing samples without claiming steady rates', () => {
  const up = summarizeWaterTrend(points([100, 100, 120]));
  assert.equal(up.pattern, 'rose');
  assert.equal(up.change, 20);
  assert.match(describeWaterTrend(up, 'ppm'), /Last sample higher by 20 ppm/);
  assert.equal(summarizeWaterTrend(points([120, 110, 100])).pattern, 'fell');
  assert.match(describeWaterTrend(summarizeWaterTrend(points([120, 100])), 'ppm'), /lower by 20 ppm/);
});

test('a high followed by the starting value is varied, not stable or confirmed recovery', () => {
  const trend = summarizeWaterTrend(points([150, 300, 150]));
  assert.equal(trend.pattern, 'varied');
  assert.equal(trend.change, 0);
  assert.match(describeWaterTrend(trend, 'ppm'), /First and last samples equal.*Readings rose and fell.*Earlier high: 300 ppm/);
  assert.doesNotMatch(describeWaterTrend(trend, 'ppm'), /recovered|normal|fault|stable|clean now/i);
});

test('an intermediate low is retained even when endpoints match', () => {
  const trend = summarizeWaterTrend(points([8, 7, 8]));
  assert.match(describeWaterTrend(trend), /Earlier low: 7/);
});

test('equal available samples are described without extrapolating between samples', () => {
  assert.equal(summarizeWaterTrend(points([8, 8, 8])).pattern, 'unchanged');
  assert.match(describeWaterTrend(summarizeWaterTrend(points([8, 8]))), /All available sample values equal/);
});

test('empty and single-sample periods cannot establish a trend', () => {
  for (const rows of [[], points([150])]) {
    const trend = summarizeWaterTrend(rows);
    assert.equal(trend.pattern, 'insufficient');
    assert.equal(trend.change, null);
    assert.equal(trend.maxGapMs, null);
    assert.match(describeWaterTrend(trend), /Not enough distinct valid samples/);
  }
});

test('invalid, missing, non-finite, and unvalidated observations are excluded', () => {
  const trend = summarizeWaterTrend([
    { at: 0, value: 150, valid: true },
    { at: 1, value: 999, valid: false },
    { at: 2, value: null, valid: true },
    { at: 3, value: NaN, valid: true },
    { at: 4, value: Infinity, valid: true },
    { at: 5, value: '300', valid: true },
    { at: NaN, value: 300, valid: true },
    { at: 60_000, value: 150, valid: true },
  ]);
  assert.equal(trend.samples, 2);
  assert.equal(trend.excluded, 6);
  assert.equal(trend.high.value, 150);
  assert.equal(trend.pattern, 'unchanged');
});

test('sorts without mutating input and discloses gaps instead of filling them', () => {
  const rows = [{ at: 3_600_000, value: 151, valid: true }, { at: 0, value: 150, valid: true }];
  const before = structuredClone(rows);
  const trend = summarizeWaterTrend(rows);
  assert.deepEqual(rows, before);
  assert.equal(trend.first.at, 0);
  assert.equal(trend.last.at, 3_600_000);
  assert.equal(trend.samples, 2);
  assert.equal(trend.maxGapMs, 3_600_000);
});

test('duplicate observations cannot provide evidence of persistence', () => {
  const trend = summarizeWaterTrend([...points([150]), ...points([150])]);
  assert.equal(trend.samples, 1);
  assert.equal(trend.excluded, 1);
  assert.equal(trend.pattern, 'insufficient');
});

test('conflicting values at one timestamp are not arbitrarily ordered', () => {
  const rows = [{ at: 0, value: 150, valid: true }, { at: 0, value: 300, valid: true }, { at: 1, value: 155, valid: true }];
  assert.deepEqual(summarizeWaterTrend(rows), summarizeWaterTrend([...rows].reverse()));
  assert.equal(summarizeWaterTrend(rows).samples, 1);
});

test('old stored reports remain readable without fabricated trends', () => {
  assert.match(describeWaterTrend(undefined), /Trend not stored.*Generate a new report/);
});

test('zero baselines and small fractional changes do not divide by zero or display a false zero', () => {
  assert.equal(summarizeWaterTrend(points([0, 1])).change, 1);
  const trend = summarizeWaterTrend(points([8, 8.00001]));
  assert.match(describeWaterTrend(trend), /higher by 0\.00001/);
});

test('web and server share identical trend math and wording', () => {
  const web = readFileSync(new URL('../../src/utils/waterTrends.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(readFileSync(new URL('../../functions/src/shared/waterTrends.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n'), web);
});

const mobile = new URL('../../../smart-aqua-mobile/src/utils/waterTrends.ts', import.meta.url);
test('mobile shares identical trend math and wording', { skip: !existsSync(mobile) }, () => {
  const web = readFileSync(new URL('../../src/utils/waterTrends.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  assert.equal(readFileSync(mobile, 'utf8').replaceAll('\r\n', '\n'), web);
});
