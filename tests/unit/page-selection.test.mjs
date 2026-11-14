import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { readPageSelection, savePageSelection } from '../../src/services/pageSelection.ts';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

test('navigation selections survive reload and remain isolated by user, organization, role and page', () => {
  const values = new Map();
  globalThis.window = { sessionStorage: { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) } };
  const scope = 'user-a:org-a:caretaker:monitoring';
  savePageSelection(scope, 'aquarium', 'tank-b');
  assert.equal(readPageSelection(scope, 'aquarium'), 'tank-b');
  for (const other of ['user-b:org-a:caretaker:monitoring', 'user-a:org-b:caretaker:monitoring', 'user-a:org-a:owner:monitoring', 'user-a:org-a:caretaker:reports']) {
    assert.equal(readPageSelection(other, 'aquarium'), '');
  }
  savePageSelection(scope, 'aquarium', '');
  assert.equal(readPageSelection(scope, 'aquarium'), '', 'Back to aquarium list stays at list');
  delete globalThis.window;
});
test('blocked storage and malformed overlong navigation hints fail safely', () => {
  globalThis.window = { sessionStorage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } } };
  assert.equal(readPageSelection('scope', 'aquarium', 'default'), 'default');
  assert.doesNotThrow(() => savePageSelection('scope', 'aquarium', 'id'));
  globalThis.window.sessionStorage.getItem = () => 'x'.repeat(257);
  assert.equal(readPageSelection('scope', 'aquarium', 'default'), 'default');
  delete globalThis.window;
});
test('page hook restores selected aquarium and explicit navigation hint takes precedence', () => {
  globalThis.window = { sessionStorage: { getItem: () => 'remembered-tank' } };
  function restore(hint) {
    const h = paginationUiHarness({ mocks: {
      '../firebase': { auth: { currentUser: { uid: 'user-a' } } },
      '../services/orgContext': { getActiveMembership: () => ({ orgId: 'org-a', role: 'caretaker' }) },
    } });
    const { usePageSelection } = h.load(new URL('../../src/hooks/usePageSelection.ts', import.meta.url));
    let value;
    h.render(() => { [value] = usePageSelection('monitoring', 'aquarium', '', hint); return null; });
    return value;
  }
  assert.equal(restore(), 'remembered-tank');
  assert.equal(restore(() => 'notification-tank'), 'notification-tank');
  delete globalThis.window;
});
test('startup preserves saved page and organization until authentication is resolved', () => {
  const layout = readFileSync(new URL('../../src/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /if \(!loadingAuth\) clearOrgContext\(\)/);
  assert.match(layout, /if \(user && !loadingAuth\) localStorage.setItem\('currentPage', currentPage\)/);
});
test('restored report tank cannot trigger report lookup until authorized tank list confirms it', () => {
  const reports = readFileSync(new URL('../../src/views/Reports.tsx', import.meta.url), 'utf8');
  assert.match(reports, /if \(!aquariumId \|\| !aquariums\.some\(\(item\) => item.id === aquariumId\)\) return/);
  assert.match(reports, /<AquariumReports key=\{aquariumId\}/);
});
