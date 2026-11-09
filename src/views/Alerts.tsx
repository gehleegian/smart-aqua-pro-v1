import { AlertsFilters } from '../components/alerts/AlertsFilters';
import { AlertsList } from '../components/alerts/AlertsList';
import { AlertsSidebar } from '../components/alerts/AlertsSidebar';
import { AlertsSummaryGrid } from '../components/alerts/AlertsSummaryGrid';
import { Bell } from 'lucide-react';
import { Card } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { useAlertsController } from '../hooks/useAlertsController';
import StatusMessage from '../components/ui/StatusMessage';
import LoadingState from '../components/ui/LoadingState';
import { useState } from 'react';
import { filterAlertsByDate } from '../utils/alertsListPresentation';

export default function Alerts() {
  const alerts = useAlertsController();
  const [selectedDate, setSelectedDate] = useState('');
  const datedAlerts = filterAlertsByDate(alerts.filteredAlerts, selectedDate);

  if (alerts.loading) {
    return <LoadingState label="Loading alerts..." />;
  }

  if (alerts.error && alerts.aquariums.length === 0) {
    return (
      <StatusMessage variant="error">{alerts.error}</StatusMessage>
    );
  }

  if (alerts.aquariums.length === 0) {
    return (
      <Card>
        <EmptyState
          icon={Bell}
          message={
            alerts.userRole === 'Admin'
              ? 'No aquarium records are available yet.'
              : 'You do not have any aquariums to monitor alerts for yet.'
          }
        />
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
        <StatusMessage variant="error">{alerts.error}</StatusMessage>
      ) : null}

      {alerts.liveDataError ? (
        <StatusMessage variant="warning">{alerts.liveDataError}</StatusMessage>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <AlertsFilters
            selectedSeverity={alerts.selectedSeverity}
            selectedStatus={alerts.selectedStatus}
            onSelectSeverity={alerts.actions.selectSeverity}
            onSelectStatus={alerts.actions.selectStatus}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />

          <AlertsList
            key={`${selectedDate}:${alerts.selectedSeverity}:${alerts.selectedStatus}`}
            title={alerts.panelTitle}
            alerts={datedAlerts}
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
