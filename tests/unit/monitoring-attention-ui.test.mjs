// Isolated assessment/UI fixtures. No Firebase, telemetry publishing, or device writes.
import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

const parameter = (parameter, severity, value, label = parameter) => ({ parameter, severity, value, label,
  status: severity, notMonitored: false, message: `${label}: existing assessment explanation.` });
const valid = () => ({ status: 'valid' });
function aquarium(overrides = {}) {
  return { id: 'tank-a', name: 'Aquarium A', species: ['Goldfish'], temp: 24, level: 90, tdsPpm: 800, ph: 9.1,
    telemetryState: 'live', telemetrySource: 'live', hasFreshTelemetry: true,
    hasFreshWaterLevelTelemetry: true, hasFreshTemperatureTelemetry: true, hasFreshPhTelemetry: true,
    hasFreshTurbidityTelemetry: true, hasFreshPowerTelemetry: false, commandStatus: 'none',
    sensorValidity: { temperature: valid(), ph: valid(), tds: valid(), waterLevel: valid(), turbidity: valid(), allValid: true },
    assessment: { source: 'live', overallSeverity: 'critical', origin: 'server', draft: false,
      parameters: [parameter('tds', 'warning', 800, 'TDS'), parameter('ph', 'critical', 9.1, 'pH'), parameter('temperature', 'normal', 24, 'Temperature')],
      faults: [], recommendations: [], ruleNotes: [], matchedRules: [] }, ...overrides };
}
function setup() {
  const h = paginationUiHarness({ mocks: {
    '../../hooks/useNow': { useNow: () => 0 },
    '../../services/deviceService': { getDeviceTelemetryHistory() { throw new Error('Hidden volume history must not load'); } },
    './CommandHistory': { CommandHistory: () => null, CommandStatusBadge: () => null },
    '../maintenance/MaintenanceHistory': { MaintenanceHistory: () => null },
    '../maintenance/LogMaintenanceModal': { LogMaintenanceModal: () => null },
  } });
  const components = h.load(new URL('../../src/components/monitoring/MonitoringAttention.tsx', import.meta.url));
  const { AquariumDetailsView } = h.load(new URL('../../src/components/monitoring/AquariumDetailsView.tsx', import.meta.url));
  const events = [];
  const props = {
    aquarium: aquarium(), automationEnabled: false, automationSettings: {}, manualActions: Object.fromEntries(['feeder', 'light', 'filter'].map(key => [key, { status: 'Ready', buttonLabel: key, disabled: false }])),
    systemMode: 'manual', savingSystemKey: '', systemError: '', controlsDisabled: false,
    onBack() {}, onRefresh() {}, onModeChange() {}, onAutomationToggle() {}, onManualAction() {}, onOpenAutomationEditor() {},
    onOpenRecommendations: () => events.push('recommendations:tank-a'), onOpenAssessment: () => events.push('assessment:tank-a'),
    thresholds: { values: { ph: { min: 7, max: 8 }, tdsPpm: { min: 50, max: 400 } } },
  };
  return { h, components, AquariumDetailsView, props, events };
}

test('critical banner guides users to recommendations and shows only affected readings below the grid', () => {
  const { h, AquariumDetailsView: Details, props, events } = setup();
  const view = h.render(Details, props);
  assert.match(view.html, /Critical condition detected/);
  assert.match(view.html, /Check Recommendations for recommended actions/);
  assert.match(view.html, /Configured range: 7 to 8/);
  assert.match(view.html, /Assessed value: 9.1/);
  assert.match(view.html, /pH: existing assessment explanation/);
  const start = view.html.indexOf('Readings needing attention');
  assert.ok(start > view.html.indexOf('Equipment Diagnostic'));
  assert.ok(start < view.html.indexOf('Aquarium Profile'));
  const summary = view.html.slice(start, view.html.indexOf('Aquarium Profile'));
  assert.ok(summary.indexOf('pH') < summary.indexOf('TDS'));
  assert.doesNotMatch(summary, /Temperature: existing assessment explanation/);
  const highlighted = view.nodes.filter(node => node.type === 'div' && node.props.className?.includes('border-rose-400/50'));
  assert.equal(highlighted.length, 1);
  view.nodes.find(node => node.type === 'button' && node.props.children === 'Check Recommendations').props.onClick();
  assert.deepEqual(events, ['recommendations:tank-a']);
});

test('warning notice includes requested guidance wording without claiming a guaranteed solution', () => {
  const { h, components: c } = setup();
  const aq = aquarium(); aq.assessment.parameters = [parameter('tds', 'warning', 800, 'TDS')];
  const attention = c.monitoringAttention(aq);
  const view = h.render(c.MonitoringAttentionBanner, { aquarium: aq, attention, onRecommendations() {}, onAssessment() {} });
  assert.match(view.html, /Some readings need attention. Check Recommendations for guidance on what to do next/);
  assert.doesNotMatch(view.html, /Critical condition detected|guaranteed|solution/i);
});

test('sensor faults stay separate and never highlight invalid samples as bad water', () => {
  const { h, AquariumDetailsView: Details, props } = setup();
  const aq = aquarium();
  aq.sensorValidity.ph = { status: 'invalid', reason: 'pH validity flag is false' };
  aq.hasFreshPhTelemetry = false;
  const view = h.render(Details, { ...props, aquarium: aq });
  assert.match(view.html, /Sensor checks needed/);
  assert.match(view.html, /pH validity flag is false/);
  assert.match(view.html, /TDS: existing assessment explanation/);
  assert.doesNotMatch(view.html, /Assessed value: 9.1|pH: existing assessment explanation|Critical condition detected/);
});

test('fault-only state links to assessment, not a water-condition solution', () => {
  const { h, AquariumDetailsView: Details, props, events } = setup();
  const aq = aquarium();
  aq.assessment.parameters = [];
  aq.sensorValidity.ph = { status: 'invalid', reason: 'Probe diagnostic invalid' };
  const view = h.render(Details, { ...props, aquarium: aq });
  assert.match(view.html, /Sensor check needed/);
  assert.doesNotMatch(view.html, /Readings needing attention|Check Recommendations for/);
  view.nodes.find(node => node.type === 'button' && node.props.children === 'Check Assessment').props.onClick();
  assert.deepEqual(events, ['assessment:tank-a']);
});

test('normal recovery removes notice and issue summary; offline/stale data cannot retain warning styles', () => {
  const { h, AquariumDetailsView: Details, props } = setup();
  h.render(Details, props);
  const normal = aquarium(); normal.assessment.parameters = [parameter('ph', 'normal', 8, 'pH')]; normal.assessment.overallSeverity = 'normal';
  let view = h.render(Details, { ...props, aquarium: normal });
  assert.doesNotMatch(view.html, /Readings needing attention|Monitoring attention notice|Sensor checks needed/);
  for (const state of ['offline', 'unavailable']) {
    view = h.render(Details, { ...props, aquarium: aquarium({ hasFreshTelemetry: false, telemetryState: state, telemetrySource: 'unavailable' }) });
    assert.match(view.html, /Current water conditions cannot be confirmed/);
    assert.doesNotMatch(view.html, /Readings needing attention|Critical condition detected|border-rose-400\/50/);
  }
});

test('unmonitored parameters and missing assessment/configuration never become abnormal findings', () => {
  const { h, components: c } = setup();
  const aq = aquarium(); aq.assessment.parameters = [{ ...parameter('equipment', 'warning', 'Unknown'), notMonitored: true }];
  assert.equal(c.monitoringAttention(aq).findings.length, 0);
  aq.assessment.overallSeverity = 'unavailable';
  const view = h.render(c.MonitoringAttentionBanner, { aquarium: aq, attention: c.monitoringAttention(aq), onRecommendations() {}, onAssessment() {} });
  assert.match(view.html, /Assessment unavailable/);
  assert.doesNotMatch(view.html, /needs attention|looks stable/);
});

test('missing configured limits are explicit, never replaced with hardcoded defaults', () => {
  const { h, components: c } = setup();
  const view = h.render(c.MonitoringProblemSummary, { attention: c.monitoringAttention(aquarium()), thresholds: null });
  assert.match(view.html, /Configured limits unavailable/);
  assert.doesNotMatch(view.html, /Configured range:/);
});

test('categorical turbidity findings do not invent numeric NTU readings or ranges', () => {
  const { h, components: c } = setup();
  const aq = aquarium(); aq.assessment.parameters = [parameter('turbidity', 'warning', 'Cloudy', 'Turbidity')];
  const view = h.render(c.MonitoringProblemSummary, { attention: c.monitoringAttention(aq), thresholds: { values: { turbidity: { min: 0, max: 100 } } } });
  assert.match(view.html, /Assessed value: Cloudy/);
  assert.doesNotMatch(view.html, /NTU|Configured range:|Configured limits unavailable/);
});

test('recommendation navigation retains the selected aquarium using the existing focus mechanism', () => {
  const events = [];
  const aq = aquarium();
  const h = paginationUiHarness({ mocks: {
    '../hooks/useOrg': { useOrg: () => ({ isOwner: true }) },
    '../hooks/useMonitoringController': { useMonitoringController: () => ({ userRole: 'User', aquariums: [aq], selectedAquarium: aq,
      automationSettings: {}, manualActions: {}, actions: {}, selectedThresholds: { values: {} } }) },
    '../services/tankFocus': { requestTankFocus: id => events.push(id) },
    '../components/monitoring/AquariumDetailsView': { AquariumDetailsView: () => null },
  } });
  const { default: Monitoring } = h.load(new URL('../../src/views/Monitoring.tsx', import.meta.url));
  // Inspect the actual child props, avoiding effects/subscriptions and all device actions.
  const element = Monitoring({ onNavigate: page => events.push(page) });
  const child = element.props.children.find(node => node?.props?.onOpenRecommendations);
  assert.equal(child.props.aquarium.id, 'tank-a');
  child.props.onOpenRecommendations();
  assert.deepEqual(events, ['tank-a', 'recommendations']);
});
