// FR21 report math on fixed fixtures, plus a PDF smoke check. No emulator.
// Run: npm run test:report-summary
import assert from 'node:assert/strict';
import test from 'node:test';
import { PDFDocument } from 'pdf-lib';
import type { EffectiveThresholds, RuleConfig } from '../src/shared/monitoringAssessmentCore.js';
import { renderReportPdf } from '../src/reports/pdf.js';
import {
  buildStructuredSummary,
  manilaDateKey,
  manilaMidnight,
  normalizeAlert,
  normalizeReading,
  normalizeRecommendation,
  previousPeriod,
  readingsCsv,
  resolvePeriod,
  summaryText,
  type ReadingRow,
  type SummaryInputs,
} from '../src/reports/summary.js';

const MIN = 60_000;
const HOUR = 60 * MIN;
const period = resolvePeriod('daily', '2026-11-03');
const start = period.start;
const now = start + 2 * HOUR; // the day is not over: effectiveEnd = start + 2 h

const allValid = { allValid: true, temperature: 'valid', ph: 'valid', tds: 'valid', turbidity: 'valid', waterLevel: 'valid' };
const statusAll = (overrides: Record<string, string> = {}) => ({
  temperatureC: 'normal', ph: 'normal', tdsPpm: 'normal', turbidity: 'normal', waterLevelPercent: 'normal',
  filter: 'normal', power: 'normal', equipment: 'not_monitored', ...overrides,
});
function row(offsetMin: number, fields: Record<string, unknown>): ReadingRow {
  const reading = normalizeReading({ recordedAtEpoch: start + offsetMin * MIN, ph: 7, turbidity: 1, waterLevelPercent: 90, ...fields });
  assert.ok(reading);
  return reading;
}

// Rows every 5 min, a 34-min gap, one invalid TDS, one legacy (unvalidated) row.
const readings: ReadingRow[] = [
  row(2, { classification: 'normal', temperatureC: 24, tdsPpm: 200, validity: allValid, parameterStatus: statusAll() }),
  row(5, { classification: 'normal', temperatureC: 25, tdsPpm: 0, validity: { ...allValid, allValid: false, tds: 'invalid' }, parameterStatus: statusAll({ tdsPpm: 'unavailable' }) }),
  row(10, { classification: 'normal', temperatureC: 26, tdsPpm: 210, validity: allValid, parameterStatus: statusAll() }),
  row(15, { classification: 'warning', temperatureC: 29, tdsPpm: 220, validity: allValid, parameterStatus: statusAll({ temperatureC: 'warning' }) }),
  row(20, { classification: 'critical', temperatureC: 31, tdsPpm: 230, validity: allValid, parameterStatus: statusAll({ temperatureC: 'critical' }) }),
  row(60, { classification: 'normal', temperatureC: 24, tdsPpm: 240, validity: allValid, parameterStatus: statusAll() }),
  // Legacy row from before the Cloud Function: no validity, no classification.
  row(65, { temperatureC: 99, tdsPpm: 999 }),
];
const prior = row(-3, { classification: 'warning', temperatureC: 28.5, tdsPpm: 205, validity: allValid, parameterStatus: statusAll({ temperatureC: 'warning' }) });

const ts = (ms: number) => ({ toMillis: () => ms }); // a Firestore Timestamp stand-in
const alerts = [
  normalizeAlert('a1', { parameter: 'temperatureC', severity: 'critical', type: 'Temperature high', triggered_at: ts(start + 15 * MIN), resolved_at: ts(start + 62 * MIN) }),
  normalizeAlert('a2', { parameter: 'device', severity: 'warning', type: 'Device offline', triggered_at: ts(start + 25 * MIN), resolved_at: ts(start + 58 * MIN) }),
  normalizeAlert('a3', { parameter: 'power', severity: 'critical', type: 'Power interruption', triggered_at: ts(start + 100 * MIN), resolved_at: null }),
  normalizeAlert('a4', { parameter: 'ph', severity: 'warning', type: 'pH low', triggered_at: ts(start - 10 * HOUR), resolved_at: ts(start + 30 * MIN) }),
  normalizeAlert('a5', { parameter: 'tdsPpm', severity: 'warning', triggered_at: ts(start - 5 * HOUR), resolved_at: ts(start - 4 * HOUR) }),
].map((alert) => {
  assert.ok(alert);
  return alert;
});

const rec = (id: string, offsetMin: number, fields: Record<string, unknown>) => {
  const item = normalizeRecommendation(id, { parameter: 'temperatureC', severity: 'warning', title: id, ruleId: `rule_${id}`, createdAt: start + offsetMin * MIN, ...fields });
  assert.ok(item);
  return item;
};
const recommendations = [
  rec('r1', 15, { status: 'applied' }),
  rec('r2', 16, { status: 'resolved', supersededBy: 'r1', resolvedBy: 'system' }),
  rec('r3', 30, { status: 'dismissed', parameter: 'device' }),
  rec('r4', 100, { status: 'pending', parameter: 'power' }),
  rec('r5', 40, { status: 'resolved', resolvedBy: 'system' }),
  rec('r6', -60, { status: 'applied' }), // before the period
];

const thresholds: EffectiveThresholds = {
  values: { temperatureC: { min: 20, max: 28 }, ph: { min: 6.5, max: 8 }, tdsPpm: { max: 400 } },
  speciesId: 'goldfish', status: 'draft', overridden: [], missing: ['turbidity'],
};
const rule = (ruleId: string, status: 'draft' | 'approved'): RuleConfig => ({
  ruleId, parameter: 'temperatureC', severity: 'warning', condition: { op: 'gt', ref: 'max' }, extraChecks: [], priority: 1,
  title: ruleId, action: 'Check the heater', basis: 'TBD', preCheck: '', enabled: true, status, source: 'TBD', approvedBy: null, approvedAt: null,
});

const inputs: SummaryInputs = {
  period, now,
  aquarium: { id: 'tank-1', name: 'Tank One', orgId: 'org-1', orgName: 'Org One', createdAt: start - 30 * 24 * HOUR,
    cleaning: { status: 'scheduled', nextCleaningDue: start + 3 * 24 * HOUR, reason: 'interval', intervalDays: 7, lastCleanedAt: start - 4 * 24 * HOUR } },
  readings, priorReading: prior, alerts, recommendations,
  maintenance: [
    { id: 'm1', performedAt: start + 70 * MIN, type: 'cleaning', performedByName: 'Ana', performedByRole: 'caretaker', waterChangePercent: 25, notes: 'Siphon', recommendationId: 'r1' },
    { id: 'm2', performedAt: start - 2 * HOUR, type: 'other', performedByName: null, performedByRole: null, waterChangePercent: null, notes: null, recommendationId: null },
  ],
  commands: [
    { id: 'c1', type: 'feed_now', status: 'done', source: 'app', requestedAt: start + 5 * MIN },
    { id: 'c2', type: 'set_light_state', status: 'failed', source: 'app', requestedAt: start + 6 * MIN },
    { id: 'c3', type: 'set_filter_state', status: 'no_response', source: 'app', requestedAt: start + 7 * MIN },
    { id: 'c4', type: 'feed_now', status: 'pending', source: 'schedule', requestedAt: start + 119 * MIN },
    { id: 'c5', type: 'feed_now', status: 'done', source: 'app', requestedAt: start - MIN },
  ],
  thresholds,
  rules: [rule('temp_high_warning', 'approved'), rule('temp_high_critical', 'draft')],
};

test('periods follow the Asia/Manila calendar', () => {
  assert.equal(manilaMidnight('2026-11-03'), Date.UTC(2026, 10, 2, 16, 0, 0));
  assert.equal(manilaDateKey(Date.UTC(2026, 10, 2, 16, 0, 0)), '2026-11-03');
  const week = resolvePeriod('weekly', '2026-11-07'); // a Saturday
  assert.equal(week.label, '2026-11-02 to 2026-11-08');
  assert.equal(week.end - week.start, 7 * 24 * HOUR);
  const month = resolvePeriod('monthly', '2026-02-14');
  assert.equal(month.label, '2026-02');
  assert.equal(month.end - month.start, 28 * 24 * HOUR);
  // The schedules: Monday 07:00 reports the week before; the 1st reports last month.
  assert.equal(previousPeriod('weekly', manilaMidnight('2026-11-09') + 7 * HOUR).label, '2026-11-02 to 2026-11-08');
  assert.equal(previousPeriod('monthly', manilaMidnight('2026-12-01') + 7 * HOUR).label, '2026-11');
  assert.equal(previousPeriod('monthly', manilaMidnight('2027-01-01') + 7 * HOUR).label, '2026-12');
  assert.throws(() => resolvePeriod('custom', '2026-01-01', '2026-06-01'), /at most 92 days/);
  assert.throws(() => resolvePeriod('custom', '2026-02-01', '2026-01-01'), /on or after/);
  assert.throws(() => resolvePeriod('daily', '2026-02-30'), /real calendar/);
});

test('readings: min/max/avg use valid readings only; invalid and unvalidated rows are counted, not averaged', () => {
  const summary = buildStructuredSummary(inputs);
  const temperature = summary.readings.perParameter.temperatureC;
  assert.deepEqual([temperature.min, temperature.max, temperature.avg], [24, 31, 26.5]);
  assert.deepEqual([temperature.valid, temperature.invalid, temperature.unvalidated], [6, 0, 1]);
  const tds = summary.readings.perParameter.tdsPpm;
  assert.deepEqual([tds.min, tds.max, tds.avg], [200, 240, 220], 'the 0 from the faulty TDS reading is excluded');
  assert.deepEqual([tds.valid, tds.invalid, tds.unvalidated], [5, 1, 1]);
  assert.equal(summary.readings.rows, 7);
});

test('completeness: expected vs received 5-minute slots, gaps and offline time', () => {
  const { completeness } = buildStructuredSummary(inputs);
  assert.equal(completeness.expectedSamples, 24);
  assert.equal(completeness.receivedSamples, 7);
  assert.equal(completeness.completenessPct, 29.2);
  assert.equal(completeness.noDataMs, 83 * MIN, 'gaps 26-60 min and 71-120 min');
  assert.equal(completeness.offlineMs, 33 * MIN);
  assert.equal(completeness.offlineEvents, 1);
});

test('completeness: a tank created mid-period counts from its creation, or from an earlier stored reading', () => {
  const created = buildStructuredSummary({ ...inputs, aquarium: { ...inputs.aquarium, createdAt: start + 60 * MIN } });
  assert.deepEqual([created.completeness.expectedSamples, created.completeness.receivedSamples], [24, 6], 'counting starts at the first row (2 min), so the 2- and 5-min rows share a slot');
  const late = buildStructuredSummary({ ...inputs, readings: readings.filter((row) => row.at >= start + 60 * MIN), aquarium: { ...inputs.aquarium, createdAt: start + 60 * MIN } });
  assert.deepEqual([late.completeness.expectedSamples, late.completeness.receivedSamples], [12, 2]);
});

test('time in condition: overall and per parameter, the prior row carries in, rows hold at most 6 min', () => {
  const { timeInCondition } = buildStructuredSummary(inputs);
  assert.deepEqual(timeInCondition.overall, {
    normal: 18 * MIN, warning: 7 * MIN, critical: 6 * MIN, unavailable: 0, notMonitored: 0, notRecorded: 6 * MIN, noData: 83 * MIN,
  });
  const temperature = timeInCondition.perParameter.temperatureC;
  assert.deepEqual([temperature.normal, temperature.warning, temperature.critical, temperature.notRecorded, temperature.noData], [18 * MIN, 7 * MIN, 6 * MIN, 6 * MIN, 83 * MIN]);
  const tds = timeInCondition.perParameter.tdsPpm;
  assert.equal(tds.unavailable, 5 * MIN, 'a sensor fault is its own bucket, never WARNING/CRITICAL');
  assert.equal(timeInCondition.perParameter.equipment.notMonitored, 31 * MIN);
  const total = Object.values(timeInCondition.overall).reduce((sum, value) => sum + value, 0);
  assert.equal(total, 2 * HOUR, 'the buckets add up to the elapsed period');
});

test('alerts: by severity and parameter, longest open, average time to resolve', () => {
  const { alerts: summary } = buildStructuredSummary(inputs);
  assert.equal(summary.total, 3, 'a4 started before the period; a5 ended before it');
  assert.deepEqual(summary.bySeverity, { warning: 1, critical: 2 });
  assert.deepEqual(summary.byParameter.temperatureC, { total: 1, warning: 0, critical: 1 });
  assert.equal(summary.resolved, 2);
  assert.equal(summary.stillOpen, 1);
  assert.equal(summary.avgResolveMs, 40 * MIN);
  assert.equal(summary.longestOpen?.alertId, 'a4');
  assert.equal(summary.longestOpen?.durationMs, 10 * HOUR + 30 * MIN);
});

test('recommendations vs action: generated, applied, dismissed, pending, auto-resolved, superseded', () => {
  const { recommendations: summary } = buildStructuredSummary(inputs);
  assert.deepEqual(
    [summary.generated, summary.applied, summary.dismissed, summary.pending, summary.autoResolved, summary.superseded, summary.actedOnPct],
    [5, 1, 1, 1, 1, 1, 40],
  );
  assert.equal(summary.items.find((item) => item.id === 'r2')?.status, 'superseded');
  assert.deepEqual(summary.byParameter.temperatureC, { generated: 3, applied: 1, dismissed: 0, pending: 0 });
});

test('maintenance, next cleaning, device activity, power interruptions, thresholds and the draft note', () => {
  const summary = buildStructuredSummary(inputs);
  assert.equal(summary.maintenance.count, 1);
  assert.equal(summary.maintenance.items[0].by, 'Ana (caretaker)');
  assert.equal(summary.maintenance.nextCleaning.nextCleaningDue, start + 3 * 24 * HOUR);
  assert.equal(summary.maintenance.nextCleaning.due, false);
  const { commands, powerInterruptions } = summary.devices;
  assert.deepEqual([commands.total, commands.done, commands.failed, commands.noResponse, commands.pending], [4, 1, 1, 1, 1]);
  assert.deepEqual(commands.bySource, { app: 3, schedule: 1 });
  assert.deepEqual([powerInterruptions.count, powerInterruptions.totalMs], [1, 20 * MIN]);
  assert.equal(summary.thresholds.rules.draft, 1);
  assert.match(summary.thresholds.draftNote ?? '', /Draft thresholds/);
  assert.deepEqual(summary.thresholds.values.tdsPpm, { min: null, max: 400, unit: 'ppm' });
  assert.match(summaryText(summary), /Daily report 2026-11-03: 7 readings \(29\.2% complete\)\. .* 5 recommendation\(s\): 1 applied, 1 dismissed, 1 pending\. Draft thresholds\./);
});

test('an empty period: zeros, no division by zero', () => {
  const summary = buildStructuredSummary({ ...inputs, readings: [], priorReading: null, alerts: [], recommendations: [], maintenance: [], commands: [] });
  assert.equal(summary.timeInCondition.overall.noData, 2 * HOUR);
  assert.equal(summary.readings.perParameter.ph.avg, null);
  assert.equal(summary.recommendations.actedOnPct, null);
  assert.equal(summary.alerts.avgResolveMs, null);
});

test('CSV: valid values only; a faulty sensor cell is empty and named; legacy rows are left out', () => {
  const csv = readingsCsv(readings).trim().split('\n');
  assert.equal(csv[0], 'recorded_at_manila,recorded_at_epoch_ms,temperature_c,ph,tds_ppm,turbidity_ntu,water_level_percent,classification,invalid_or_missing_sensors');
  assert.equal(csv.length, 1 + 6);
  assert.equal(csv[1], `2026-11-03T00:02,${start + 2 * MIN},24,7,200,1,90,normal,`);
  assert.equal(csv[2], `2026-11-03T00:05,${start + 5 * MIN},25,7,,1,90,normal,tds`);
  assert.ok(!csv.some((line) => line.includes(',99,')), 'the unvalidated legacy row is not exported');
});

test('PDF smoke: renders, opens, has the expected pages and metadata', async () => {
  const summary = buildStructuredSummary(inputs);
  const bytes = await renderReportPdf({ summary, readings, generatedAt: now, generatedByLabel: 'Ana', reportId: 'report-1' });
  assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPageCount();
  assert.ok(pages >= 3 && pages <= 6, `expected 3 to 6 pages, got ${pages}`);
  assert.match(pdf.getTitle() ?? '', /Tank One - 2026-11-03/);
  assert.equal(pdf.getAuthor(), 'SmartAqua Pro');
  const [width, height] = [pdf.getPage(0).getWidth(), pdf.getPage(0).getHeight()];
  assert.deepEqual([Math.round(width), Math.round(height)], [595, 842], 'A4');
});
