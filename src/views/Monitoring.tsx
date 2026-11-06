import { Card, CardContent } from '../components/ui/Card';
import { AdminMonitoringView } from '../components/monitoring/AdminMonitoringView';
import { AquariumDetailsView } from '../components/monitoring/AquariumDetailsView';
import { AutomationSettingsModal } from '../components/monitoring/AutomationSettingsModal';
import { UserAquariumList } from '../components/monitoring/UserAquariumList';
import { useMonitoringController } from '../hooks/useMonitoringController';
import type { SimulationScenario } from '../types/monitoring';
import Button from '../components/ui/Button';
import { useOrg } from '../hooks/useOrg';

export default function Monitoring() {
  const monitoring = useMonitoringController();
  const { isOwner } = useOrg();
  const { actions } = monitoring;
  const simulationPanel = process.env.NODE_ENV !== 'production' ? (
    <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-amber-200">Development telemetry simulator</p>
          <p className="mt-1 text-xs text-amber-100/80">
            Simulated readings stay in this browser, are never saved to Firebase, and cannot operate equipment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            aria-label="Simulation scenario"
            value={monitoring.simulationScenario}
            disabled={!monitoring.simulationEnabled}
            onChange={(event) => actions.setSimulationScenario(event.target.value as SimulationScenario)}
            className="rounded-lg border border-amber-300/30 bg-slate-950 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            <option value="normal">Normal</option>
            <option value="warning">Warning</option>
            <option value="critical">Critical</option>
          </select>
          <Button
            type="button"
            variant={monitoring.simulationEnabled ? 'danger' : 'secondary'}
            onClick={() => actions.setSimulationEnabled(!monitoring.simulationEnabled)}
          >
            {monitoring.simulationEnabled ? 'Stop simulation' : 'Start simulation'}
          </Button>
        </div>
      </div>
    </div>
  ) : null;
  const liveDataWarning = monitoring.liveDataError ? (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
      {monitoring.liveDataError}
    </div>
  ) : null;

  if (monitoring.loading) {
    return <div className="text-slate-300">Loading monitoring data...</div>;
  }

  if (monitoring.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
        {monitoring.error}
      </div>
    );
  }

  if (monitoring.userRole === 'Admin') {
    return (
      <div className="space-y-6">
        {simulationPanel}
        {liveDataWarning}
        <AdminMonitoringView
          ownerCards={monitoring.ownerCards}
          selectedOwner={monitoring.selectedOwner}
          onBackToUsers={actions.backToUsers}
          onRefresh={() => void actions.loadMonitoringData()}
          onSelectOwner={(owner) => actions.selectOwner(owner.id)}
        />
      </div>
    );
  }

  if (monitoring.aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">No monitoring data available. Add an aquarium first.</p>
        </CardContent>
      </Card>
    );
  }

  if (!monitoring.selectedAquarium) {
    return (
      <div className="space-y-6">
        {simulationPanel}
        {liveDataWarning}
        <UserAquariumList
          aquariums={monitoring.aquariums}
          userName={monitoring.userName}
          onRefresh={() => void actions.loadMonitoringData()}
          onSelectAquarium={actions.selectAquarium}
        />
      </div>
    );
  }

  if (!monitoring.automationSettings || !monitoring.manualActions) {
    return null;
  }

  return (
    <>
      {simulationPanel}
      {liveDataWarning}
      <AquariumDetailsView
        aquarium={monitoring.selectedAquarium}
        automationEnabled={monitoring.automationEnabled}
        automationSettings={monitoring.automationSettings}
        manualActions={monitoring.manualActions}
        savingAutomation={monitoring.savingAutomation}
        savingAutomationEnabled={monitoring.savingAutomationEnabled}
        savingMode={monitoring.savingMode}
        savingSystemKey={monitoring.savingSystemKey}
        systemError={monitoring.systemError}
        systemMode={monitoring.systemMode}
        controlsDisabled={monitoring.simulationEnabled}
        canManage={isOwner}
        onAutomationToggle={() => void actions.handleAutomationEnabledToggle()}
        onBack={actions.backToAquariums}
        onManualAction={(field) => void actions.handleManualAction(field)}
        onModeChange={(mode) => void actions.handleSystemModeChange(mode)}
        onOpenAutomationEditor={actions.openAutomationEditor}
        onRefresh={() => void actions.loadMonitoringData()}
        onSystemToggle={(field) => void actions.handleSystemToggle(field)}
      />

      {monitoring.showAutomationModal && (
        <AutomationSettingsModal
          aquariumName={monitoring.selectedAquarium.name}
          draft={monitoring.automationDraft}
          error={monitoring.automationError}
          saving={monitoring.savingAutomation}
          onAddFeedingTime={actions.addFeedingTime}
          onClose={actions.closeAutomationEditor}
          onDraftChange={actions.updateAutomationDraft}
          onRemoveFeedingTime={actions.removeFeedingTime}
          onSave={() => void actions.handleAutomationSave()}
          onUpdateFeedingTime={actions.updateFeedingTime}
        />
      )}
    </>
  );
}
