import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const componentUrl = new URL('../../src/components/condition/NextCleaningCard.tsx', import.meta.url);
// Offline UI fixtures: never load a Firebase service or submit maintenance.
const now = Date.UTC(2026, 0, 15);
const cleaning = {
  status: 'scheduled', nextCleaningDue: now + 86400000,
  lastCleanedAt: now - 9 * 86400000, lastCleanedSource: 'maintenance_actions',
  intervalDays: 10, bioloadLevel: 'moderate', reason: 'interval', evaluatedAt: now,
};

function createCard(overrides = {}) {
  const state = [];
  let cursor = 0;
  function LogMaintenanceModal() {
    return React.createElement('div', { 'data-testid': 'maintenance-modal' });
  }
  function load(url) {
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const loadedModule = { exports: {} };
    const require = specifier => {
      if (specifier === 'react') return { ...React, useState(initial) {
        const slot = cursor++;
        if (!(slot in state)) state[slot] = typeof initial === 'function' ? initial() : initial;
        return [state[slot], value => { state[slot] = typeof value === 'function' ? value(state[slot]) : value; }];
      } };
      if (specifier === '../maintenance/LogMaintenanceModal') return { LogMaintenanceModal };
      if (specifier.startsWith('.')) return load(new URL(specifier + '.tsx', url));
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  const { NextCleaningCard } = load(componentUrl);
  return {
    render() {
      cursor = 0;
      const element = NextCleaningCard({ aquariumId: 'tank-a', aquariumName: 'Aquarium A', cleaning, now, ...overrides });
      const nodes = [];
      function visit(node) {
        if (!React.isValidElement(node)) return;
        nodes.push(node);
        React.Children.forEach(node.props.children, visit);
      }
      visit(element);
      return {
        html: renderToStaticMarkup(element),
        topLevel: React.Children.toArray(element.props.children),
        button: nodes.find(node => node.type.name === 'Button'),
        maintenanceButton: nodes.find(node => node.type.name === 'Button' && node.props.children === 'View maintenance history'),
        modal: nodes.find(node => node.type === LogMaintenanceModal),
      };
    },
  };
}

test('next-cleaning card has an accessible maintenance shortcut without altering the schedule', () => {
  const { html, button, modal } = createCard().render();
  assert.match(html, /Next cleaning/);
  assert.match(html, /Regular interval for this bioload/);
  assert.match(html, /Bioload moderate/);
  assert.match(html, /every 10 days/);
  assert.match(html, /Log cleaning \/ water change/);
  assert.equal(button.props.type, 'button');
  assert.equal(button.props['aria-haspopup'], 'dialog');
  assert.equal(modal, undefined);
});

test('click opens the existing maintenance form for the selected aquarium; cancel closes it', () => {
  const card = createCard({ aquariumId: 'tank-b', aquariumName: 'Aquarium B' });
  card.render().button.props.onClick();
  const { modal, topLevel } = card.render();
  assert.equal(modal.props.aquariumId, 'tank-b');
  assert.equal(modal.props.aquariumName, 'Aquarium B');
  assert.equal(modal.props.recommendation, null, 'do not mark an unrelated recommendation applied');
  assert.equal(topLevel[0].type.name, 'Card');
  assert.equal(topLevel[1].type, modal.type, 'keep the viewport dialog outside the backdrop-filtered card');
  modal.props.onClose();
  const closed = card.render();
  assert.equal(closed.modal, undefined);
  assert.doesNotMatch(closed.html, /Maintenance logged/);
});

test('only a successful log shows confirmation; reopening clears the previous notice', () => {
  const card = createCard();
  card.render().button.props.onClick();
  const { modal } = card.render();
  modal.props.onLogged('Maintenance logged. A new cleaning cycle starts from this date.');
  modal.props.onClose();
  const saved = card.render();
  assert.equal(saved.modal, undefined);
  assert.match(saved.html, /role="status"/);
  assert.match(saved.html, /Maintenance logged\. A new cleaning cycle starts from this date\./);
  saved.button.props.onClick();
  assert.doesNotMatch(card.render().html, /Maintenance logged/);
});

test('maintenance can be logged before the schedule exists or while its inputs are unavailable', () => {
  for (const value of [null, { ...cleaning, status: 'unavailable', nextCleaningDue: null, reason: 'bioload_unknown' }]) {
    const card = createCard({ cleaning: value });
    const initial = card.render();
    assert.match(initial.html, value ? /Add fish weights and working volume/ : /schedule appears once/);
    initial.button.props.onClick();
    assert.equal(card.render().modal.props.aquariumId, 'tank-a');
  }
  assert.match(createCard({ cleaning: { ...cleaning, nextCleaningDue: now } }).render().html, /Due now/);
});

test('dashboard keys the card by aquarium so switching tanks cannot retain its dialog or notice', () => {
  const source = readFileSync(new URL('../../src/components/dashboard/UserDashboardView.tsx', import.meta.url), 'utf8');
  assert.match(source, /<NextCleaningCard key=\{selectedTank\.id\} aquariumId=\{selectedTank\.id\} aquariumName=\{selectedTank\.name\}/);
  assert.doesNotMatch(readFileSync(componentUrl, 'utf8'), /logMaintenance\(|updateDoc|setDoc|refreshCleaningSchedule/);
});

test('optional history link opens the dedicated page without opening a logging dialog', () => {
  let navigations = 0;
  const card = createCard({ onOpenMaintenance: () => { navigations++; } });
  const initial = card.render();
  assert.match(initial.html, /View maintenance history/);
  initial.maintenanceButton.props.onClick();
  assert.equal(navigations, 1);
  assert.equal(card.render().modal, undefined);
  assert.equal(createCard().render().maintenanceButton, undefined, 'no self-navigation link on the Maintenance page');
  const dashboard = readFileSync(new URL('../../src/components/dashboard/UserDashboardView.tsx', import.meta.url), 'utf8');
  assert.match(dashboard, /onOpenMaintenance=\{\(\) => \{ requestTankFocus\(selectedTank\.id\); onNavigate\('maintenance'\); \}\}/);
});
