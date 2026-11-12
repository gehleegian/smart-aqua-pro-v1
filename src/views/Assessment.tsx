import { ArrowLeft } from 'lucide-react';
import { AssessmentDetails } from '../components/condition/AssessmentDetails';
import { RecommendationsPanel } from '../components/condition/RecommendationsPanel';
import Button from '../components/ui/Button';
import { Card, CardContent } from '../components/ui/Card';
import LoadingState from '../components/ui/LoadingState';
import StatusMessage from '../components/ui/StatusMessage';
import { useDashboardController } from '../hooks/useDashboardController';
import { requestTankFocus } from '../services/tankFocus';

export default function Assessment({ onNavigate }: { onNavigate: (page: string) => void }) {
  // Reuse the existing member-scoped, read-only data and assessment pipeline.
  const dashboard = useDashboardController();
  if (dashboard.loading) return <LoadingState label="Loading assessment..." />;
  if (dashboard.error) return <StatusMessage variant="error">{dashboard.error}</StatusMessage>;

  const tank = dashboard.selectedTank;
  if (!tank) {
    return <Card><CardContent><p className="text-sm text-slate-300">No aquariums available for assessment.</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="w-full sm:w-auto sm:min-w-64">
          <label htmlFor="assessment-aquarium" className="mb-2 block text-sm font-medium text-slate-300">Aquarium</label>
          <select id="assessment-aquarium" value={tank.id} onChange={(event) => dashboard.actions.selectTank(event.target.value)} className="formal-input px-3">
            {dashboard.liveAquariums.map((aquarium) => <option key={aquarium.id} value={aquarium.id}>{aquarium.name}</option>)}
          </select>
        </div>
        <Button variant="secondary" onClick={() => { requestTankFocus(tank.id); onNavigate('monitoring'); }}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to monitoring
        </Button>
      </div>
      <p className="text-sm text-slate-400">Review {tank.name}&apos;s condition, assessment details, and calibration limits here. Live readings and equipment controls remain in Monitoring.</p>
      {dashboard.liveDataError ? <StatusMessage variant="warning">{dashboard.liveDataError}</StatusMessage> : null}
      {dashboard.ruleConfigError ? <StatusMessage variant="warning">{dashboard.ruleConfigError}</StatusMessage> : null}
      <AssessmentDetails assessment={tank.assessment} />
      <RecommendationsPanel aquariumId={tank.id} aquariumName={tank.name} assessment={tank.assessment} thresholds={tank.thresholds} rules={dashboard.rules} cleaning={tank.engineState?.cleaning ?? null} />
    </div>
  );
}
