import { Activity } from 'lucide-react';
import { Card } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { AdminMonitoringView } from '../components/monitoring/AdminMonitoringView';
import { AquariumDetailsView } from '../components/monitoring/AquariumDetailsView';
import { AutomationSettingsModal } from '../components/monitoring/AutomationSettingsModal';
import { UserAquariumList } from '../components/monitoring/UserAquariumList';
import { useMonitoringController } from '../hooks/useMonitoringController';
import StatusMessage from '../components/ui/StatusMessage';
import LoadingState from '../components/ui/LoadingState';

export default function Monitoring() {
  const monitoring = useMonitoringController();
  const { actions } = monitoring;
  const liveDataWarning = monitoring.liveDataError ? (
    <StatusMessage variant="warning">{monitoring.liveDataError}</StatusMessage>
  ) : null;

  if (monitoring.loading) {
    return <LoadingState label="Loading monitoring data..." />;
  }

  if (monitoring.error) {
    return (
      <StatusMessage variant="error">{monitoring.error}</StatusMessage>
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
        <EmptyState icon={Activity} message="No monitoring data available. Add an aquarium first." />
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
    return <LoadingState label="Loading aquarium details..." />;
  }

  return (
    <div className="space-y-6">
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
    </div>
  );
}
