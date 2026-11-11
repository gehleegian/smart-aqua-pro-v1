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
const tank = { id: 'tank-a', name: 'Aquarium A', telemetrySource: 'live' };

// Offline presentation fixtures only: never subscribe to or mutate Firebase.
function loadView(overrides = {}) {
  const events = [];
  const dashboard = {
    loading: false, error: '', selectedTank: tank,
    liveAquariums: [tank, { ...tank, id: 'tank-b', name: 'Aquarium B' }],
    actions: { selectTank: id => events.push(['select', id]) }, ...overrides,
  };
  function RecommendationsPanel(props) {
    return React.createElement('div', { 'data-aquarium': props.aquariumId, 'data-expanded': props.defaultOpen }, props.aquariumName);
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
      if (specifier === '../components/condition/RecommendationsPanel') return { RecommendationsPanel };
      if (specifier.startsWith('.')) return load(new URL(specifier + '.tsx', url));
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const { default: Recommendations } = load(new URL('views/Recommendations.tsx', root));
  const element = Recommendations({ onNavigate: page => events.push(['navigate', page]) });
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

test('Monitoring links to recommendations instead of embedding the panel', () => {
  const detail = read('components/monitoring/AquariumDetailsView.tsx');
  assert.doesNotMatch(detail, /RecommendationsPanel/);
  assert.match(detail, /onClick=\{onOpenRecommendations\}/);
  assert.match(detail, /View recommendations/);
  assert.match(detail, /<CommandHistory/);
  assert.match(detail, /<h3[^>]*>\s*Manual Controls\s*<\/h3>/);
  const monitoring = read('views/Monitoring.tsx');
  assert.match(monitoring, /onOpenRecommendations=\{\(\) => \{\s*if \(monitoring\.selectedAquarium\) \{\s*requestTankFocus\(monitoring\.selectedAquarium\.id\);\s*onNavigate\('recommendations'\)/);
});

test('page navigation follows existing member and organization boundaries', () => {
  const layout = read('components/layout/Layout.tsx');
  const permissionObject = layout.match(/const rolePermissions[^=]*= (\{[\s\S]*?\n\});/)?.[1];
  assert.ok(permissionObject);
  const permissions = Function(`return (${permissionObject});`)();
  for (const role of ['owner', 'caretaker']) assert.ok(permissions[role].includes('recommendations'));
  for (const role of ['Admin', 'none']) assert.ok(!permissions[role].includes('recommendations'));
  assert.match(layout, /recommendations: Recommendations/);
  const orgPages = layout.match(/const orgDataPages = new Set\((\[[^\]]*\])\)/)?.[1];
  assert.ok(Function(`return ${orgPages};`)().includes('recommendations'));
  assert.match(read('components/layout/Sidebar.tsx'), /id: 'recommendations', label: 'Recommendations', icon: ClipboardList, roles: \['owner', 'caretaker'\]/);
  assert.match(read('components/layout/Header.tsx'), /recommendations: 'Recommendations'/);
});

test('page reuses the existing recommendation panel, expanded for the selected aquarium', () => {
  const { element, html } = loadView();
  assert.match(html, /for="recommendations-aquarium"/);
  assert.match(html, /Aquarium A/);
  assert.match(html, /Aquarium B/);
  const panel = collect(element).find(node => node.type.name === 'RecommendationsPanel');
  assert.equal(panel.key, 'tank-a');
  assert.equal(panel.props.aquariumId, 'tank-a');
  assert.equal(panel.props.aquariumName, 'Aquarium A');
  assert.equal(panel.props.defaultOpen, true);
  const source = read('views/Recommendations.tsx');
  assert.match(source, /useDashboardController\(\)/);
  assert.doesNotMatch(source, /publishDeviceCommand|syncDeviceControlProfile|updateAquarium|setDoc|setStatus/);
});

test('aquarium selection and back navigation keep the correct tank and reset panel state', () => {
  const initial = loadView();
  collect(initial.element).find(node => node.type === 'select').props.onChange({ target: { value: 'tank-b' } });
  assert.deepEqual(initial.events, [['select', 'tank-b']]);
  const updated = loadView({ selectedTank: { ...tank, id: 'tank-b', name: 'Aquarium B' } });
  const nodes = collect(updated.element);
  const panel = nodes.find(node => node.type.name === 'RecommendationsPanel');
  assert.equal(panel.key, 'tank-b');
  assert.equal(panel.props.aquariumId, 'tank-b');
  nodes.find(node => node.type.name === 'Button').props.onClick();
  assert.deepEqual(updated.events, [['focus', 'tank-b'], ['navigate', 'monitoring']]);
});

test('loading, access errors, no aquarium and simulated telemetry have explicit states', () => {
  assert.match(loadView({ loading: true }).html, /Loading recommendations/);
  assert.match(loadView({ error: 'Access unavailable' }).html, /Access unavailable/);
  assert.match(loadView({ selectedTank: null, liveAquariums: [] }).html, /No aquariums available for recommendations/);
  const simulated = loadView({ selectedTank: { ...tank, telemetrySource: 'simulated' } });
  assert.match(simulated.html, /not available for simulated telemetry/);
  assert.doesNotMatch(simulated.html, /data-aquarium/);
});

test('stored recommendations remain accessible when live telemetry is unavailable', () => {
  const { html } = loadView({ selectedTank: { ...tank, hasFreshTelemetry: false }, liveDataError: 'No live data' });
  assert.match(html, /data-aquarium="tank-a"/);
});
