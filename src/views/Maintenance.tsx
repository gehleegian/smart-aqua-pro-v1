import { ArrowLeft } from 'lucide-react';
import { NextCleaningCard } from '../components/condition/NextCleaningCard';
import { MaintenanceHistory } from '../components/maintenance/MaintenanceHistory';
import Button from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import LoadingState from '../components/ui/LoadingState';
import StatusMessage from '../components/ui/StatusMessage';
import { useDashboardController } from '../hooks/useDashboardController';
import { requestTankFocus } from '../services/tankFocus';

export default function Maintenance({ onNavigate }: { onNavigate: (page: string) => void }) {
  // Reuse member-scoped aquariums and live server cleaning summaries.
  const dashboard = useDashboardController('maintenance');
  if (dashboard.loading) return <LoadingState label="Loading maintenance..." />;
  if (dashboard.error) return <StatusMessage variant="error">{dashboard.error}</StatusMessage>;

  const tank = dashboard.selectedTank;
  if (!tank) {
    return <Card><CardContent><p className="text-sm text-slate-300">No aquariums available for maintenance.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-full sm:w-auto sm:min-w-64">
          <label htmlFor="maintenance-aquarium" className="mb-2 block text-sm font-medium text-slate-300">Aquarium</label>
          <select id="maintenance-aquarium" value={tank.id} onChange={(event) => dashboard.actions.selectTank(event.target.value)} className="formal-input px-3">
            {dashboard.liveAquariums.map((aquarium) => <option key={aquarium.id} value={aquarium.id}>{aquarium.name}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={() => { requestTankFocus(tank.id); onNavigate('monitoring'); }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to monitoring
        </Button>
      </div>
      <p className="text-sm text-slate-400">Record completed cleaning and water changes for {tank.name}, review the next cleaning date, and browse maintenance history.</p>
      {tank.telemetrySource === 'simulated' ? (
        <StatusMessage variant="warning">Maintenance logging and history are not available for simulated telemetry.</StatusMessage>
      ) : (
        <div key={tank.id} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <NextCleaningCard aquariumId={tank.id} aquariumName={tank.name} cleaning={tank.engineState?.cleaning ?? null} now={dashboard.telemetryNow} />
          <MaintenanceHistory aquariumId={tank.id} />
        </div>
      )}
    </div>
  );
}
