import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { firmwarePower, powerPublicationBlock } from '../helpers/firmware-power.mjs';
import { buildAlertFindings, evaluateAquarium, normalizeRuleConfig, planAlertChanges, resolveThresholds } from '../../src/utils/monitoringAssessmentCore.ts';

const seed = JSON.parse(readFileSync(new URL('../../scripts/seed/goldfish-draft.json', import.meta.url), 'utf8'));
const rules = Object.entries(seed.rules).map(([id, data]) => normalizeRuleConfig(id, data));
const powerResult = (telemetry) => evaluateAquarium(telemetry, resolveThresholds(null), rules, {});

test('Aquarium 1 publishes its measured analog ON/OFF as booleans and matching status', () => {
  assert.deepEqual(firmwarePower(1, { signalV: 2.514 }), { telemetry: { powerStatus: 'Online', mainsPresent: true }, digitalReads: 0 });
  assert.deepEqual(firmwarePower(1, { signalV: 0.142 }).telemetry, { powerStatus: 'Power Interruption', mainsPresent: false });
  assert.equal(firmwarePower(1, { signalV: 0 }).telemetry.mainsPresent, false, 'zero volts is measured absence, not a missing field');
});

test('Aquarium 1 ambiguous, invalid or clipped inputs never assert mains presence/absence', () => {
  for (const options of [{ signalV: NaN }, { signalV: -1 }, { signalV: 5 }, { signalV: 2.514, saturated: true }, { signalV: (0.142 + 2.515) / 2 }]) {
    assert.deepEqual(firmwarePower(1, options).telemetry, { powerStatus: 'Unknown' });
  }
});

test('Aquarium 2 reads the active-LOW optocoupler once and publishes the same state for rules and display', () => {
  assert.deepEqual(firmwarePower(2, { digitalLevel: 0 }), { telemetry: { powerStatus: 'Online', mainsPresent: true }, digitalReads: 1 });
  assert.deepEqual(firmwarePower(2, { digitalLevel: 1 }), { telemetry: { powerStatus: 'Power Interruption', mainsPresent: false }, digitalReads: 1 });
  assert.deepEqual(firmwarePower(2, { digitalLevel: 0, presentLevel: -1 }), { telemetry: { powerStatus: 'Unknown' }, digitalReads: 0 });
});

for (const [device, restored, absent] of [[1, { signalV: 2.514 }, { signalV: 0.142 }], [2, { digitalLevel: 0 }, { digitalLevel: 1 }]]) {
  test(`Aquarium ${device}: actual firmware outage signal opens a critical power alert and requests notification once`, () => {
    const before = powerResult(firmwarePower(device, restored).telemetry);
    assert.equal(before.matchedRules.some((rule) => rule.ruleId === 'power_interruption'), false);
    const result = powerResult(firmwarePower(device, absent).telemetry);
    const power = result.perParameter.find((item) => item.parameter === 'power');
    assert.equal(power.status, 'critical');
    assert.equal(power.ruleId, 'power_interruption');
    const findings = buildAlertFindings(result).filter((item) => item.key === 'power');
    const opened = planAlertChanges({ aquariumId: `test-aquarium-${device}`, entries: {}, findings, now: 1000 });
    assert.equal(opened.operations[0].kind, 'open');
    assert.equal(opened.operations[0].severity, 'critical');
    const repeat = planAlertChanges({ aquariumId: `test-aquarium-${device}`, entries: opened.entries, findings, now: 2000 });
    assert.ok(repeat.operations.every((operation) => operation.kind !== 'open' && !operation.notify), 'repeat must not spam push notifications');
    const unknown = powerResult({ powerStatus: 'Unknown' });
    assert.equal(unknown.matchedRules.some((rule) => rule.parameter === 'power'), false);
  });
  test(`Aquarium ${device}: prepared upload copy retains the exact power-publication fix`, {
    skip: !existsSync(new URL(`../../../Aquarium${device}Device/Aquarium${device}Device.ino`, import.meta.url)),
  }, () => {
    const repo = readFileSync(new URL(`../../firmware/Aquarium${device}Device/Aquarium${device}Device.ino`, import.meta.url), 'utf8');
    const upload = readFileSync(new URL(`../../../Aquarium${device}Device/Aquarium${device}Device.ino`, import.meta.url), 'utf8');
    assert.equal(powerPublicationBlock(upload), powerPublicationBlock(repo));
    assert.match(repo, /JsonDocument telemetry;/);
    assert.match(repo, /database\("telemetry", HTTP_METHOD_PUT/);
  });
}
