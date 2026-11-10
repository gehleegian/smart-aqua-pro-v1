import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const root = new URL('../../src/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const tank = { id: 'tank-a', name: 'Aquarium A', telemetrySource: 'live', engineState: { cleaning: { status: 'scheduled' } } };

// Offline UI fixtures only. The page must delegate to the existing components,
// never load Firebase directly or submit a maintenance record during a test.
function loadView(overrides = {}) {
  const events = [];
  const dashboard = {
    loading: false, error: '', selectedTank: tank, telemetryNow: 1000,
    liveAquariums: [tank, { ...tank, id: 'tank-b', name: 'Aquarium B' }],
    actions: { selectTank: id => events.push(['select', id]) }, ...overrides,
  };
  function NextCleaningCard(props) {
    return React.createElement('div', { 'data-cleaning-aquarium': props.aquariumId }, 'Next cleaning and logging');
  }
  function MaintenanceHistory(props) {
    return React.createElement('div', { 'data-history-aquarium': props.aquariumId }, 'Maintenance history');
  }
  function load(url) {
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const loadedModule = { exports: {} };
    const require = specifier => {
      if (specifier === '../hooks/useDashboardController') return { useDashboardController: () => dashboard };
      if (specifier === '../services/tankFocus') return { requestTankFocus: id => events.push(['focus', id]) };
      if (specifier === '../components/condition/NextCleaningCard') return { NextCleaningCard };
      if (specifier === '../components/maintenance/MaintenanceHistory') return { MaintenanceHistory };
      if (specifier.startsWith('.')) return load(new URL(specifier + '.tsx', url));
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const { default: Maintenance } = load(new URL('views/Maintenance.tsx', root));
  const element = Maintenance({ onNavigate: page => events.push(['navigate', page]) });
  return { element, html: renderToStaticMarkup(element), events };
}

function collect(element) {
  const nodes = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    nodes.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(element);
  return nodes;
}

test('Maintenance is registered with existing member-only and suspended-organization guards', () => {
  const layout = read('components/layout/Layout.tsx');
  const permissionObject = layout.match(/const rolePermissions[^=]*= (\{[\s\S]*?\n\});/)?.[1];
  assert.ok(permissionObject);
  const permissions = Function(`return (${permissionObject});`)();
  for (const role of ['owner', 'caretaker']) assert.ok(permissions[role].includes('maintenance'));
  for (const role of ['Admin', 'none']) assert.ok(!permissions[role].includes('maintenance'));
  assert.match(layout, /maintenance: Maintenance/);
  const orgPages = layout.match(/const orgDataPages = new Set\((\[[^\]]*\])\)/)?.[1];
  assert.ok(Function(`return ${orgPages};`)().includes('maintenance'));
  assert.match(read('components/layout/Sidebar.tsx'), /id: 'maintenance', label: 'Maintenance', icon: Wrench, roles: \['owner', 'caretaker'\]/);
  assert.match(read('components/layout/Header.tsx'), /maintenance: 'Aquarium Maintenance'/);
});

test('page delegates schedule, logging and history to existing components for the same aquarium', () => {
  const { element, html } = loadView();
  assert.match(html, /for="maintenance-aquarium"/);
  assert.match(html, /Aquarium A/);
  assert.match(html, /Aquarium B/);
  const nodes = collect(element);
  const card = nodes.find(node => node.type.name === 'NextCleaningCard');
  const history = nodes.find(node => node.type.name === 'MaintenanceHistory');
  assert.equal(card.props.aquariumId, 'tank-a');
  assert.equal(card.props.aquariumName, 'Aquarium A');
  assert.equal(card.props.cleaning, tank.engineState.cleaning, 'display the server summary without recalculating it');
  assert.equal(card.props.now, 1000);
  assert.equal(history.props.aquariumId, card.props.aquariumId);
  assert.equal(card.props.onOpenMaintenance, undefined, 'do not link the page to itself');
});

test('changing aquariums remounts logging and history together and return navigation keeps the selection', () => {
  const initial = loadView();
  collect(initial.element).find(node => node.type === 'select').props.onChange({ target: { value: 'tank-b' } });
  assert.deepEqual(initial.events, [['select', 'tank-b']]);
  const updated = loadView({ selectedTank: { ...tank, id: 'tank-b', name: 'Aquarium B' } });
  const nodes = collect(updated.element);
  assert.ok(nodes.some(node => node.key === 'tank-b'), 'the shared content boundary resets form, notice and history filter');
  for (const name of ['NextCleaningCard', 'MaintenanceHistory']) {
    assert.equal(nodes.find(node => node.type.name === name).props.aquariumId, 'tank-b');
  }
  nodes.find(node => node.type.name === 'Button').props.onClick();
  assert.deepEqual(updated.events, [['focus', 'tank-b'], ['navigate', 'monitoring']]);
});

test('loading, no aquarium and access errors have explicit non-writing states', () => {
  assert.match(loadView({ loading: true }).html, /Loading maintenance/);
  const failed = loadView({ error: 'Access unavailable' });
  assert.match(failed.html, /Access unavailable/);
  assert.doesNotMatch(failed.html, /data-history-aquarium|data-cleaning-aquarium/);
  assert.match(loadView({ selectedTank: null, liveAquariums: [] }).html, /No aquariums available for maintenance/);
});

test('offline or not-yet-evaluated aquariums can log maintenance, but simulated data cannot', () => {
  const offline = loadView({ selectedTank: { ...tank, hasFreshTelemetry: false, engineState: null } });
  const card = collect(offline.element).find(node => node.type.name === 'NextCleaningCard');
  assert.equal(card.props.cleaning, null);
  assert.match(offline.html, /data-history-aquarium="tank-a"/);
  const simulated = loadView({ selectedTank: { ...tank, telemetrySource: 'simulated' } });
  assert.match(simulated.html, /not available for simulated telemetry/);
  assert.doesNotMatch(simulated.html, /data-history-aquarium|data-cleaning-aquarium/);
});

test('page adds no independent backend calls or cleaning-rule calculations', () => {
  const source = read('views/Maintenance.tsx');
  assert.match(source, /useDashboardController\(\)/);
  assert.doesNotMatch(source, /firebase|logMaintenance\(|updateDoc|setDoc|computeCleaningSchedule|refreshCleaningSchedule|CYCLE_RESET_WATER_CHANGE_PCT/);
});
