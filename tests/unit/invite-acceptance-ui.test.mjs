import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

function setup({ ids = ['invited-tank'], failRefresh = false } = {}) {
  const calls = [];
  let failures = failRefresh ? 1 : 0;
  const h = paginationUiHarness({ mocks: {
    '../firebase': { auth: { currentUser: { uid: 'caretaker', email: 'caretaker@example.test' } } },
    '../services/orgService': {
      acceptInvite: async () => { calls.push('accept'); return { orgId: 'invited-org', aquariumIds: ids }; },
      refreshOrgContext: async () => { calls.push('refresh'); if (failures-- > 0) throw new Error('Retry membership refresh'); },
    },
    '../services/orgContext': {
      readPendingInvite: () => 'isolated-test-token',
      clearPendingInvite: () => calls.push('clear'),
      setActiveOrg: id => calls.push(`org:${id}`),
    },
    '../services/tankFocus': { requestTankFocus: id => calls.push(`focus:${id}`) },
  } });
  const Component = h.load(new URL('../../src/views/AcceptInvite.tsx', import.meta.url)).default;
  const render = () => h.render(Component, { onNavigate: page => calls.push(`navigate:${page}`) });
  const click = async () => {
    const button = render().nodes.find(node => node.props.children === 'Accept invite' && node.props.onClick);
    button.props.onClick();
    await new Promise(resolve => setImmediate(resolve));
  };
  return { calls, click, render };
}

test('acceptance opens the returned organization and invited tank before dashboard navigation', async () => {
  const h = setup(); await h.click();
  assert.deepEqual(h.calls, ['accept', 'refresh', 'org:invited-org', 'focus:invited-tank', 'clear', 'navigate:dashboard']);
});
test('membership refresh failure can retry without consuming the single-use invite again', async () => {
  const h = setup({ failRefresh: true }); await h.click();
  assert.match(h.render().html, /Retry membership refresh/);
  assert.ok(!h.calls.includes('clear'));
  await h.click();
  assert.equal(h.calls.filter(call => call === 'accept').length, 1);
  assert.equal(h.calls.at(-1), 'navigate:dashboard');
});
test('removed invited tanks clear any previous tank focus', async () => {
  const h = setup({ ids: [] }); await h.click();
  assert.ok(h.calls.includes('focus:'));
});
test('org-scoped pages remount on account, organization and role changes, but invite stays mounted', () => {
  const layout = readFileSync(new URL('../../src/components/layout/Layout.tsx', import.meta.url), 'utf8');
  assert.match(layout, /key=\{pageId === 'invite' \? `\$\{user.id\}:invite` : `\$\{user.id\}:\$\{org.active\?\.orgId \?\? ''\}:\$\{navRole\}`\}/);
});
