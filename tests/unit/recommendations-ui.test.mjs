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
  return renderToStaticMarkup(React.createElement(RecommendationsPanel, { aquariumId: 'tank-a', aquariumName: 'Tank A' }));
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

test('approved recommendations show traceable measurements, threshold explanation, timestamp and controls', () => {
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
  assert.match(html, /1 draft recommendation withheld pending scientific approval/);
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
