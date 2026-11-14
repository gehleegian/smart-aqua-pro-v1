// Execute the actual component with isolated hook state and deferred services.
// No Firebase initialization, network calls, telemetry or database writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import * as jsxRuntime from 'react/jsx-runtime';
import ts from 'typescript';

const compiled = ts.transpileModule(readFileSync(new URL('../../src/views/Reports.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const tick = () => new Promise(resolve => setImmediate(resolve));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const report = id => ({ id, periodLabel: id, reportType: 'weekly', generatedAt: 0, summary: id });

function setup() {
  let active;
  const timers = new Map();
  const lists = [], generations = [], files = [], selections = [], opened = [];
  const tanks = [{ id: 'tank-a', name: 'Aquarium A' }, { id: 'tank-b', name: 'Aquarium B' }];
  const window = {
    setTimeout(fn) { const id = Symbol(); timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); },
    open: (...args) => opened.push(args),
  };
  const cell = initial => {
    const i = active.cursor++;
    if (!(i in active.cells)) active.cells[i] = initial();
    return [active, i];
  };
  const useState = initial => {
    const [instance, i] = cell(() => ({ value: typeof initial === 'function' ? initial() : initial }));
    const state = instance.cells[i];
    state.set ??= value => {
      instance.writes++;
      state.value = typeof value === 'function' ? value(state.value) : value;
    };
    return [state.value, state.set];
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    ...React, useState,
    useRef: initial => { const [instance, i] = cell(() => ({ current: initial })); return instance.cells[i]; },
    useId: () => { const [, i] = cell(() => null); return `field-${i}`; },
    useCallback: (fn, deps) => {
      const [instance, i] = cell(() => null);
      if (!sameDeps(instance.cells[i]?.deps, deps)) instance.cells[i] = { fn, deps };
      return instance.cells[i].fn;
    },
    useEffect: (fn, deps) => {
      const [instance, i] = cell(() => null);
      if (!sameDeps(instance.cells[i]?.deps, deps)) instance.pending.push(() => {
        instance.cells[i]?.cleanup?.();
        instance.cells[i] = { deps, cleanup: fn() };
      });
    },
  };
  const mocks = {
    react,
    'react/jsx-runtime': jsxRuntime,
    'lucide-react': new Proxy({}, { get: () => 'icon' }),
    '../firebase': { auth: { currentUser: { uid: 'isolated-user' } } },
    '../hooks/usePageSelection': { usePageSelection: (_page, field) => {
      const [value, setValue] = useState(field === 'aquarium' ? 'tank-a' : '');
      const setSelection = react.useCallback(next => { selections.push(field); setValue(next); }, [setValue]);
      return [value, setSelection];
    } },
    '../services/aquariumService': { getAquariumsByOwner: async () => tanks },
    '../services/reportsService': {
      listReports: id => { const d = deferred(); lists.push({ id, ...d }); return d.promise; },
      generateReport: request => { const d = deferred(); generations.push({ request, ...d }); return d.promise; },
      reportFileUrl: path => { const d = deferred(); files.push({ path, ...d }); return d.promise; },
    },
    '../components/ui/Card': { Card: 'card', CardContent: 'content', CardHeader: 'header' },
    '../components/reports/ReportSummaryView': { __esModule: true, default: 'summary', manilaDateTime: () => 'date' },
  };
  const commonJsModule = { exports: {} };
  new Function('require', 'module', 'exports', 'window', compiled)(specifier => {
    if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
    if (specifier.startsWith('../components/ui/')) return { __esModule: true, default: specifier };
    throw new Error(`Unmocked import ${specifier}`);
  }, commonJsModule, commonJsModule.exports, window);
  function instance(Component, props = {}) {
    const state = { cells: [], cursor: 0, pending: [], writes: 0 };
    return {
      state,
      render() {
        active = state; state.cursor = 0;
        const result = Component(props);
        active = undefined;
        state.pending.splice(0).forEach(fn => fn());
        return result;
      },
      unmount() { state.cells.forEach(value => value?.cleanup?.()); },
    };
  }
  const parent = instance(commonJsModule.exports.default);
  function nodes(element) {
    const found = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      found.push(node); React.Children.forEach(node.props.children, visit);
    }
    visit(element); return found;
  }
  function flushTimers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); }
  function mountSelected() {
    const element = parent.render();
    const child = instance(element.type, element.props);
    child.render(); flushTimers();
    return { ...child, key: element.key };
  }
  function switchTo(child, id) {
    nodes(child.render()).find(node => node.type === 'select' && node.props.value.startsWith('tank-')).props.onChange({ target: { value: id } });
    child.unmount();
    return mountSelected();
  }
  const refresh = child => nodes(child.render()).find(node => node.props['aria-label'] === 'Refresh the list of reports').props.onClick();
  const generate = child => nodes(child.render()).find(node => node.type === 'form').props.onSubmit({ preventDefault() {} });
  const text = child => nodes(child.render()).flatMap(node => React.Children.toArray(node.props.children).filter(value => typeof value === 'string')).join(' ');
  return { parent, lists, generations, files, selections, opened, mountSelected, switchTo, refresh, generate, text, nodes };
}

async function ready() {
  const h = setup(); h.parent.render(); await tick();
  return { ...h, a: h.mountSelected() };
}

test('switching aquarium immediately hides old reports and rejects late responses, including A → B → A', async () => {
  const h = await ready();
  h.lists[0].resolve([report('A original')]); await tick();
  assert.match(h.text(h.a), /A original/);
  h.refresh(h.a);
  const b = h.switchTo(h.a, 'tank-b');
  assert.equal(b.key, 'tank-b');
  assert.doesNotMatch(h.text(b), /A original/);
  h.lists[2].resolve([report('B latest')]); await tick();
  const writes = h.a.state.writes, selections = h.selections.length;
  h.lists[1].resolve([report('A stale')]); await tick();
  assert.equal(h.a.state.writes, writes);
  assert.equal(h.selections.length, selections);
  assert.match(h.text(b), /B latest/);
  const a2 = h.switchTo(b, 'tank-a');
  assert.equal(a2.key, 'tank-a');
  assert.doesNotMatch(h.text(a2), /A original|A stale|B latest/);
  h.lists[3].resolve([report('A fresh')]); await tick();
  assert.match(h.text(a2), /A fresh/);
});

for (const failure of [false, true]) {
  test(`only newest refresh may update reports or selection (older ${failure ? 'failure' : 'success'})`, async () => {
    const h = await ready(); h.refresh(h.a);
    h.lists[1].resolve([report('newest')]); await tick();
    const writes = h.a.state.writes, selections = h.selections.length;
    if (failure) h.lists[0].reject(new Error('stale failure'));
    else h.lists[0].resolve([report('outdated')]);
    await tick();
    assert.equal(h.a.state.writes, writes);
    assert.equal(h.selections.length, selections);
    assert.match(h.text(h.a), /newest/);
    assert.doesNotMatch(h.text(h.a), /outdated|could not be loaded/);
  });
}

for (const failure of [false, true]) {
  test(`generation ${failure ? 'failure' : 'success'} after switching cannot refresh, select or notify in the new aquarium`, async () => {
    const h = await ready(); const pending = h.generate(h.a);
    assert.equal(h.generations[0].request.aquariumId, 'tank-a');
    const b = h.switchTo(h.a, 'tank-b');
    const writes = h.a.state.writes, selections = h.selections.length;
    if (failure) h.generations[0].reject(new Error('old generation failed'));
    else h.generations[0].resolve({ reportId: 'old-generated' });
    await pending;
    assert.deepEqual(h.lists.map(call => call.id), ['tank-a', 'tank-b']);
    assert.equal(h.a.state.writes, writes);
    assert.equal(h.selections.length, selections);
    assert.doesNotMatch(h.text(b), /Report ready|old generation failed/);
  });
}

test('switch during post-generation refresh cannot publish the old generated selection', async () => {
  const h = await ready(); const pending = h.generate(h.a);
  h.generations[0].resolve({ reportId: 'generated-a' }); await tick();
  const b = h.switchTo(h.a, 'tank-b');
  const writes = h.a.state.writes, selections = h.selections.length;
  h.lists[1].resolve([report('generated-a')]); await pending;
  assert.equal(h.a.state.writes, writes);
  assert.equal(h.selections.length, selections);
  assert.doesNotMatch(h.text(b), /generated-a|Report ready/);
});

test('current generation selects its returned report rather than a different first report', async () => {
  const h = await ready(); const pending = h.generate(h.a);
  h.generations[0].resolve({ reportId: 'generated' }); await tick();
  h.lists[1].resolve([report('other'), report('generated')]); await pending;
  assert.match(h.text(h.a), /Report ready/);
  const selected = h.nodes(h.a.render()).find(node => node.props['aria-pressed'] === true);
  assert.equal(selected.props.variant, 'primary');
  assert.match(h.text(h.a), /generated/);
  // The selected summary is the generated report, not the first list entry.
  const summary = h.nodes(h.a.render()).find(node => node.props.variant === 'warning');
  assert.equal(summary.props.children.at(-1), 'generated');
});

test('an outstanding download does not open a file after leaving that aquarium', async () => {
  const h = await ready();
  h.lists[0].resolve([{ ...report('a-file'), pdfPath: 'isolated/a.pdf' }]); await tick();
  const download = h.nodes(h.a.render()).find(node => node.props['aria-label'] === 'Download PDF for a-file');
  download.props.onClick();
  h.switchTo(h.a, 'tank-b');
  h.files[0].resolve('https://example.invalid/isolated.pdf'); await tick();
  assert.equal(h.opened.length, 0);
});
