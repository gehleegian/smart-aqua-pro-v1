import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

test('rule configuration uses one shared listener pair and closes after the last subscriber', () => {
  const opened = [];
  const listeners = new Map();
  const h = paginationUiHarness({ mocks: {
    '../firebase': { db: {} },
    'firebase/firestore': {
      collection: (_db, path) => path,
      doc: (_db, ...path) => path.join('/'),
      onSnapshot: (path, callback) => {
        opened.push(path); listeners.set(path, callback);
        return () => { opened.push(`stop:${path}`); listeners.delete(path); };
      },
    },
  } });
  const { subscribeToRuleConfig } = h.load(new URL('../../src/services/ruleConfigService.ts', import.meta.url));
  const first = [], second = [];
  const stopFirst = subscribeToRuleConfig(value => first.push(value));
  listeners.get('species')({ docs: [] });
  listeners.get('rules')({ docs: [] });
  const stopSecond = subscribeToRuleConfig(value => second.push(value));
  assert.deepEqual(opened, ['species', 'rules']);
  assert.equal(first.at(-1).loaded, true);
  assert.equal(second.length, 1, 'a late subscriber gets the cached snapshot at once');
  assert.equal(second[0].loaded, true);
  stopFirst();
  assert.equal(listeners.size, 2);
  stopSecond();
  stopSecond();
  assert.equal(listeners.size, 0);
  subscribeToRuleConfig(() => {})();
  assert.deepEqual(opened.filter(item => item === 'species').length, 2, 'reopened fresh after full release');
});
