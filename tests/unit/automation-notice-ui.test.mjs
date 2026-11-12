import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

function renderAutomation({ error = '', enabled = false } = {}) {
  const events = [];
  const h = paginationUiHarness({ seeds: [[{
    id: 'tank-a', name: 'Aquarium A', automationSettings: {
      enabled, feedingTimes: ['08:00'], lightOnTime: '06:00', lightOffTime: '18:00',
      filtrationStartTime: '08:00', filtrationRuntimeHours: 8,
    },
  }], error], mocks: {
    '../hooks/useRuleConfig': { useRuleConfig: () => { throw new Error('Automation must not subscribe to the removed rule list'); } },
    '../hooks/useNow': { useNow: () => 0 },
    '../firebase': { auth: { currentUser: null } },
    '../services/aquariumService': { getAquariumsByOwner: () => { throw new Error('Unexpected backend call'); } },
    '../services/tankFocus': { requestTankFocus: id => events.push(['focus', id]) },
    '../utils/monitoringHelpers': { getAutomationSettings: aquarium => aquarium.automationSettings },
    '../utils/schedule': { SCHEDULE_TIME_ZONE: 'Asia/Manila', nextScheduledText: () => 'Next scheduled event' },
  } });
  const Automation = h.load(new URL('../../src/views/Automation.tsx', import.meta.url)).default;
  return { ...h.render(Automation, { onNavigate: page => events.push(['navigate', page]) }), events };
}

test('automation timezone is neutral information, not a yellow hardware warning', () => {
  const view = renderAutomation();
  assert.match(view.html, /All schedule times use Asia\/Manila \(UTC\+8\)\./);
  const note = view.nodes.find(node => node.type === 'p' && String(node.props.children).includes('All schedule times use'));
  assert.ok(note);
  assert.equal(note.props.className, 'text-sm text-slate-400');
  assert.equal(note.props.role, undefined);
  assert.doesNotMatch(view.html, /firmware-changes|hardware testing|Wi-Fi drops|border-amber-400\/30/);
  assert.match(view.html, /Automation off/);
});

test('real schedule errors and existing enabled state/edit navigation remain unchanged', () => {
  const view = renderAutomation({ error: 'Schedules could not be loaded.', enabled: true });
  assert.match(view.html, /role="alert"/);
  assert.match(view.html, /Schedules could not be loaded\./);
  assert.match(view.html, /Automation on/);
  assert.match(view.html, /Next scheduled event/);
  assert.deepEqual(view.events, []);
  const edit = view.nodes.find(node => node.type === 'button' && node.props.children.includes('Edit schedule'));
  assert.ok(edit);
  edit.props.onClick();
  assert.deepEqual(view.events, [['focus', 'tank-a'], ['navigate', 'monitoring']]);
});

test('Automation shows saved equipment schedules without the read-only rules section', () => {
  const view = renderAutomation();
  assert.doesNotMatch(view.html, /Rule-Based Automation|Live IF-THEN rules|Loading rules|No rules are stored/);
  assert.match(view.html, /Aquarium A/);
  assert.match(view.html, /Feeding/);
  assert.match(view.html, /Light/);
  assert.match(view.html, /Filter/);
  assert.match(view.html, /Edit schedule/);
});
