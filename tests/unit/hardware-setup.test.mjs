import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import React from 'react';
import { confirmedHardware, needsHardwareConfirmation, parseHardwareInventory } from '../../src/utils/hardwareInventory.ts';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

test('only new unconfirmed devices require the hardware step; both known devices are exempt', () => {
  for (const id of ['SAQ-7K3M-9R2X', 'SAQ-HGCA-SJRS']) {
    assert.equal(needsHardwareConfirmation(id, 'setup'), false);
    assert.equal(needsHardwareConfirmation(id, 'active'), false);
    assert.equal(confirmedHardware(id).sensors.reduce((sum, sensor) => sum + sensor.count, 0), 6);
  }
  assert.equal(needsHardwareConfirmation('SAQ-TEST-0001', 'setup'), true);
  assert.equal(needsHardwareConfirmation('SAQ-TEST-0001', 'setup', true), false);
  assert.equal(needsHardwareConfirmation('SAQ-TEST-0001', 'active'), false);
  assert.equal(confirmedHardware('SAQ-TEST-0001'), null);
});

test('web, Functions and mobile share identical hardware definitions and exemptions', () => {
  const web = readFileSync(new URL('../../src/utils/hardwareInventory.ts', import.meta.url), 'utf8');
  assert.equal(readFileSync(new URL('../../functions/src/shared/hardwareInventory.ts', import.meta.url), 'utf8'), web);
  const mobile = new URL('../../../smart-aqua-mobile/src/utils/hardwareInventory.ts', import.meta.url);
  if (existsSync(mobile)) assert.equal(readFileSync(mobile, 'utf8'), web);
});

test('inventory quantities are validated and canonicalized, not inferred from telemetry', () => {
  const value = { sensors: [{ type: 'temperature', count: 2 }, { type: 'ph', count: 1 }], equipment: ['filter', 'lights'] };
  assert.deepEqual(parseHardwareInventory(value), {
    sensors: [{ type: 'ph', count: 1 }, { type: 'temperature', count: 2 }], equipment: ['lights', 'filter'],
  });
  for (const count of [0, -1, 1.5, NaN, Infinity, '2', 101]) {
    assert.throws(() => parseHardwareInventory({ sensors: [{ type: 'ph', count }], equipment: [] }));
  }
  assert.throws(() => parseHardwareInventory({ ...value, ownerId: 'attacker' }));
  assert.throws(() => parseHardwareInventory({ ...value, equipment: ['filter', 'filter'] }));
});

const simpleInput = props => React.createElement('input', { ...props, 'aria-label': props.label });
function wizard({ step = 'Hardware', required = true, acknowledged = false, confirmFailure = false, profileFailure = false } = {}) {
  const calls = [];
  const hardware = { sensors: [{ type: 'ph', count: 1 }], equipment: [] };
  const h = paginationUiHarness({ seeds: [
    'tank', { deviceId: 'SAQ-TEST-0001', status: 'setup' }, '', step, 'Tank', '50', '25', '30', '', false,
    false, '', '', 'goldfish', '1', ['5'], '', false, hardware, required, acknowledged, true,
  ], mocks: {
    '../hooks/useOrg': { useOrg: () => ({ isOwner: true }) },
    '../hooks/useRuleConfig': { useRuleConfig: () => ({ speciesById: {} }) },
    '../services/aquariumService': { getAquariumById() { throw new Error('No reads in render'); }, updateAquarium: async () => {
      calls.push('profile'); if (profileFailure && calls.filter(call => call === 'profile').length === 1) throw new Error('Profile save failed');
    } },
    '../services/orgContext': { getSetupTarget: () => 'tank', setSetupTarget: () => calls.push('target-cleared') },
    '../services/hardwareSetupService': { readHardwareSetup() { throw new Error('No reads in render'); },
      confirmHardwareSetup: async () => { calls.push('hardware'); if (confirmFailure) throw new Error('Hardware save failed'); } },
    '../components/ui/Input': { __esModule: true, default: simpleInput },
    '../ui/Input': { __esModule: true, default: simpleInput },
    '../components/condition/ThresholdReview': { __esModule: true, default: () => null },
  } });
  const { default: Wizard } = h.load(new URL('../../src/views/SetupWizard.tsx', import.meta.url));
  const props = { onNavigate: page => calls.push(page) };
  return { h, Wizard, props, calls };
}

test('hardware checklist requires acknowledgement and revising a quantity clears it', () => {
  const { h, Wizard, props } = wizard();
  let view = h.render(Wizard, props);
  assert.match(view.html, /Installed sensors/);
  view.nodes.find(node => node.type === 'button' && node.props.children === 'Next').props.onClick();
  view = h.render(Wizard, props);
  assert.match(view.html, /Confirm the installed hardware checklist before continuing/);
  const confirmation = view.nodes.find(node => node.type === 'input' && node.props.type === 'checkbox' && node.props.className === 'mt-1');
  confirmation.props.onChange({ target: { checked: true } });
  view = h.render(Wizard, props);
  const quantity = view.nodes.find(node => node.type === 'input' && node.props.label === 'pH sensor quantity');
  quantity.props.onChange({ target: { value: '2' } });
  view = h.render(Wizard, props);
  assert.equal(view.nodes.find(node => node.type === 'input' && node.props.className === 'mt-1').props.checked, false);
});

test('confirmed hardware saves before the profile; failures do not activate or navigate', async () => {
  for (const confirmFailure of [false, true]) {
    const { h, Wizard, props, calls } = wizard({ step: 'Thresholds', acknowledged: true, confirmFailure });
    const view = h.render(Wizard, props);
    const finish = view.nodes.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Finish setup'));
    assert.ok(finish); finish.props.onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(calls, confirmFailure ? ['hardware'] : ['hardware', 'profile', 'target-cleared', 'dashboard']);
    if (confirmFailure) assert.match(h.render(Wizard, props).html, /Hardware save failed/);
  }
});

test('exempt or previously confirmed setup has no hardware step and makes no hardware save', async () => {
  const { h, Wizard, props, calls } = wizard({ step: 'Thresholds', required: false });
  const view = h.render(Wizard, props);
  assert.doesNotMatch(view.html, /\d\. Hardware/);
  view.nodes.find(node => node.type === 'button' && Array.isArray(node.props.children) && node.props.children.includes('Finish setup')).props.onClick();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['profile', 'target-cleared', 'dashboard']);
});

test('profile retry does not repeat or reopen a successfully confirmed hardware checklist', async () => {
  const { h, Wizard, props, calls } = wizard({ step: 'Thresholds', acknowledged: true, profileFailure: true });
  const finish = () => h.render(Wizard, props).nodes.find(node => node.type === 'button' &&
    Array.isArray(node.props.children) && node.props.children.includes('Finish setup')).props.onClick();
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['hardware', 'profile']);
  assert.match(h.render(Wizard, props).html, /Profile save failed/);
  assert.doesNotMatch(h.render(Wizard, props).html, /\d\. Hardware/);
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls, ['hardware', 'profile', 'profile', 'target-cleared', 'dashboard']);
});
