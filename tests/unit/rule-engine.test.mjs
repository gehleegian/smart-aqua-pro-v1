import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
  ALERT_COOLDOWN_MS,
  ALERT_TOUCH_INTERVAL_MS,
  AUTO_RESOLVE_NORMAL_COUNT,
  DAY_MS,
  buildAlertFindings,
  computeBioload,
  computeCleaningSchedule,
  conditionSignature,
  derivePowerStatus,
  evaluateAquarium,
  evaluatedPowerStatus,
  normalizeRuleConfig,
  normalizeSpeciesConfig,
  planAlertChanges,
  resolveThresholds,
  selectSpeciesConfig,
  toConditionAssessment,
} from '../../src/utils/monitoringAssessmentCore.ts';

const seed = JSON.parse(readFileSync(new URL('../../scripts/seed/goldfish-draft.json', import.meta.url), 'utf8'));
const goldfish = normalizeSpeciesConfig('goldfish', seed.species.goldfish);
const rules = Object.entries(seed.rules).map(([id, data]) => normalizeRuleConfig(id, data));
const thresholds = resolveThresholds(goldfish);
const ruleIds = Object.keys(seed.rules);

// A reading inside every draft range, shaped like the device contract.
const NORMAL = Object.freeze({
  temperatureC: 22, temperatureReadingValid: true,
  ph: 7, phReadingValid: true,
  tdsPpm: 250, tdsReadingValid: true,
  turbidity: 2, turbidityReadingValid: true,
  waterLevelPercent: 90, waterPresent: true,
  filterState: 'Active', equipmentStatus: 'Normal', powerStatus: 'Online',
  online: true, updatedAt: 1_700_000_000_000,
});
const reading = (overrides = {}) => ({ ...NORMAL, ...overrides });
const evaluate = (overrides = {}, profile = { hasFiltrationSystem: true }) =>
  evaluateAquarium(reading(overrides), thresholds, rules, profile);
const param = (result, name) => result.perParameter.find((item) => item.parameter === name);
const ruleFor = (result, name) => result.matchedRules.find((item) => item.parameter === name);

test('seed: every rule and the species parse, and all are draft with source TBD', () => {
  assert.ok(goldfish);
  assert.equal(rules.length, ruleIds.length);
  assert.ok(rules.every(Boolean), 'every seeded rule normalizes');
  for (const doc of [seed.species.goldfish, ...Object.values(seed.rules)]) {
    assert.equal(doc.status, 'draft');
    assert.equal(doc.source, 'TBD');
    assert.equal(doc.approvedBy, null);
    assert.equal(doc.approvedAt, null);
  }
  for (const rule of rules) {
    assert.ok(rule.title && rule.action && rule.basis && rule.preCheck, `${rule.ruleId} has title/action/basis/preCheck`);
  }
});

test('all-normal reading: overall NORMAL, no rules, draft flag set', () => {
  const result = evaluate();
  assert.equal(result.overall, 'normal');
  assert.deepEqual(result.matchedRules, []);
  assert.deepEqual(result.faults, []);
  assert.equal(result.draft, true);
});

// [ruleId, reading overrides, profile, expected severity]
const RULE_CASES = [
  ['temp_high_warning', { temperatureC: 25 }, {}, 'warning'],
  ['temp_high_critical', { temperatureC: 26.5 }, {}, 'critical'],
  ['temp_low_warning', { temperatureC: 19 }, {}, 'warning'],
  ['temp_low_critical', { temperatureC: 17.9 }, {}, 'critical'],
  ['ph_high_warning', { ph: 8 }, {}, 'warning'],
  ['ph_high_critical', { ph: 8.3 }, {}, 'critical'],
  ['ph_low_warning', { ph: 6.2 }, {}, 'warning'],
  ['ph_low_critical', { ph: 5.8 }, {}, 'critical'],
  ['tds_high_warning', { tdsPpm: 450 }, {}, 'warning'],
  ['tds_high_warning_heavy_bioload', { tdsPpm: 450 }, { bioloadLevel: 'heavy' }, 'warning'],
  ['tds_high_critical', { tdsPpm: 501 }, {}, 'critical'],
  ['tds_low_warning', { tdsPpm: 80 }, {}, 'warning'],
  ['turbidity_warning_filter_on', { turbidity: 7 }, {}, 'warning'],
  ['turbidity_warning_filter_off', { turbidity: 7, filterState: 'Inactive' }, {}, 'warning'],
  ['turbidity_warning', { turbidity: 7, filterState: undefined }, {}, 'warning'],
  ['turbidity_critical', { turbidity: 11 }, {}, 'critical'],
  ['water_level_low_warning', { waterLevelPercent: 65 }, {}, 'warning'],
  ['water_level_low_critical', { waterLevelPercent: 16 }, {}, 'critical'],
  ['power_interruption', { mainsPresent: false }, {}, 'critical'],
  ['equipment_fault', { equipmentStatus: 'Fault' }, {}, 'critical'],
  ['equipment_warning', { equipmentStatus: 'Warning' }, {}, 'warning'],
  ['filter_inactive', { filterState: 'Inactive' }, {}, 'warning'],
];
const RULE_PARAMETER = Object.fromEntries(Object.entries(seed.rules).map(([id, data]) => [id, data.parameter]));

for (const [ruleId, overrides, profile, severity] of RULE_CASES) {
  test(`rule ${ruleId}: ${JSON.stringify(overrides)} -> ${severity}`, () => {
    const result = evaluate(overrides, { hasFiltrationSystem: true, ...profile });
    const parameter = RULE_PARAMETER[ruleId];
    assert.equal(param(result, parameter).status, severity);
    assert.equal(ruleFor(result, parameter)?.ruleId, ruleId);
    assert.equal(result.overall === 'critical' || result.overall === severity, true);
  });
}

test('every seeded rule is covered by a test case', () => {
  // power_offline is covered by the "placeholder powerStatus" test below: it is not
  // reached from telemetry until a device sends mainsPresent (docs/rule-engine.md §3).
  const covered = new Set([...RULE_CASES.map(([id]) => id), 'power_offline', 'device_offline', 'sensor_fault', 'cleaning_due', 'cleaning_due_early']);
  assert.deepEqual(ruleIds.filter((id) => !covered.has(id)), []);
});

test('same turbidity WARNING gives different advice with the filter on vs off', () => {
  const on = ruleFor(evaluate({ turbidity: 7, filterState: 'Active' }), 'turbidity');
  const off = ruleFor(evaluate({ turbidity: 7, filterState: 'Inactive' }), 'turbidity');
  assert.equal(on.severity, 'warning');
  assert.equal(off.severity, 'warning');
  assert.notEqual(on.ruleId, off.ruleId);
  assert.match(off.action, /turn it back on/);
  assert.match(on.action, /rinse the filter media/);
});

test('boundaries: on the limit is NORMAL, just past it is WARNING, past the margin is CRITICAL', () => {
  const cases = [
    ['temperatureC', 24, 'normal'], ['temperatureC', 24.01, 'warning'], ['temperatureC', 26.4, 'warning'], ['temperatureC', 26.41, 'critical'],
    ['temperatureC', 20, 'normal'], ['temperatureC', 18, 'warning'], ['temperatureC', 17.99, 'critical'],
    ['ph', 7.5, 'normal'], ['ph', 8.25, 'warning'], ['ph', 8.26, 'critical'], ['ph', 6.5, 'normal'], ['ph', 5.85, 'warning'], ['ph', 5.84, 'critical'],
    ['tdsPpm', 400, 'normal'], ['tdsPpm', 500, 'warning'], ['tdsPpm', 500.1, 'critical'], ['tdsPpm', 100, 'normal'], ['tdsPpm', 99, 'warning'],
    ['turbidity', 5, 'normal'], ['turbidity', 10, 'warning'], ['turbidity', 10.01, 'critical'],
    ['waterLevelPercent', 70, 'normal'], ['waterLevelPercent', 59.5, 'warning'], ['waterLevelPercent', 59.4, 'critical'],
  ];
  for (const [parameter, value, expected] of cases) {
    assert.equal(param(evaluate({ [parameter]: value }), parameter).status, expected, `${parameter}=${value}`);
  }
});

test('sensor faults never produce water rules: one sensor_fault recommendation per faulty sensor', () => {
  const result = evaluate({ ph: 0, temperatureC: 85, tdsReadingValid: false });
  assert.deepEqual(result.faults.map((fault) => fault.parameter).sort(), ['ph', 'tdsPpm', 'temperatureC']);
  for (const parameter of ['ph', 'temperatureC', 'tdsPpm']) {
    assert.equal(param(result, parameter).status, 'unavailable');
    const matched = result.matchedRules.filter((rule) => rule.parameter === parameter);
    assert.equal(matched.length, 1);
    assert.equal(matched[0].ruleId, 'sensor_fault');
  }
  assert.equal(ruleFor(result, 'ph').action, 'Check the pH probe connection or calibration.');
  assert.equal(ruleFor(result, 'temperatureC').action, 'Check the temperature probe connection or calibration.');
  // The remaining valid sensors still classify; faults do not drag the overall condition down.
  assert.equal(result.overall, 'normal');
});

test('the live Aquarium 1 payload: real CRITICAL findings plus a TDS sensor fault', () => {
  const live = { temperatureC: 26.5, temperatureReadingValid: true, ph: 8.1, waterLevelPercent: 16, waterPresent: true,
    tdsReadingValid: false, equipmentStatus: 'Unknown', powerStatus: 'Unknown', online: true, updatedAt: 1_700_000_000_000 };
  const result = evaluateAquarium(live, thresholds, rules, { hasFiltrationSystem: true });
  assert.equal(result.overall, 'critical');
  assert.equal(param(result, 'temperatureC').status, 'critical');
  assert.equal(param(result, 'ph').status, 'warning');
  assert.equal(param(result, 'waterLevelPercent').status, 'critical');
  assert.equal(param(result, 'turbidity').status, 'unavailable');
  assert.deepEqual(result.faults.map((fault) => fault.parameter), ['tdsPpm']);
  assert.equal(param(result, 'power').status, 'not_monitored');
  assert.equal(param(result, 'equipment').status, 'not_monitored');
});

test('Unknown/missing power and equipment are "not monitored" and do not block NORMAL', () => {
  const result = evaluate({ powerStatus: 'Unknown', equipmentStatus: 'Unknown', filterState: undefined });
  assert.equal(result.overall, 'normal');
  assert.equal(param(result, 'power').status, 'not_monitored');
  assert.equal(param(result, 'equipment').status, 'not_monitored');
  assert.equal(param(result, 'filter').status, 'not_monitored');
  const view = toConditionAssessment(result, { source: 'live', assessedAt: 1, origin: 'client' });
  assert.equal(view.overallSeverity, 'normal');
  assert.equal(view.parameters.find((item) => item.parameter === 'power').notMonitored, true);
});

test('no filtration system in the profile: filter is not monitored, never a warning', () => {
  const result = evaluate({ filterState: 'Inactive' }, { hasFiltrationSystem: false });
  assert.equal(param(result, 'filter').status, 'not_monitored');
  assert.equal(param(result, 'filter').value, 'Not installed');
  assert.equal(result.overall, 'normal');
});

test('roll-up: known equipment/power faults count; nothing assessable is UNAVAILABLE', () => {
  assert.equal(evaluate({ equipmentStatus: 'Fault' }).overall, 'critical');
  assert.equal(evaluate({ temperatureC: 25, equipmentStatus: 'Warning' }).overall, 'warning');
  const empty = evaluateAquarium({ online: true, updatedAt: 1 }, thresholds, rules, {});
  assert.equal(empty.overall, 'unavailable');
  assert.equal(evaluateAquarium(null, thresholds, rules, {}).overall, 'unavailable');
  const onlyPower = evaluateAquarium({ mainsPresent: false, online: true, updatedAt: 1 }, thresholds, rules, {});
  assert.equal(onlyPower.overall, 'critical');
});

test('mainsPresent derives powerStatus (new, additive) and falls back to the reported status', () => {
  assert.equal(derivePowerStatus({ mainsPresent: false, powerStatus: 'Online' }), 'Power Interruption');
  assert.equal(derivePowerStatus({ mainsPresent: true, powerStatus: 'Unknown' }), 'Online');
  assert.equal(derivePowerStatus({ powerStatus: 'Unknown' }), 'Unknown');
  assert.equal(derivePowerStatus({}), undefined);
});

test('only the sensed mainsPresent signal is evaluated; the device-reported powerStatus is informational', () => {
  assert.equal(evaluatedPowerStatus({ mainsPresent: false, powerStatus: 'Online' }), 'Power Interruption');
  assert.equal(evaluatedPowerStatus({ mainsPresent: true, powerStatus: 'Power Interruption' }), 'Online');
  for (const powerStatus of ['Power Interruption', 'Offline', 'Online', 'Unknown', undefined]) {
    assert.equal(evaluatedPowerStatus({ powerStatus }), undefined);
  }
});

test('placeholder powerStatus without mainsPresent raises no power rule and is shown as not monitored', () => {
  // Aquarium 1's current firmware reports "Power Interruption" while online and
  // sends no mainsPresent; that must not become a CRITICAL Power Interruption.
  for (const powerStatus of ['Power Interruption', 'Offline']) {
    const result = evaluate({ powerStatus });
    const power = param(result, 'power');
    assert.equal(power.status, 'not_monitored');
    assert.equal(power.value, powerStatus);
    assert.match(power.reason, /informational until the device sends mainsPresent/);
    assert.equal(result.matchedRules.some((rule) => rule.parameter === 'power'), false);
    assert.equal(result.overall, 'normal');
  }
  const unreported = param(evaluate({ powerStatus: undefined }), 'power');
  assert.deepEqual([unreported.status, unreported.value, unreported.reason], ['not_monitored', null, 'status not reported']);
});

test('once mainsPresent is sent it decides power, whatever powerStatus says', () => {
  const interrupted = evaluate({ mainsPresent: false, powerStatus: 'Online' });
  assert.equal(param(interrupted, 'power').status, 'critical');
  assert.equal(param(interrupted, 'power').ruleId, 'power_interruption');
  const restored = evaluate({ mainsPresent: true, powerStatus: 'Power Interruption' });
  assert.equal(param(restored, 'power').status, 'normal');
  assert.equal(restored.overall, 'normal');
});

test('thresholds: species defaults, then per-aquarium overrides; no species means no thresholds', () => {
  const overridden = resolveThresholds(goldfish, { temperatureC: { max: 26 }, ph: { min: 9 } });
  assert.deepEqual(overridden.values.temperatureC, { min: 20, max: 26 });
  assert.deepEqual(overridden.values.ph, { min: 6.5, max: 7.5 }, 'an inverted override is ignored');
  assert.deepEqual(overridden.overridden, ['temperatureC']);
  assert.equal(param(evaluateAquarium(reading({ temperatureC: 25 }), overridden, rules, {}), 'temperatureC').status, 'normal');
  const none = resolveThresholds(null);
  assert.equal(none.missing.length, 5);
  const result = evaluateAquarium(reading(), none, rules, {});
  assert.equal(param(result, 'temperatureC').reason, 'threshold missing');
  assert.equal(result.overall, 'unavailable', 'no water parameter can be assessed without thresholds');
  assert.equal(param(result, 'equipment').status, 'normal', 'status parameters still assess');
  assert.equal(selectSpeciesConfig({ species: ['Goldfish'] }, { goldfish }), goldfish);
  assert.equal(selectSpeciesConfig({ species: ['Koi'] }, { goldfish }), null);
});

test('a disabled rule is ignored, and a classification with no matching rule is reported missing', () => {
  const withoutGeneric = rules.map((rule) => (rule.ruleId.startsWith('turbidity_warning') ? { ...rule, enabled: false } : rule));
  const result = evaluateAquarium(reading({ turbidity: 7 }), thresholds, withoutGeneric, {});
  assert.equal(param(result, 'turbidity').status, 'normal', 'no enabled warning rule: not classified');
  const onlyFilterOff = rules.filter((rule) => rule.ruleId !== 'turbidity_warning' && rule.ruleId !== 'turbidity_warning_filter_on');
  const missing = evaluateAquarium(reading({ turbidity: 7, filterState: 'Active' }), thresholds, onlyFilterOff, {});
  assert.equal(param(missing, 'turbidity').status, 'warning');
  assert.deepEqual(missing.missingRules, ['turbidity:warning']);
});

test('approved config clears the draft flag', () => {
  const approvedRules = rules.map((rule) => ({ ...rule, status: 'approved' }));
  const approved = resolveThresholds({ ...goldfish, status: 'approved' });
  assert.equal(evaluateAquarium(reading(), approved, approvedRules, {}).draft, false);
  assert.equal(evaluateAquarium(reading(), thresholds, approvedRules, {}).draft, true);
});

test('signature changes with any per-parameter status or chosen rule', () => {
  const base = conditionSignature(evaluate());
  assert.equal(conditionSignature(evaluate({ temperatureC: 22.5 })), base);
  assert.notEqual(conditionSignature(evaluate({ temperatureC: 25 })), base);
  assert.notEqual(
    conditionSignature(evaluate({ turbidity: 7, filterState: 'Active' })),
    conditionSignature(evaluate({ turbidity: 7, filterState: 'Inactive' }))
  );
});

// ---------------- Alert lifecycle ----------------
const T0 = 1_700_000_000_000;
function step(entries, overrides, now) {
  return planAlertChanges({ aquariumId: 'aq1', entries, findings: buildAlertFindings(evaluate(overrides)), now });
}

test('alerts: a bad reading opens one alert with a linked recommendation', () => {
  const first = step({}, { temperatureC: 25 }, T0);
  const open = first.operations.filter((op) => op.kind === 'open');
  assert.equal(open.length, 1);
  assert.equal(open[0].key, 'temperatureC');
  assert.equal(open[0].rule.ruleId, 'temp_high_warning');
  assert.ok(open[0].recommendationId);
  assert.equal(first.entries.temperatureC.alertId, open[0].alertId);
});

test('alerts: repeats do not duplicate; occurrences bump at most every 5 min', () => {
  const first = step({}, { temperatureC: 25 }, T0);
  const again = step(first.entries, { temperatureC: 25.2 }, T0 + 15_000);
  assert.deepEqual(again.operations, []);
  assert.equal(again.changed, false, 'no write needed');
  const later = step(again.entries, { temperatureC: 25.2 }, T0 + ALERT_TOUCH_INTERVAL_MS);
  assert.deepEqual(later.operations.map((op) => op.kind), ['touch']);
});

test('alerts: escalation updates the same alert, notifies, and supersedes the recommendation', () => {
  const first = step({}, { temperatureC: 25 }, T0);
  const worse = step(first.entries, { temperatureC: 27 }, T0 + 15_000);
  assert.equal(worse.operations.length, 1);
  const [op] = worse.operations;
  assert.equal(op.kind, 'escalate');
  assert.equal(op.alertId, first.entries.temperatureC.alertId);
  assert.equal(op.notify, true);
  assert.equal(op.supersededRecommendationId, first.entries.temperatureC.recommendationId);
  assert.notEqual(op.recommendationId, op.supersededRecommendationId);
  const better = step(worse.entries, { temperatureC: 25 }, T0 + 30_000);
  assert.equal(better.operations[0].kind, 'change');
  assert.equal(better.operations[0].notify, false);
});

test('alerts: auto-resolve after 3 consecutive NORMAL evaluations, then a 15 min cooldown', () => {
  let state = step({}, { temperatureC: 25 }, T0);
  const alertId = state.entries.temperatureC.alertId;
  for (let i = 1; i < AUTO_RESOLVE_NORMAL_COUNT; i += 1) {
    state = step(state.entries, {}, T0 + i * 15_000);
    assert.equal(state.operations.length, 0);
    assert.equal(state.changed, true, 'the streak is persisted');
  }
  // An abnormal reading resets the streak.
  state = step(state.entries, { temperatureC: 25 }, T0 + 40_000);
  assert.equal(state.entries.temperatureC.normalStreak, 0);
  for (let i = 1; i <= AUTO_RESOLVE_NORMAL_COUNT; i += 1) state = step(state.entries, {}, T0 + 40_000 + i * 15_000);
  const resolvedAt = T0 + 40_000 + AUTO_RESOLVE_NORMAL_COUNT * 15_000;
  assert.deepEqual(state.operations.map((op) => [op.kind, op.alertId]), [['resolve', alertId]]);
  assert.equal(state.entries.temperatureC.resolvedAt, resolvedAt);

  const tooSoon = step(state.entries, { temperatureC: 25 }, resolvedAt + ALERT_COOLDOWN_MS - 1);
  assert.deepEqual(tooSoon.operations.map((op) => op.kind), ['suppressed']);
  const afterCooldown = step(state.entries, { temperatureC: 25 }, resolvedAt + ALERT_COOLDOWN_MS);
  assert.deepEqual(afterCooldown.operations.map((op) => op.kind), ['open']);
  assert.notEqual(afterCooldown.operations[0].alertId, alertId);
});

test('alerts: a sensor fault is its own alert; unknown readings neither bump nor resolve', () => {
  const faulty = step({}, { ph: 0 }, T0);
  assert.deepEqual(faulty.operations.map((op) => [op.kind, op.key, op.rule?.ruleId]), [['open', 'sensor_fault:ph', 'sensor_fault']]);
  const open = step({}, { temperatureC: 25 }, T0);
  const missing = step(open.entries, { temperatureC: undefined, temperatureReadingValid: undefined }, T0 + 15_000);
  assert.deepEqual(missing.operations, []);
  assert.equal(missing.entries.temperatureC.normalStreak, 0);
});

test('alerts: device key can resolve on the first fresh check', () => {
  const offline = evaluateAquarium(null, thresholds, rules, { deviceState: 'offline' });
  const findings = buildAlertFindings(offline).filter((finding) => finding.key === 'device');
  const opened = planAlertChanges({ aquariumId: 'aq1', entries: {}, findings, now: T0 });
  assert.equal(opened.operations[0].rule.ruleId, 'device_offline');
  const online = buildAlertFindings(evaluateAquarium(null, thresholds, rules, { deviceState: 'online' })).filter((f) => f.key === 'device');
  const resolved = planAlertChanges({ aquariumId: 'aq1', entries: opened.entries, findings: online, now: T0 + 60_000, resolveAfter: () => 1 });
  assert.deepEqual(resolved.operations.map((op) => op.kind), ['resolve']);
});

// ---------------- Bioload and cleaning ----------------
const bands = goldfish.bioloadBandsGPerL;

test('bioload: density bands and incomplete profiles', () => {
  assert.equal(computeBioload({ fishCount: 2, fishWeightsG: [5, 5], workingWaterVolumeLiters: 20 }, bands).level, 'light');
  assert.equal(computeBioload({ fishCount: 2, fishWeightsG: [20, 20], workingWaterVolumeLiters: 20 }, bands).level, 'moderate');
  assert.equal(computeBioload({ fishCount: 1, fishWeightsG: [30], workingWaterVolumeLiters: 10 }, bands).level, 'moderate', '3 g/L is the moderate upper bound');
  assert.equal(computeBioload({ fishCount: 1, fishWeightsG: [40], workingWaterVolumeLiters: 10 }, bands).level, 'heavy');
  assert.equal(computeBioload({ fishCount: 1, fishWeightsG: [10], workingWaterVolumeLiters: 10 }, bands).level, 'light', '1 g/L is still light');
  assert.equal(computeBioload({ fishCount: 0, fishWeightsG: [], workingWaterVolumeLiters: 10 }, bands).level, 'light');
  assert.equal(computeBioload({ fishCount: 2, fishWeightsG: [5], workingWaterVolumeLiters: 10 }, bands), null);
  assert.equal(computeBioload({ fishCount: 1, fishWeightsG: [5] }, bands), null);
  assert.equal(computeBioload({ fishCount: 1, fishWeightsG: [5], workingWaterVolumeLiters: 10 }, undefined), null);
});

const cleaning = (overrides = {}) => computeCleaningSchedule({
  now: T0 + 3 * DAY_MS,
  lastCleanedAt: T0,
  intervalDays: 10,
  tdsBaselinePpm: 200,
  currentTdsPpm: 220,
  tdsRisePctLimit: 30,
  turbidityWarningTimes: [],
  turbidityWarningCount: 2,
  turbidityWindowHours: 24,
  ...overrides,
});

test('cleaning: interval path (lastCleanedAt + interval by bioload)', () => {
  const schedule = cleaning();
  assert.equal(schedule.nextCleaningDue, T0 + 10 * DAY_MS);
  assert.equal(schedule.reason, 'interval');
  assert.equal(schedule.due, false);
  assert.equal(cleaning({ now: T0 + 10 * DAY_MS }).due, true);
  assert.equal(cleaning({ intervalDays: 7 }).nextCleaningDue, T0 + 7 * DAY_MS);
});

test('cleaning: TDS rise >= 30% over the post-cleaning baseline pulls the date in to now', () => {
  const now = T0 + 3 * DAY_MS;
  assert.equal(cleaning({ currentTdsPpm: 259 }).early, false);
  const early = cleaning({ currentTdsPpm: 260 });
  assert.equal(early.tdsRisePct, 30);
  assert.equal(early.early, true);
  assert.equal(early.reason, 'tds_rise');
  assert.equal(early.nextCleaningDue, now);
  assert.deepEqual(early.newTrigger, { at: now, reason: 'tds_rise' });
  // Latched: stays at the trigger time later, even if TDS drops again.
  const latched = cleaning({ now: now + DAY_MS, currentTdsPpm: 210, latched: early.newTrigger });
  assert.equal(latched.nextCleaningDue, now);
  assert.equal(latched.newTrigger, null);
  assert.equal(cleaning({ tdsBaselinePpm: null, currentTdsPpm: 999 }).early, false, 'no baseline yet');
});

test('cleaning: turbidity WARNING twice within 24 h pulls the date in to now', () => {
  const now = T0 + 3 * DAY_MS;
  assert.equal(cleaning({ turbidityWarningTimes: [now - 2 * 60_000] }).early, false);
  assert.equal(cleaning({ turbidityWarningTimes: [now - 25 * 3600_000, now - 60_000] }).early, false, 'outside the window');
  const early = cleaning({ turbidityWarningTimes: [now - 23 * 3600_000, now - 60_000] });
  assert.equal(early.reason, 'turbidity_repeat');
  assert.equal(early.nextCleaningDue, now);
});

test('cleaning: once the interval date has passed, early triggers do not apply', () => {
  const schedule = cleaning({ now: T0 + 11 * DAY_MS, currentTdsPpm: 400 });
  assert.equal(schedule.reason, 'interval');
  assert.equal(schedule.due, true);
  assert.equal(schedule.newTrigger, null);
});

test('docs/rule-matrix.md is regenerated from the seed (no drift)', async () => {
  const { execFileSync } = await import('node:child_process');
  const generated = execFileSync(process.execPath, [new URL('../../scripts/rule-matrix.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  const committed = readFileSync(new URL('../../docs/rule-matrix.md', import.meta.url), 'utf8');
  assert.equal(committed, generated, 'run: node scripts/rule-matrix.mjs > docs/rule-matrix.md');
});
