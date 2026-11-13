import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

// Presentation fixtures only: no device readings, Firebase subscriptions or writes.
function renderDetails(telemetrySource = 'unavailable') {
  const events = [];
  const unexpectedVolumeWork = () => { throw new Error('Hidden water-volume card must not mount or load history'); };
  const h = paginationUiHarness({ mocks: {
    '../../hooks/useNow': { useNow: () => 0 },
    '../../services/deviceService': { getDeviceTelemetryHistory: unexpectedVolumeWork },
    '../../utils/dataLogsHelpers': { buildDateKeys: unexpectedVolumeWork, formatDateKey: unexpectedVolumeWork },
    '../../utils/waterVolumeCalculations': {
      calculateCurrentWaterVolume: unexpectedVolumeWork,
      calculateHistoricalWaterLoss: unexpectedVolumeWork,
    },
    '../../utils/waterLevelProfile': { evaluateWaterLevelProfile: unexpectedVolumeWork },
    '../../utils/sensorDisplay': {
      getSensorDisplay: () => ({ value: '--', status: 'Waiting for telemetry' }),
      getTurbidityDisplay: () => ({ value: '--', status: 'Waiting for telemetry' }),
    },
    './CommandHistory': {
      CommandHistory: () => React.createElement('p', null, 'Command history'),
      CommandStatusBadge: () => null,
    },
    '../maintenance/MaintenanceHistory': {
      MaintenanceHistory: () => React.createElement('p', null, 'Maintenance history'),
    },
    '../maintenance/LogMaintenanceModal': { LogMaintenanceModal: () => null },
  } });
  const { AquariumDetailsView } = h.load(new URL('../../src/components/monitoring/AquariumDetailsView.tsx', import.meta.url));
  return { ...h.render(AquariumDetailsView, {
    aquarium: {
      id: 'tank-a', name: 'Aquarium A', species: ['Goldfish'], telemetrySource,
      telemetryState: 'offline', hasFreshTelemetry: false,
      assessment: { overallSeverity: 'unavailable' }, commandStatus: 'none',
      tankLengthCm: 50, tankWidthCm: 25, tankHeightCm: 30, workingWaterVolumeLiters: 20,
    },
    automationEnabled: false, automationSettings: {},
    manualActions: Object.fromEntries(['feeder', 'light', 'filter'].map(field => [field, {
      status: 'Ready', buttonLabel: `Run ${field}`, disabled: false,
    }])),
    savingAutomation: false, savingAutomationEnabled: false, savingMode: false,
    savingSystemKey: '', systemError: '', systemMode: 'manual', controlsDisabled: false,
    onAutomationToggle() {}, onBack() {}, onOpenAssessment() {}, onOpenRecommendations() {},
    onManualAction: field => events.push(field), onModeChange() {}, onOpenAutomationEditor() {}, onRefresh() {},
  }), events };
}

test('Monitoring hides the water-volume card without mounting its history/calculation work', () => {
  for (const source of ['live', 'unavailable']) {
    const view = renderDetails(source);
    assert.doesNotMatch(view.html, /Water volume and observed loss|Current volume unavailable|Historical loss unavailable|Observed decrease/);
    assert.match(view.html, /Water Level/);
    assert.match(view.html, /Aquarium Profile/);
    assert.match(view.html, /Operational water volume/);
    assert.match(view.html, /20 L/);
    assert.match(view.html, /Maintenance history/);
    assert.match(view.html, /Command history/);
  }
});

test('hiding the informational card preserves manual equipment actions', () => {
  const view = renderDetails();
  assert.match(view.html, /Manual Controls/);
  const button = view.nodes.find(node => node.type === 'button' && node.props.children === 'Run light');
  assert.ok(button);
  button.props.onClick();
  assert.deepEqual(view.events, ['light']);
});
