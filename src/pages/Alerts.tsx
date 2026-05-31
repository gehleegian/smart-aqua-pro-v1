import { AlertsFilters } from '../components/alerts/AlertsFilters';
import { AlertsList } from '../components/alerts/AlertsList';
import { AlertsSidebar } from '../components/alerts/AlertsSidebar';
import { AlertsSummaryGrid } from '../components/alerts/AlertsSummaryGrid';
import { Card, CardContent } from '../components/ui/Card';
import { useAlertsController } from '../hooks/useAlertsController';

export default function Alerts() {
  const alerts = useAlertsController();

  if (alerts.loading) {
    return <div className="text-slate-300">Loading alerts...</div>;
  }

  if (alerts.error && alerts.aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">{alerts.error}</p>
        </CardContent>
      </Card>
    );
  }

  if (alerts.aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">
            {alerts.userRole === 'Admin'
              ? 'No aquarium records are available yet.'
              : 'You do not have any aquariums to monitor alerts for yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <AlertsSummaryGrid
        criticalCount={alerts.summaryCounts.criticalCount}
        warningCount={alerts.summaryCounts.warningCount}
        acknowledgedCount={alerts.summaryCounts.acknowledgedCount}
        resolvedCount={alerts.summaryCounts.resolvedCount}
      />

      {alerts.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
          {alerts.error}
        </div>
      ) : null}

      {alerts.liveDataError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
          {alerts.liveDataError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <AlertsFilters
            selectedSeverity={alerts.selectedSeverity}
            selectedStatus={alerts.selectedStatus}
            onSelectSeverity={alerts.actions.selectSeverity}
            onSelectStatus={alerts.actions.selectStatus}
          />

          <AlertsList
            title={alerts.panelTitle}
            alerts={alerts.filteredAlerts}
            selectedAlertId={alerts.selectedAlertId}
            userRole={alerts.userRole}
            onToggleAlert={alerts.actions.toggleSelectedAlert}
            onAcknowledgeAlert={alerts.actions.acknowledgeAlert}
          />
        </div>

        <AlertsSidebar
          distribution={alerts.distribution}
          recentResolvedAlerts={alerts.recentResolvedAlerts}
          totalOpenAlerts={alerts.openAlertCount}
        />
      </div>
    </div>
  );
}
