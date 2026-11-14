import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

function setup({ tanks = [{ id: 'assigned-a', name: 'Aquarium A' }, { id: 'assigned-b', name: 'Aquarium B' }], admin = false, owner = false } = {}) {
  const selected = [];
  const state = { loading: false, error: '', userRole: admin ? 'Admin' : 'User', aquariums: tanks,
    selectedAquarium: tanks[0], automationSettings: {}, manualActions: {},
    actions: { selectAquarium: tank => selected.push(tank.id) } };
  const h = paginationUiHarness({ mocks: {
    '../hooks/useMonitoringController': { useMonitoringController: () => state },
    '../hooks/useOrg': { useOrg: () => ({ isOwner: owner }) },
    '../services/tankFocus': { requestTankFocus() {} },
    '../components/monitoring/AquariumDetailsView': { AquariumDetailsView: () => null },
    '../components/monitoring/AutomationSettingsModal': { AutomationSettingsModal: () => null },
    '../components/monitoring/AdminMonitoringView': { AdminMonitoringView: () => null },
    '../components/monitoring/UserAquariumList': { UserAquariumList: () => null },
  } });
  const Page = h.load(new URL('../../src/views/Monitoring.tsx', import.meta.url)).default;
  return { selected, render: () => h.render(Page, { onNavigate() {} }) };
}

test('caretaker selector shows assigned tanks and switches by ID, not name/index', () => {
  const h = setup(); const rendered = h.render();
  const selector = rendered.nodes.find(node => node.type === 'select');
  assert.equal(selector.props.value, 'assigned-a');
  assert.deepEqual(rendered.nodes.filter(node => node.type === 'option').map(node => node.props.value), ['assigned-a', 'assigned-b']);
  assert.match(rendered.html, /assigned to you in this organization/);
  selector.props.onChange({ target: { value: 'assigned-b' } });
  assert.deepEqual(h.selected, ['assigned-b']);
  selector.props.onChange({ target: { value: 'unassigned-tank' } });
  assert.deepEqual(h.selected, ['assigned-b']);
});
test('single assigned aquarium remains visible in selector', () => {
  const h = setup({ tanks: [{ id: 'only-tank', name: 'Only tank' }] });
  assert.match(h.render().html, /Only tank/);
});
test('empty caretaker assignment explains owner assignment instead of adding a tank', () => {
  const rendered = setup({ tanks: [] }).render();
  assert.match(rendered.html, /Ask the owner to check your tank assignments/);
  assert.ok(!rendered.html.includes('<select'));
});
test('platform admin monitoring does not expose the user selector', () => {
  assert.ok(!setup({ admin: true }).render().html.includes('<select'));
});
