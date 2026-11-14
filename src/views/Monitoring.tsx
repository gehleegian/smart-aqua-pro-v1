import { Card, CardContent } from '../components/ui/Card';
import LoadingState from '../components/ui/LoadingState';
import { AdminMonitoringView } from '../components/monitoring/AdminMonitoringView';
import { AquariumDetailsView } from '../components/monitoring/AquariumDetailsView';
import { AutomationSettingsModal } from '../components/monitoring/AutomationSettingsModal';
import { UserAquariumList } from '../components/monitoring/UserAquariumList';
import { useMonitoringController } from '../hooks/useMonitoringController';
import { useOrg } from '../hooks/useOrg';
import { requestTankFocus } from '../services/tankFocus';

export default function Monitoring({ onNavigate }: { onNavigate: (page: string) => void }) {
  const monitoring = useMonitoringController();
  const { active, role, isOwner } = useOrg();
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
          <p className="text-slate-300">{isOwner ? 'No monitoring data available. Add an aquarium first.' : 'No aquariums are assigned to you in this organization. Ask the owner to check your tank assignments.'}</p>
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
          organizationName={active?.org.name}
          membershipRole={role}
          onRefresh={() => void actions.loadMonitoringData()}
          onSelectAquarium={actions.selectAquarium}
        />
      </div>
    );
  }

  if (!monitoring.automationSettings || !monitoring.manualActions) {
    // The selected tank is still resolving (never a blank page).
    return <LoadingState label="Loading aquarium..." />;
  }

  return (
    <>
      {liveDataWarning}
      <div className="mb-4 space-y-2">
        {active && <p className="text-sm text-slate-300">Organization: {active.org.name}</p>}
        <label htmlFor="monitoring-aquarium" className="block text-sm font-medium text-slate-200">Aquarium</label>
        <select
          id="monitoring-aquarium"
          value={monitoring.selectedAquarium.id}
          onChange={(event) => {
            const aquarium = monitoring.aquariums.find((item) => item.id === event.target.value);
            if (aquarium) actions.selectAquarium(aquarium);
          }}
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-3 text-sm text-white focus:border-teal-300 focus:outline-none focus:ring-2 focus:ring-teal-300/30 sm:max-w-md"
        >
          {monitoring.aquariums.map((aquarium) => (
            <option key={aquarium.id} value={aquarium.id}>{aquarium.name}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400">{isOwner ? 'Select an aquarium in this organization.' : 'Select an aquarium assigned to you in this organization.'}</p>
      </div>
      <AquariumDetailsView
        controlsDisabled={false}
        aquarium={monitoring.selectedAquarium}
        thresholds={monitoring.selectedThresholds}
        automationEnabled={monitoring.automationEnabled}
        automationSettings={monitoring.automationSettings}
        manualActions={monitoring.manualActions}
        savingAutomation={monitoring.savingAutomation}
        savingAutomationEnabled={monitoring.savingAutomationEnabled}
        savingMode={monitoring.savingMode}
        savingSystemKey={monitoring.savingSystemKey}
        systemError={monitoring.systemError}
        systemMode={monitoring.systemMode}
        canManage={isOwner}
        onAutomationToggle={() => void actions.handleAutomationEnabledToggle()}
        onBack={actions.backToAquariums}
        onOpenAssessment={() => {
          if (monitoring.selectedAquarium) {
            requestTankFocus(monitoring.selectedAquarium.id);
            onNavigate('assessment');
          }
        }}
        onOpenRecommendations={() => {
          if (monitoring.selectedAquarium) {
            requestTankFocus(monitoring.selectedAquarium.id);
            onNavigate('recommendations');
          }
        }}
        onManualAction={(field) => void actions.handleManualAction(field)}
        onModeChange={(mode) => void actions.handleSystemModeChange(mode)}
        onOpenAutomationEditor={actions.openAutomationEditor}
        onRefresh={() => void actions.loadMonitoringData()}
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
