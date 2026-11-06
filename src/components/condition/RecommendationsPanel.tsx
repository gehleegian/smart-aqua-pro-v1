import { useRecommendations } from '../../hooks/useRecommendations';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

// Pending recommendations from the rules engine. Applied / Dismiss only change
// the recommendation's status; full maintenance logging comes in Sprint 4.
export function RecommendationsPanel({ aquariumId }: { aquariumId: string }) {
  const { recommendations, error, savingId, setStatus } = useRecommendations(aquariumId);
  const pending = recommendations.filter((item) => item.status === 'pending');

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Recommendations</h3>
        <span className="text-xs text-slate-400">{pending.length} pending</span>
      </CardHeader>
      <CardContent>
        {error ? <p className="mb-3 text-sm text-amber-300">{error}</p> : null}
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending recommendations.</p>
        ) : (
          <ul className="space-y-3">
            {pending.map((item) => (
              <li key={item.id} className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium text-white">{item.title}</p>
                  <div className="flex gap-2">
                    {item.ruleStatus === 'draft' ? <Badge variant="info">Draft rule</Badge> : null}
                    <Badge variant={item.severity === 'critical' ? 'danger' : 'warning'}>{item.severity}</Badge>
                  </div>
                </div>
                <p className="mt-1 text-sm text-slate-300">{item.issueDetected}</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Check first</dt>
                    <dd className="text-slate-200">{item.preCheck}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Action</dt>
                    <dd className="text-slate-200">{item.action}</dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">Why</dt>
                    <dd className="text-slate-300">{item.basis}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" disabled={savingId === item.id} onClick={() => void setStatus(item.id, 'applied')}>
                    Applied
                  </Button>
                  <Button size="sm" variant="secondary" disabled={savingId === item.id} onClick={() => void setStatus(item.id, 'dismissed')}>
                    Dismiss
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
