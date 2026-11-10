import { ArrowLeft } from 'lucide-react';
import { RecommendationsPanel } from '../components/condition/RecommendationsPanel';
import Button from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import LoadingState from '../components/ui/LoadingState';
import StatusMessage from '../components/ui/StatusMessage';
import { useDashboardController } from '../hooks/useDashboardController';
import { requestTankFocus } from '../services/tankFocus';

export default function Recommendations({ onNavigate }: { onNavigate: (page: string) => void }) {
  // Use the same member-scoped aquarium selection as Assessment and Dashboard.
  const dashboard = useDashboardController();
  if (dashboard.loading) return <LoadingState label="Loading recommendations..." />;
  if (dashboard.error) return <StatusMessage variant="error">{dashboard.error}</StatusMessage>;

  const tank = dashboard.selectedTank;
  if (!tank) {
    return <Card><CardContent><p className="text-sm text-slate-300">No aquariums available for recommendations.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-full sm:w-auto sm:min-w-64">
          <label htmlFor="recommendations-aquarium" className="mb-2 block text-sm font-medium text-slate-300">Aquarium</label>
          <select id="recommendations-aquarium" value={tank.id} onChange={(event) => dashboard.actions.selectTank(event.target.value)} className="formal-input px-3">
            {dashboard.liveAquariums.map((aquarium) => <option key={aquarium.id} value={aquarium.id}>{aquarium.name}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={() => { requestTankFocus(tank.id); onNavigate('monitoring'); }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to monitoring
        </Button>
      </div>
      <p className="text-sm text-slate-400">Review {tank.name}&apos;s recommendations here. Check the guidance before taking action; live readings and equipment controls remain in Monitoring.</p>
      {tank.telemetrySource === 'simulated' ? (
        <StatusMessage variant="warning">Recommendations are not available for simulated telemetry.</StatusMessage>
      ) : (
        <RecommendationsPanel key={tank.id} aquariumId={tank.id} aquariumName={tank.name} defaultOpen />
      )}
    </div>
  );
}
