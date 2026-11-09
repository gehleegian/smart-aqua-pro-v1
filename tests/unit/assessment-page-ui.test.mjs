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
const assessment = {
  ruleVersion: 'existing-rule-version', overallSeverity: 'unavailable', draft: false,
  parameters: [], ruleNotes: ['Existing calibration note'], recommendations: [],
};
const tank = { id: 'tank-a', name: 'Aquarium A', assessment };

function loadView(overrides = {}) {
  const events = [];
  const dashboard = {
    loading: false, error: '', liveDataError: '', ruleConfigError: '',
    selectedTank: tank, liveAquariums: [tank, { ...tank, id: 'tank-b', name: 'Aquarium B' }],
    actions: { selectTank: id => events.push(['select', id]) }, ...overrides,
  };
  function load(url) {
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const module = { exports: {} };
    const require = specifier => {
      if (specifier === '../hooks/useDashboardController') return { useDashboardController: () => dashboard };
      if (specifier === '../services/tankFocus') return { requestTankFocus: id => events.push(['focus', id]) };
      if (specifier.startsWith('.')) return load(new URL(specifier + '.tsx', url));
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, module, module.exports);
    return module.exports;
  }
  const { default: Assessment } = load(new URL('views/Assessment.tsx', root));
  const element = Assessment({ onNavigate: page => events.push(['navigate', page]) });
  return { element, html: renderToStaticMarkup(element), events };
}

test('full assessment is removed from Monitoring, but its scoped navigation link remains', () => {
  const detail = read('components/monitoring/AquariumDetailsView.tsx');
  assert.doesNotMatch(detail, />Condition Assessment<|Assessment limits and calibration|assessment\.parameters\.map/);
  assert.match(detail, /onClick=\{onOpenAssessment\}/);
  assert.match(detail, /View assessment/);
  assert.match(detail, /<RecommendationsPanel/);
  assert.match(detail, /<CommandHistory/);
  assert.match(detail, /<h3[^>]*>Manual Controls<\/h3>/);
  const monitoring = read('views/Monitoring.tsx');
  assert.match(monitoring, /requestTankFocus\(monitoring\.selectedAquarium\.id\)/);
  assert.match(monitoring, /onNavigate\('assessment'\)/);
});

test('new page preserves the existing member and suspended-organization boundaries', () => {
  const layout = read('components/layout/Layout.tsx');
  const permissionObject = layout.match(/const rolePermissions[^=]*= (\{[\s\S]*?\n\});/)?.[1];
  assert.ok(permissionObject);
  const permissions = Function(`return (${permissionObject});`)();
  assert.ok(permissions.owner.includes('assessment'));
  assert.ok(permissions.caretaker.includes('assessment'));
  assert.ok(!permissions.none.includes('assessment'));
  assert.ok(!permissions.Admin.includes('assessment'));
  assert.match(layout, /assessment: Assessment/);
  const orgPages = layout.match(/const orgDataPages = new Set\((\[[^\]]*\])\)/)?.[1];
  assert.ok(Function(`return ${orgPages};`)().includes('assessment'));
  assert.match(read('components/layout/Sidebar.tsx'), /id: 'assessment', label: 'Assessment', icon: ClipboardCheck, roles: \['owner', 'caretaker'\]/);
  assert.match(read('components/layout/Header.tsx'), /assessment: 'Aquarium Assessment'/);
});

test('assessment page reuses existing read-only data and explains missing valid readings', () => {
  const { html } = loadView();
  assert.match(html, /Condition Assessment/);
  assert.match(html, /existing-rule-version/);
  assert.match(html, /UNAVAILABLE/);
  assert.match(html, /No parameters assessed yet/);
  assert.match(html, /Existing calibration note/);
  assert.match(html, /for="assessment-aquarium"/);
  assert.match(html, /Aquarium A/);
  assert.match(html, /Aquarium B/);
  assert.match(read('views/Assessment.tsx'), /useDashboardController\(\)/);
  assert.doesNotMatch(read('views/Assessment.tsx'), /publishDeviceCommand|syncDeviceControlProfile|updateAquarium|setDoc|setStatus/);
});

test('details retain parameter explanations, draft status and existing recommendations', () => {
  const { html } = loadView({ selectedTank: { ...tank, assessment: {
    ...assessment, overallSeverity: 'warning', draft: true,
    parameters: [{ parameter: 'temperature', label: 'Temperature', severity: 'warning', message: 'Existing parameter explanation' }],
    recommendations: ['Existing maintenance recommendation'],
  } } });
  for (const text of ['WARNING', 'Draft thresholds', 'Temperature', 'Existing parameter explanation', 'Existing maintenance recommendation']) assert.ok(html.includes(text), text);
});

test('selector and return link preserve the selected aquarium', () => {
  const { element, events } = loadView();
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
  const nodes = collect(element);
  nodes.find(node => node.type === 'select').props.onChange({ target: { value: 'tank-b' } });
  assert.deepEqual(events, [['select', 'tank-b']]);
  // The controller supplies the new selected tank on the following render.
  const updated = loadView({ selectedTank: { ...tank, id: 'tank-b', name: 'Aquarium B' } });
  collect(updated.element).find(node => typeof node.type === 'function' && node.type.name === 'Button').props.onClick();
  assert.deepEqual(updated.events, [['focus', 'tank-b'], ['navigate', 'monitoring']]);
});

test('loading, missing aquarium, subscription error and rule-config error are not blank screens', () => {
  assert.match(loadView({ loading: true }).html, /Loading assessment/);
  assert.match(loadView({ error: 'Access unavailable' }).html, /Access unavailable/);
  assert.match(loadView({ selectedTank: null, liveAquariums: [] }).html, /No aquariums available/);
  const { html } = loadView({ liveDataError: 'Live data unavailable', ruleConfigError: 'Rule config unavailable' });
  assert.match(html, /Live data unavailable/);
  assert.match(html, /Rule config unavailable/);
});
