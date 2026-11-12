import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { filterAlertsByDate, INITIAL_VISIBLE_ALERTS } from '../../src/utils/alertsListPresentation.ts';

const nodeRequire = createRequire(import.meta.url);
const root = new URL('../../src/', import.meta.url);
function load(url) {
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const commonJsModule = { exports: {} };
  const require = specifier => specifier === 'react'
    ? { ...React, useState: initial => [typeof initial === 'function' ? initial() : initial, () => {}] }
    : specifier.startsWith('.')
    ? load(new URL(specifier + (existsSync(new URL(specifier + '.ts', url)) ? '.ts' : '.tsx'), url))
    : nodeRequire(specifier);
  new Function('require', 'module', 'exports', compiled)(require, commonJsModule, commonJsModule.exports);
  return commonJsModule.exports;
}
const { AlertsList } = load(new URL('components/alerts/AlertsList.tsx', root));
const { AlertsFilters } = load(new URL('components/alerts/AlertsFilters.tsx', root));
const fixture = (id, iso = '2026-11-09T04:00:00Z') => ({
  id, fingerprint: id, aquariumId: 'tank-a', tankName: 'Aquarium A', ownerName: 'Owner',
  type: 'warning', category: 'system', title: `Alert ${id}`, message: 'Device status notice',
  firstDetectedAt: Date.parse(iso), lastDetectedAt: Date.parse(iso),
  acknowledgedAt: null, resolvedAt: null, origin: 'server',
});
function list(alerts, overrides = {}) {
  return AlertsList({ title: 'My Alerts', alerts, selectedAlertId: '', userRole: 'User',
    onToggleAlert: () => {}, onAcknowledgeAlert: () => {}, ...overrides });
}
function nodes(element) {
  const result = [];
  function visit(node) {
    if (!React.isValidElement(node)) return;
    result.push(node);
    React.Children.forEach(node.props.children, visit);
  }
  visit(element);
  return result;
}

test('five alerts are initially exposed with indexed pagination over the matching records', () => {
  assert.equal(INITIAL_VISIBLE_ALERTS, 5);
  const html = renderToStaticMarkup(list(Array.from({ length: 8 }, (_, i) => fixture(`item-${i}`))));
  assert.equal((html.match(/aria-controls="alert-details-/g) ?? []).length, 5);
  assert.match(html, /8 matching alerts/);
  assert.match(html, /Showing 1–5 of 8 loaded matching alerts/);
  assert.match(html, /Page 1 of 2/);
  assert.match(html, /aria-label="Record 1"/);
  assert.doesNotMatch(html, /More alerts|Show fewer alerts/);
});

test('no unnecessary dropdown appears for zero through five matching alerts', () => {
  for (const count of [0, 1, 5]) {
    const html = renderToStaticMarkup(list(Array.from({ length: count }, (_, i) => fixture(`item-${i}`))));
    assert.doesNotMatch(html, /<details/);
    if (!count) assert.match(html, /No alerts match the selected filters/);
  }
  assert.match(renderToStaticMarkup(list(Array.from({ length: 6 }, (_, i) => fixture(`item-${i}`)))), /Page 1 of 2/);
});

test('date filtering respects both UTC+8 midnight boundaries, preserves order and does not mutate alerts', () => {
  const alerts = [
    fixture('before', '2026-11-08T15:59:59.999Z'),
    fixture('start', '2026-11-08T16:00:00.000Z'),
    fixture('end', '2026-11-09T15:59:59.999Z'),
    fixture('after', '2026-11-09T16:00:00.000Z'),
  ];
  const original = JSON.stringify(alerts);
  assert.deepEqual(filterAlertsByDate(alerts, '2026-11-09').map(a => a.id), ['start', 'end']);
  assert.equal(JSON.stringify(alerts), original);
  assert.equal(filterAlertsByDate(alerts, ''), alerts);
  assert.deepEqual(filterAlertsByDate(alerts, '2026-11-01'), []);
});

test('date is explicitly last seen, not first occurrence or resolution date; malformed timestamps are excluded', () => {
  const alert = { ...fixture('repeated', '2026-11-09T04:00:00Z'), firstDetectedAt: Date.parse('2026-11-01T04:00:00Z'), resolvedAt: Date.parse('2026-11-10T04:00:00Z') };
  assert.deepEqual(filterAlertsByDate([alert], '2026-11-01'), []);
  assert.equal(filterAlertsByDate([alert], '2026-11-09').length, 1);
  assert.deepEqual(filterAlertsByDate([{ ...alert, lastDetectedAt: NaN }, { ...alert, lastDetectedAt: 1e30 }], '2026-11-09'), []);
});

test('date picker, clear-date action, and existing severity/status controls invoke only their UI callbacks', () => {
  const events = [];
  const element = AlertsFilters({ selectedSeverity: 'all', selectedStatus: 'all', selectedDate: '2026-11-09',
    onSelectSeverity: value => events.push(['severity', value]),
    onSelectStatus: value => events.push(['status', value]),
    onSelectDate: value => events.push(['date', value]),
  });
  const all = nodes(element);
  all.find(node => node.type === 'input').props.onChange({ target: { value: '2026-11-08' } });
  all.find(node => typeof node.type === 'function' && node.type.name === 'Button').props.onClick();
  all.find(node => node.props['aria-label'] === 'Filter by severity').props.onChange({ target: { value: 'critical' } });
  all.find(node => node.props['aria-label'] === 'Filter by status').props.onChange({ target: { value: 'active' } });
  assert.deepEqual(events, [['date', '2026-11-08'], ['date', ''], ['severity', 'critical'], ['status', 'active']]);
  const html = renderToStaticMarkup(element);
  assert.match(html, /type="date"/);
  assert.match(html, /UTC\+8/);
  assert.match(html, /loaded alert history only/);
});

test('individual alert expansion and acknowledgement still use the original alert id', () => {
  const events = [];
  const element = list([fixture('active')], { selectedAlertId: 'active',
    onToggleAlert: id => events.push(['toggle', id]),
    onAcknowledgeAlert: id => events.push(['acknowledge', id]),
  });
  const all = nodes(element);
  all.find(node => node.props['aria-controls'] === 'alert-details-active').props.onClick();
  all.find(node => typeof node.type === 'function' && node.type.name === 'Button').props.onClick();
  assert.deepEqual(events, [['toggle', 'active'], ['acknowledge', 'active']]);
});

test('changing any list filter resets pagination without changing queries', () => {
  const view = readFileSync(new URL('views/Alerts.tsx', root), 'utf8');
  assert.match(view, /filterAlertsByDate\(alerts\.filteredAlerts, selectedDate\)/);
  assert.match(view, /key=\{`\$\{selectedDate\}:\$\{alerts\.selectedSeverity\}:\$\{alerts\.selectedStatus\}`\}/);
  assert.match(view, /onAcknowledgeAlert=\{alerts\.actions\.acknowledgeAlert\}/);
});
