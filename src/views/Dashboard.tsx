import { Fish } from 'lucide-react';
import Button from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import LoadingState from '../components/ui/LoadingState';
import StatusMessage from '../components/ui/StatusMessage';
import { AdminDashboardView } from '../components/dashboard/AdminDashboardView';
import { UserDashboardView } from '../components/dashboard/UserDashboardView';
import { useDashboardController } from '../hooks/useDashboardController';
import { getDashboardEmptyMessage } from '../utils/dashboardHelpers';

export default function Dashboard({ onNavigate }: { onNavigate: (page: string) => void }) {
  const dashboard = useDashboardController();

  const liveDataWarning = dashboard.liveDataError ? (
    <StatusMessage variant="warning">{dashboard.liveDataError}</StatusMessage>
  ) : null;

  if (dashboard.loading) {
    return <LoadingState label="Loading dashboard..." />;
  }

  if (dashboard.error) {
    return <StatusMessage variant="error">{dashboard.error}</StatusMessage>;
  }

  if (dashboard.userRole === 'Admin') {
    return (
      <AdminDashboardView
        summaryCards={dashboard.adminSummaryCards}
        users={dashboard.adminUsers}
        aquariums={dashboard.aquariumDirectory}
        onNavigate={onNavigate}
      />
    );
  }

  if (dashboard.liveAquariums.length === 0 || !dashboard.selectedTank) {
    return (
      <Card>
        <EmptyState icon={Fish} message={getDashboardEmptyMessage(dashboard.userRole)}>
          <Button onClick={() => onNavigate('aquariums')}>Add your first aquarium</Button>
        </EmptyState>
      </Card>
    );
  }

  return (
    <UserDashboardView
      liveDataWarning={liveDataWarning}
      summaryCards={dashboard.userSummaryCards}
      aquariums={dashboard.liveAquariums}
      selectedTank={dashboard.selectedTank}
      stats={dashboard.stats}
      telemetryNow={dashboard.telemetryNow}
      userAlerts={dashboard.userAlerts}
      userActivities={dashboard.userActivities}
      onNavigate={onNavigate}
      onSelectTank={dashboard.actions.selectTank}
      rules={dashboard.rules}
    />
  );
}
