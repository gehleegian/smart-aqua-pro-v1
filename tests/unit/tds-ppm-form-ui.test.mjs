// Server-rendered form fixtures only; no subscriptions or live writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { createEmptyAquariumForm } from '../../src/utils/aquariumManagementHelpers.ts';
import { seedRuleConfig } from '../helpers/seedRuleConfig.mjs';

const nodeRequire = createRequire(import.meta.url);
const url = new URL('../../src/components/aquariums/AquariumFormModal.tsx', import.meta.url);
function renderForm(saving = false) {
  const fields = [], changes = [];
  function load(file) {
    const compiled = ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const loaded = { exports: {} };
    const require = specifier => {
      if (specifier.endsWith('/hooks/useRuleConfig')) return { useRuleConfig: () => seedRuleConfig({ approved: true }) };
      if (specifier === '../ui/Modal') return { __esModule: true, default: ({ children }) => React.createElement('div', null, children) };
      if (specifier === '../ui/Input') {
        const component = load(new URL('../ui/Input.tsx', file)).default;
        return { __esModule: true, default: props => { fields.push(props); return React.createElement(component, props); } };
      }
      if (specifier.startsWith('.')) {
        const target = [specifier, specifier + '.tsx', specifier + '.ts'].map(path => new URL(path, file)).find(existsSync);
        assert.ok(target, specifier);
        return load(target);
      }
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, loaded, loaded.exports);
    return loaded.exports;
  }
  const { AquariumFormModal } = load(url);
  const html = renderToStaticMarkup(React.createElement(AquariumFormModal, {
    formData: { ...createEmptyAquariumForm(), minQuality: '69', minTdsPpm: '150', maxTdsPpm: '250' },
    formMode: 'edit', saving, error: '', currentUserRole: 'User', selectedOwnerName: '',
    onClose() {}, onSave() {}, onFishWeightChange() {}, onFieldChange: (...args) => changes.push(args),
  }));
  return { html, fields, changes };
}

test('edit form renders separate accessible minimum/maximum ppm inputs, not the legacy purity input', () => {
  const { html, fields, changes } = renderForm();
  assert.match(html, /Minimum TDS \(ppm\)/);
  assert.match(html, /Maximum TDS \(ppm\)/);
  assert.doesNotMatch(html, /Minimum TDS Purity % \(legacy\)/);
  const min = fields.find(field => field.label === 'Minimum TDS (ppm)');
  const max = fields.find(field => field.label === 'Maximum TDS (ppm)');
  assert.equal(min.type, 'number');
  assert.equal(min.min, '0');
  assert.equal(min.step, 'any');
  assert.equal(min.value, '150');
  assert.equal(max.value, '250');
  min.onChange({ target: { value: '167.5' } });
  max.onChange({ target: { value: '280' } });
  assert.deepEqual(changes, [['minTdsPpm', '167.5'], ['maxTdsPpm', '280']]);
});

test('saving disables both ppm inputs to prevent editing an in-flight profile', () => {
  const { fields } = renderForm(true);
  assert.equal(fields.find(field => field.label === 'Minimum TDS (ppm)').disabled, true);
  assert.equal(fields.find(field => field.label === 'Maximum TDS (ppm)').disabled, true);
});
