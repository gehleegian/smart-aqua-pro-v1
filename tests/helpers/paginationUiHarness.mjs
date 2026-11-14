// Isolated UI snapshots only: no Firebase initialization, telemetry or writes.
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
export function paginationUiHarness({ seeds = [], mocks = {} } = {}) {
  const cells = [...seeds];
  let cursor = 0;
  let adjusted = false;
  const react = {
    ...React,
    useEffect() {},
    // Memoization is a render optimization, not part of isolated UI behavior.
    useMemo(factory) { return factory(); },
    useState(initial) {
      const slot = cursor++;
      if (!(slot in cells)) cells[slot] = typeof initial === 'function' ? initial() : initial;
      return [cells[slot], value => {
        cells[slot] = typeof value === 'function' ? value(cells[slot]) : value;
        adjusted = true;
      }];
    },
  };
  const modules = new Map();
  function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const compiled = ts.transpileModule(readFileSync(url, 'utf8'), { compilerOptions: {
      module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
    } }).outputText;
    const commonJsModule = { exports: {} };
    const require = specifier => {
      if (specifier === 'react') return react;
      if (Object.hasOwn(mocks, specifier)) return mocks[specifier];
      if (specifier.startsWith('.')) {
        const target = ['.ts', '.tsx', '.mjs', ''].map(ext => new URL(specifier + ext, url))
          .find(candidate => existsSync(candidate));
        if (!target) throw new Error('Unresolved UI import: ' + specifier);
        return load(target);
      }
      return nodeRequire(specifier);
    };
    new Function('require', 'module', 'exports', compiled)(require, commonJsModule, commonJsModule.exports);
    modules.set(url.href, commonJsModule.exports);
    return commonJsModule.exports;
  }
  function render(Component, props) {
    let element;
    let attempts = 0;
    do {
      adjusted = false; cursor = 0;
      element = Component(props);
      if (++attempts > 10) throw new Error('UI state did not settle.');
    } while (adjusted);
    const nodes = [];
    function visit(node) {
      if (!React.isValidElement(node)) return;
      nodes.push(node);
      if (typeof node.type === 'function') visit(node.type(node.props));
      else React.Children.forEach(node.props.children, visit);
    }
    visit(element);
    return { element, nodes, html: renderToStaticMarkup(element) };
  }
  return { load, render, setSlot: (slot, value) => { cells[slot] = value; } };
}
