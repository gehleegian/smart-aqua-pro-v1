import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

function list() {
  const h = paginationUiHarness({ mocks: { '../../hooks/useNow': { useNow: () => 0 } } });
  return { h, Component: h.load(new URL('../../src/components/monitoring/UserAquariumList.tsx', import.meta.url)).UserAquariumList };
}
test('caretaker list distinguishes the selected organization from the signed-in account', () => {
  const { h, Component } = list();
  const { html } = h.render(Component, { aquariums: [], userName: 'User 2', organizationName: 'User 1', membershipRole: 'caretaker', onRefresh() {}, onSelectAquarium() {} });
  assert.match(html, /Organization: User 1/);
  assert.match(html, /Signed in as User 2 · Caretaker/);
});
test('owner list labels owner membership without impersonating another account', () => {
  const { h, Component } = list();
  const { html } = h.render(Component, { aquariums: [], userName: 'User 1', organizationName: 'Aquarium team', membershipRole: 'owner', onRefresh() {}, onSelectAquarium() {} });
  assert.match(html, /Organization: Aquarium team/);
  assert.match(html, /Signed in as User 1 · Owner/);
});
test('missing organization does not substitute the current account as owner', () => {
  const { h, Component } = list();
  const { html } = h.render(Component, { aquariums: [], userName: 'User 2', onRefresh() {}, onSelectAquarium() {} });
  assert.match(html, /No organization selected/);
  assert.ok(!html.includes('Organization: User 2'));
});
test('Monitoring passes active organization and role, and updates context in aquarium details', () => {
  let active = { orgId: 'org-1', org: { name: 'User 1' } };
  let selectedAquarium = null;
  const aq = { id: 'assigned', name: 'Assigned aquarium' };
  const h = paginationUiHarness({ mocks: {
    '../hooks/useOrg': { useOrg: () => ({ active, role: 'caretaker', isOwner: false }) },
    '../hooks/useMonitoringController': { useMonitoringController: () => ({ loading: false, userRole: 'User', userName: 'User 2', aquariums: [aq], selectedAquarium, actions: {}, automationSettings: {}, manualActions: {} }) },
    '../services/tankFocus': { requestTankFocus() {} },
    '../components/monitoring/UserAquariumList': { UserAquariumList: () => null },
    '../components/monitoring/AquariumDetailsView': { AquariumDetailsView: () => null },
    '../components/monitoring/AutomationSettingsModal': { AutomationSettingsModal: () => null },
    '../components/monitoring/AdminMonitoringView': { AdminMonitoringView: () => null },
  } });
  const Page = h.load(new URL('../../src/views/Monitoring.tsx', import.meta.url)).default;
  const render = () => h.render(Page, { onNavigate() {} });
  const props = render().nodes.find(node => node.props.membershipRole === 'caretaker').props;
  assert.equal(props.organizationName, 'User 1');
  assert.equal(props.userName, 'User 2');
  selectedAquarium = aq;
  assert.match(render().html, /Organization: User 1/);
  active = { orgId: 'org-2', org: { name: 'Another team' } };
  const html = render().html;
  assert.match(html, /Organization: Another team/);
  assert.ok(!html.includes('Organization: User 1'));
});
