import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

// Render real report UI and pure summary logic offline, with no Firebase access.
const nodeRequire = createRequire(import.meta.url);
const cache = new Map();
function load(url) {
  if (cache.has(url.href)) return cache.get(url.href);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const mod = { exports: {} };
  const require = specifier => {
    if (specifier.endsWith('/useClientPagination')) return { useClientPagination: items => ({ items, start: 1, startIndex: 0 }) };
    if (specifier.endsWith('/Pagination')) return { default: () => null };
    if (specifier.endsWith('/ui/Card')) {
      const wrapper = ({ children }) => React.createElement('section', null, children);
      return { Card: wrapper, CardHeader: wrapper, CardContent: wrapper };
    }
    if (specifier.startsWith('.')) {
      const name = specifier.endsWith('.js') ? specifier.slice(0, -3) + '.ts'
        : specifier + (specifier.endsWith('ReportSummaryView') ? '.tsx' : '.ts');
      return load(new URL(name, url));
    }
    return nodeRequire(specifier);
  };
  new Function('require', 'module', 'exports', compiled)(require, mod, mod.exports);
  cache.set(url.href, mod.exports);
  return mod.exports;
}
const { buildStructuredSummary, resolvePeriod, normalizeReading } = load(new URL('../../functions/src/reports/summary.ts', import.meta.url));
const { default: ReportSummaryView } = load(new URL('../../src/components/reports/ReportSummaryView.tsx', import.meta.url));
const period = resolvePeriod('daily', '2026-11-03');
function summary(values = [150, 300, 150]) {
  return buildStructuredSummary({
    period, now: period.start + 3_600_000,
    aquarium: { id: 'tank-a', name: 'Tank A', orgId: null, orgName: null, createdAt: period.start, cleaning: null },
    readings: values.map((tdsPpm, index) => normalizeReading({
      recordedAtEpoch: period.start + index * 60_000, tdsPpm, validity: { tds: 'valid' },
    })),
    priorReading: null, alerts: [], recommendations: [], maintenance: [], commands: [],
    thresholds: { values: {}, speciesId: null, status: 'draft', overridden: [], missing: [] }, rules: [],
  });
}
const render = report => renderToStaticMarkup(React.createElement(ReportSummaryView, { summary: report }));

test('Reports renders descriptive changes, coverage and interpretation limits', () => {
  const html = render(summary());
  assert.match(html, /Water trends \(sampled history\)/);
  assert.match(html, /First and last samples equal.*Earlier high: 300 ppm/);
  assert.match(html, /3 distinct valid samples/);
  assert.match(html, /Largest gap between valid samples: 1 min/);
  assert.match(html, /Equal endpoints do not prove stable water or sustained recovery/);
  assert.match(html, /Asia\/Manila/);
});

test('old report UI asks for regeneration instead of fabricating a trend', () => {
  const report = summary();
  for (const stats of Object.values(report.readings.perParameter)) delete stats.trend;
  assert.match(render(report), /Trend not stored in this report. Generate a new report/);
});

test('empty report UI does not claim a stable or normal trend', () => {
  assert.match(render(summary([])), /Not enough distinct valid samples/);
});

test('report draft banner is removed for both old and new saved reports without rewriting approval metadata', () => {
  for (const note of [
    'Draft thresholds: some thresholds or rules in force are still DRAFT and have not been approved by the adviser.',
    summary().thresholds.draftNote,
    null,
  ]) {
    const report = summary();
    report.thresholds.draftNote = note;
    const before = structuredClone(report);
    const html = render(report);
    assert.doesNotMatch(html, /Draft configuration\.|have not been approved by the adviser|Draft thresholds\/rules metadata/);
    assert.match(html, /Thresholds and rules in force/);
    assert.match(html, /DRAFT/);
    assert.match(html, /Recommendations and what was done/);
    assert.match(html, /This period has not ended/);
    assert.deepEqual(report, before);
  }
});
