import { Card, CardContent } from '../components/ui/Card';
import { AdminMonitoringView } from '../components/monitoring/AdminMonitoringView';
import { AquariumDetailsView } from '../components/monitoring/AquariumDetailsView';
import { AutomationSettingsModal } from '../components/monitoring/AutomationSettingsModal';
import { UserAquariumList } from '../components/monitoring/UserAquariumList';
import { useMonitoringController } from '../hooks/useMonitoringController';

export default function Monitoring() {
  const monitoring = useMonitoringController();
  const { actions } = monitoring;
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
