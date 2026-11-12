import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const componentUrl = new URL('../../src/components/condition/RecommendationsPanel.tsx', import.meta.url);

// Presentation fixtures only: no rules execution, sensor telemetry or Firebase
// access. Use the actual Card, Button, Badge and severity components.
function renderPanel(recommendations, options = {}) {
  function load(url) {
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const commonJsModule = { exports: {} };
    const require = specifier => {
      if (specifier === 'react') return { ...React, useState: initial => [initial === null ? options.applying ?? null : initial, () => {}] };
      if (specifier === '../../hooks/useRecommendations') return { useRecommendations: () => ({
        recommendations, error: options.error ?? '', savingId: options.savingId ?? '',
        setStatus: () => { throw new Error('UI rendering must not update recommendation status'); },
      }) };
      if (specifier === '../maintenance/LogMaintenanceModal') return {
        LogMaintenanceModal: () => React.createElement('div', { 'data-testid': 'maintenance-modal' }, 'Maintenance form'),
      };
      if (specifier.startsWith('.')) return load(new URL(specifier + '.tsx', url));
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, commonJsModule, commonJsModule.exports);
    return commonJsModule.exports;
  }
  const { RecommendationsPanel } = load(componentUrl);
  return renderToStaticMarkup(React.createElement(RecommendationsPanel, { aquariumId: 'tank-a', aquariumName: 'Tank A', defaultOpen: options.defaultOpen, ...options.props }));
}

const recommendation = {
  id: 'recommendation-1', aquariumId: 'tank-a', status: 'pending',
  ruleId: 'temp_high_warning', parameter: 'temperatureC', createdAt: 1794290400000,
  severity: 'warning', ruleStatus: 'approved', title: 'Review aquarium condition',
  issueDetected: 'Temperature 25 °C is above the 24 °C maximum.', preCheck: 'Verify the measurement.',
  action: 'Review the maintenance guidance.', basis: 'Existing configured rule.',
  readingSnapshot: { temperatureC: 25, updatedAt: 1794290390000 },
  threshold: { min: 20, max: 24 },
};

test('recommendations use the same initially collapsed Show/Hide pattern as command history', () => {
  const html = renderPanel([recommendation]);
  assert.match(html, /<details class="group">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /<summary[^>]*focus-visible/);
  assert.match(html, /group-open:hidden">Show/);
  assert.match(html, /group-open:inline">Hide/);
  assert.match(html, /1 active/);
  assert.match(readFileSync(componentUrl, 'utf8'), /<details key=\{aquariumId\}/);
});

test('only pending recommendations appear, all inside a bounded keyboard-scrollable list', () => {
  const html = renderPanel([
    recommendation,
    { ...recommendation, id: 'recommendation-2', severity: 'critical', title: 'Second pending recommendation' },
    { ...recommendation, id: 'recommendation-3', status: 'dismissed', title: 'Dismissed recommendation' },
  ]);
  assert.match(html, /2 active/);
  assert.equal((html.match(/<li /g) ?? []).length, 2);
  assert.match(html, /<ul aria-label="Pending recommendations" tabindex="0"[^>]*max-h-96[^>]*overflow-y-auto/);
  assert.doesNotMatch(html, /Dismissed recommendation/);
  assert.match(html, /WARNING/);
  assert.match(html, /CRITICAL/);
});

test('dedicated page can expand recommendations without changing the dashboard default', () => {
  const html = renderPanel([recommendation], { defaultOpen: true });
  assert.match(html, /<details open="" class="group">/);
  assert.match(html, /1 active/);
  assert.match(html, /Applied/);
  assert.match(html, /Dismiss/);
});

test('rule explanations, draft badge and existing action controls stay available', () => {
  const html = renderPanel([recommendation]);
  for (const text of ['Problem detected', 'Parameter', 'Temperature', 'Measured value', '25 °C', 'Applicable threshold',
    '20 °C to 24 °C', '24 °C maximum', 'Severity', 'Generated', 'Nov 10, 2026', 'Check first', 'Action', 'Why',
    recommendation.preCheck, recommendation.action, recommendation.basis, 'Applied', 'Dismiss']) {
    assert.ok(html.includes(text), text);
  }
  const saving = renderPanel([recommendation], { savingId: recommendation.id });
  assert.equal((saving.match(/ disabled=""/g) ?? []).length, 2);
});

test('draft recommendations are withheld from active actions without losing their approval status', () => {
  const html = renderPanel([{ ...recommendation, ruleStatus: 'draft' }]);
  assert.match(html, /0 active/);
  assert.match(html, /1 saved draft recommendation withheld/);
  assert.match(html, /Rule approval has not been recorded in the app/);
  assert.doesNotMatch(html, /pending scientific approval/);
  assert.match(html, /Draft rule/);
  assert.doesNotMatch(html, />Applied</);
  assert.doesNotMatch(html, />Dismiss</);
});

test('empty and error states remain understandable while collapsed', () => {
  const empty = renderPanel([]);
  assert.match(empty, /0 active/);
  assert.match(empty, /No active approved recommendations/);
  assert.doesNotMatch(empty, /<ul/);
  const error = renderPanel([], { error: 'Unable to read recommendations.' });
  assert.match(error, /Recommendations unavailable/);
  assert.match(error, /Unable to read recommendations\./);
});

test('maintenance modal remains outside the collapsible section', () => {
  const html = renderPanel([recommendation], { applying: recommendation });
  assert.ok(html.indexOf('data-testid="maintenance-modal"') > html.indexOf('</details>'));
});

// Presentation fixtures for the insight list (no telemetry generation).
const liveAssessment = {
  overallSeverity: 'normal', source: 'live', assessedAt: 1, ruleVersion: 'rules:draft', origin: 'client', draft: true,
  recommendations: [], matchedRules: [], faults: [], ruleNotes: [],
  parameters: [
    { parameter: 'ph', label: 'pH', severity: 'normal', status: 'normal', notMonitored: false, value: 10, message: 'pH is within the configured range.' },
    { parameter: 'temperature', label: 'Temperature', severity: 'warning', status: 'warning', notMonitored: false, value: 26, unit: '°C', message: 'Temperature is warning.' },
    { parameter: 'waterLevel', label: 'Water level', severity: 'unavailable', status: 'unavailable', notMonitored: false, value: null, message: 'Unavailable: sensor fault: waterLevelReadingValid is false.' },
    { parameter: 'equipment', label: 'Equipment', severity: 'unavailable', status: 'not_monitored', notMonitored: true, value: 'Unknown', message: 'Not monitored.' },
  ],
};
const thresholds = { values: { ph: { min: 6.5, max: 10.5 }, temperatureC: { min: 20, max: 24 } }, speciesId: 'goldfish', status: 'approved', overridden: ['ph'], missing: [] };

test('insights are always shown from the live assessment, even with no active recommendations', () => {
  const html = renderPanel([], { props: { assessment: liveAssessment, thresholds } });
  assert.match(html, /0 active · 4 insights/);
  assert.match(html, /Current insights/);
  assert.match(html, /pH 10.0: 0.5 below the 10.5 maximum, 3.5 above the 6.5 minimum\. Judged against this aquarium’s custom limit\. No approved rule guidance/);
  assert.match(html, /No approved recommendation rule covers this condition yet/);
  assert.match(html, /Treated as a sensor or data problem, not a water condition/);
  assert.match(html, /Custom limits/);
  assert.doesNotMatch(html, /Not monitored\./);
});

test('insights explain missing live data instead of inventing readings', () => {
  const html = renderPanel([], { props: { assessment: { ...liveAssessment, source: 'unavailable' }, thresholds } });
  assert.match(html, /No live data/);
  assert.doesNotMatch(html, /within range/);
});

test('panel without an assessment renders no insight section', () => {
  assert.doesNotMatch(renderPanel([recommendation]), /Current insights/);
});

const rule = (ruleId, side, op, extra = {}) => ({
  ruleId, parameter: 'ph', severity: 'warning', condition: { op, ref: side, ...extra.condition }, extraChecks: [],
  priority: 20, title: ruleId, action: `Action for ${ruleId}.`, basis: '', preCheck: '', enabled: true,
  status: extra.status ?? 'approved', source: 'cited', approvedBy: null, approvedAt: null,
});

test('normal readings quote the approved rule that applies on each side, never draft rules', () => {
  const rules = [
    rule('ph_high_critical', 'max', 'gt', { condition: { marginPct: 10 } }),
    rule('ph_high_warning', 'max', 'gt'),
    rule('ph_low_warning', 'min', 'lt', { status: 'draft' }),
  ];
  const html = renderPanel([], { props: { assessment: liveAssessment, thresholds, rules } });
  assert.match(html, /If it goes above 10.5:<\/span> Action for ph_high_warning\./);
  assert.match(html, /\(rule <!-- -->ph_high_warning<!-- -->\)|\(rule ph_high_warning\)/);
  assert.doesNotMatch(html, /ph_high_critical/);
  assert.doesNotMatch(html, /ph_low_warning/);
});

test('the stored cleaning schedule appears as an insight with its reason', () => {
  const cleaning = { status: 'scheduled', nextCleaningDue: 1, reason: 'tds_rise', lastCleanedAt: 0, lastCleanedSource: 'maintenance_actions', intervalDays: 14, bioloadLevel: 'light', evaluatedAt: 0 };
  const html = renderPanel([], { props: { assessment: liveAssessment, thresholds, cleaning } });
  assert.match(html, /Cleaning due/);
  assert.match(html, /Brought forward because TDS rose since the last cleaning\. Schedule: every 14 days \(light bioload\)\./);
});
