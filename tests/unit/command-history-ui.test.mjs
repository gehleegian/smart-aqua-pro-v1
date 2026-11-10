import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const componentUrl = new URL('../../src/components/monitoring/CommandHistory.tsx', import.meta.url);

// Render the real component with a read-only subscription snapshot. No Firebase
// connection, command publishing, device access or fabricated sensor telemetry.
function renderHistory(snapshot, aquariumId = 'tank-a') {
  function load(url) {
    const source = readFileSync(url, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const commonJsModule = { exports: {} };
    const require = specifier => {
      if (specifier === 'react') return { ...React, useState: () => [snapshot, () => {}], useEffect: () => {} };
      if (specifier === 'firebase/firestore') return {};
      if (specifier === '../firebase') return { db: null };
      if (specifier.startsWith('.')) {
        const suffix = specifier.includes('commandLogService') ? '.ts' : '.tsx';
        return load(new URL(specifier + suffix, url));
      }
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, commonJsModule, commonJsModule.exports);
    return commonJsModule.exports;
  }
  const { CommandHistory } = load(componentUrl);
  return renderToStaticMarkup(React.createElement(CommandHistory, { aquariumId }));
}

const entry = {
  id: 'command-1', type: 'set_light_state', state: 'On', status: 'no_response',
  source: 'app', requestedByName: 'Caretaker', requestedAt: 1794000000000,
  executedAt: null, error: null, lateAck: false,
};
const snapshot = entries => ({ aquariumId: 'tank-a', entries, error: '' });

test('history is a native, initially collapsed disclosure with an aquarium-specific reset', () => {
  const html = renderHistory(snapshot([entry]));
  assert.match(html, /<details class="group">/);
  assert.doesNotMatch(html, /<details[^>]*\bopen(?:=|\s|>)/);
  assert.match(html, /<summary[^>]*focus-visible/);
  assert.match(html, /1 recent command</);
  assert.match(html, /group-open:hidden">Show/);
  assert.match(html, /group-open:inline">Hide/);
  assert.match(readFileSync(componentUrl, 'utf8'), /<details key=\{aquariumId\}/);
});

test('all fetched commands remain available inside a bounded keyboard-scrollable list', () => {
  const entries = Array.from({ length: 30 }, (_, i) => ({ ...entry, id: `command-${i}`, requestedByName: `Caretaker ${i}` }));
  const html = renderHistory(snapshot(entries));
  assert.match(html, /30 recent commands/);
  assert.equal((html.match(/<li /g) ?? []).length, 30);
  assert.match(html, /<ul aria-label="Recent commands" tabindex="0"[^>]*max-h-80 overflow-y-auto/);
  assert.match(html, /Caretaker 29/);
  assert.match(html, /Light on/);
  assert.match(html, /No response/);
  assert.match(html, /does not mean the command failed/);
});

test('loading and empty states remain clear inside and outside the disclosure', () => {
  const loading = renderHistory(null);
  assert.match(loading, /Loading history/);
  assert.match(loading, /role="status">Loading/);
  const empty = renderHistory(snapshot([]));
  assert.match(empty, /No commands yet/);
  assert.match(empty, /No commands sent yet/);
  assert.doesNotMatch(empty, /<ul/);
});

test('a history error is visible in the collapsed summary and is not mistaken for an empty history', () => {
  const html = renderHistory({ aquariumId: 'tank-a', entries: [], error: 'History connection unavailable.' });
  assert.match(html, /History unavailable/);
  assert.match(html, /role="status">History connection unavailable\./);
  assert.doesNotMatch(html, /No commands sent yet/);
});

test('switching aquariums does not render the previous aquarium history', () => {
  const html = renderHistory(snapshot([entry]), 'tank-b');
  assert.match(html, /Loading history/);
  assert.doesNotMatch(html, /Caretaker|Light on|1 recent command/);
});

test('scheduled command details and existing device status semantics are preserved', () => {
  const html = renderHistory(snapshot([{ ...entry, source: 'schedule', status: 'done',
    executedAt: 1794000001000, error: 'Device detail', requestedByName: '<script>unsafe</script>' }]));
  assert.match(html, /aria-label="Scheduled"/);
  assert.match(html, />Done</);
  assert.match(html, /device:/);
  assert.match(html, /Device detail/);
  assert.match(html, /&lt;script&gt;unsafe&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
