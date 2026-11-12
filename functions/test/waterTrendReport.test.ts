import assert from 'node:assert/strict';
import test from 'node:test';
import { buildStructuredSummary, normalizeReading, resolvePeriod, type SummaryInputs } from '../src/reports/summary.js';

// Offline report fixtures; no Firebase or device telemetry is written.
const period = resolvePeriod('daily', '2026-11-03');
const at = period.start;
const row = (offset: number, value: number, validity: string | null = 'valid') => {
  const result = normalizeReading({ recordedAtEpoch: at + offset, tdsPpm: value,
    ...(validity ? { validity: { tds: validity } } : {}),
  });
  assert.ok(result);
  return result;
};
const inputs: SummaryInputs = {
  period, now: at + 3_600_000,
  aquarium: { id: 'tank-a', name: 'Tank A', orgId: null, orgName: null, createdAt: at, cleaning: null },
  readings: [], priorReading: null, alerts: [], recommendations: [], maintenance: [], commands: [],
  thresholds: { values: {}, speciesId: null, status: 'draft', overridden: [], missing: [] },
  rules: [],
};

test('report trends use only valid in-period observations, excluding legacy and faulty rows', () => {
  const summary = buildStructuredSummary({ ...inputs,
    readings: [row(0, 150), row(60_000, 999, 'invalid'), row(120_000, 999, null), row(180_000, 300), row(240_000, 150)],
  });
  const stats = summary.readings.perParameter.tdsPpm;
  assert.equal(stats.trend?.pattern, 'varied');
  assert.equal(stats.trend?.samples, 3);
  assert.equal(stats.trend?.excluded, 2);
  assert.equal(stats.trend?.high?.value, 300);
  assert.equal(stats.trend?.change, 0);
  assert.equal(stats.avg, 200);
  assert.deepEqual(summary.recommendations.items, []);
});

test('partial reports exclude future observations and prior-period readings', () => {
  const summary = buildStructuredSummary({ ...inputs, readings: [row(-1, 999), row(0, 150), row(60_000, 151), row(3_600_001, 999)] });
  assert.equal(summary.readings.rows, 2);
  assert.equal(summary.readings.perParameter.tdsPpm.trend?.change, 1);
});

test('empty report trends remain unavailable, not normal or zero', () => {
  const summary = buildStructuredSummary(inputs);
  assert.equal(summary.readings.perParameter.tdsPpm.trend?.pattern, 'insufficient');
  assert.equal(summary.readings.perParameter.tdsPpm.trend?.first, null);
  assert.equal(summary.readings.perParameter.tdsPpm.trend?.change, null);
});
