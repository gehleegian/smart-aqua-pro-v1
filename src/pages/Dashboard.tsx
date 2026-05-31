import { Card, CardContent } from '../components/ui/Card';
import { AdminDashboardView } from '../components/dashboard/AdminDashboardView';
import { UserDashboardView } from '../components/dashboard/UserDashboardView';
import { useDashboardController } from '../hooks/useDashboardController';
import { getDashboardEmptyMessage } from '../utils/dashboardHelpers';

export default function Dashboard() {
  const dashboard = useDashboardController();

  const liveDataWarning = dashboard.liveDataError ? (
    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-200">
      {dashboard.liveDataError}
    </div>
  ) : null;

  if (dashboard.loading) {
    return <div className="text-slate-300">Loading dashboard...</div>;
  }

  if (dashboard.error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
        {dashboard.error}
      </div>
    );
  }

  if (dashboard.liveAquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">{getDashboardEmptyMessage(dashboard.userRole)}</p>
        </CardContent>
      </Card>
    );
  }

  if (dashboard.userRole === 'Admin') {
    return (
      <AdminDashboardView
        liveDataWarning={liveDataWarning}
        summaryCards={dashboard.adminSummaryCards}
        ownerGroups={dashboard.ownerGroups}
        ownersNeedingAttention={dashboard.ownersNeedingAttention}
        ownersMostTanks={dashboard.ownersMostTanks}
        selectedOwnerId={dashboard.selectedOwnerId}
        selectedOwnerGroup={dashboard.selectedOwnerGroup}
        selectedTankId={dashboard.selectedTankId}
        stats={dashboard.stats}
        adminAlerts={dashboard.adminAlerts}
        adminActivities={dashboard.adminActivities}
        onSelectOwner={dashboard.actions.selectOwner}
        onSelectTank={dashboard.actions.selectTank}
      />
    );
  }

  return (
    <UserDashboardView
      liveDataWarning={liveDataWarning}
      summaryCards={dashboard.userSummaryCards}
      aquariums={dashboard.liveAquariums}
      selectedTankId={dashboard.selectedTankId}
      stats={dashboard.stats}
      userAlerts={dashboard.userAlerts}
      userActivities={dashboard.userActivities}
      onSelectTank={dashboard.actions.selectTank}
    />
  );
}
