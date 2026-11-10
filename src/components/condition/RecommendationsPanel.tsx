import { useState } from 'react';
import { ChevronDown, ClipboardList } from 'lucide-react';
import { useRecommendations } from '../../hooks/useRecommendations';
import { LogMaintenanceModal } from '../maintenance/LogMaintenanceModal';
import StatusMessage from '../ui/StatusMessage';
import type { Recommendation } from '../../types/recommendation';
import Badge from '../ui/Badge';
import { SeverityBadge } from './ConditionBadges';
import Button from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

const generatedAtFormatter = new Intl.DateTimeFormat('en-PH', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Manila',
});

const PARAMETER_LABELS: Record<string, { label: string; unit?: string }> = {
  temperatureC: { label: 'Temperature', unit: '°C' },
  ph: { label: 'pH' },
  tdsPpm: { label: 'TDS', unit: 'ppm' },
  turbidity: { label: 'Turbidity', unit: 'NTU' },
  waterLevelPercent: { label: 'Water level', unit: '%' },
  power: { label: 'Power' },
  equipment: { label: 'Equipment' },
  filter: { label: 'Filtration' },
  device: { label: 'Device' },
  maintenance: { label: 'Maintenance' },
};

function measurementText(item: Recommendation) {
  const value = item.readingSnapshot?.[item.parameter];
  if (typeof value !== 'number' && typeof value !== 'string') return 'Not available';
  const unit = PARAMETER_LABELS[item.parameter]?.unit;
  return `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
}

function thresholdText(item: Recommendation) {
  const unit = PARAMETER_LABELS[item.parameter]?.unit;
  const format = (value: number) => `${value}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`;
  if (item.threshold?.min !== undefined && item.threshold.max !== undefined) {
    return `${format(item.threshold.min)} to ${format(item.threshold.max)}`;
  }
  if (item.threshold?.min !== undefined) return `Minimum ${format(item.threshold.min)}`;
  if (item.threshold?.max !== undefined) return `Maximum ${format(item.threshold.max)}`;
  return null;
}

// Pending recommendations from the rules engine. Applied opens the
// maintenance log form (FR20): logging marks the recommendation applied.
// Dismiss only changes the status.
export function RecommendationsPanel({ aquariumId, aquariumName, defaultOpen = false }: { aquariumId: string; aquariumName?: string; defaultOpen?: boolean }) {
  const { recommendations, error, savingId, setStatus } = useRecommendations(aquariumId);
  const pending = recommendations.filter((item) => item.status === 'pending' && item.ruleStatus === 'approved');
  const withheld = recommendations.filter((item) => item.status === 'pending' && item.ruleStatus === 'draft');
  const [applying, setApplying] = useState<Recommendation | null>(null);
  const [notice, setNotice] = useState('');

  return (
    <Card className="self-start">
      <details key={aquariumId} open={defaultOpen} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-4 transition-colors hover:bg-slate-700/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <ClipboardList className="h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-base font-semibold text-white">Recommendations</span>
              <span className="block text-xs text-slate-400">
                {error ? 'Recommendations unavailable' : `${pending.length} active`}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-sm text-teal-200">
            <span className="group-open:hidden">Show</span>
            <span className="hidden group-open:inline">Hide</span>
            <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </span>
        </summary>
        <CardContent className="border-t border-slate-600/30">
          {error ? <p className="mb-3 text-sm text-amber-300">{error}</p> : null}
          {notice ? <div className="mb-3"><StatusMessage variant="success">{notice}</StatusMessage></div> : null}
          {withheld.length > 0 ? (
            <div className="mb-3 rounded-lg border border-teal-300/20 bg-teal-400/10 p-3 text-sm text-teal-100">
              <p>{withheld.length} draft recommendation{withheld.length === 1 ? '' : 's'} withheld pending scientific approval.</p>
              <div className="mt-2"><Badge variant="info">Draft rule</Badge></div>
            </div>
          ) : null}
          {pending.length === 0 ? (
            <p className="text-sm text-slate-400">No active approved recommendations.</p>
          ) : (
            <ul aria-label="Pending recommendations" tabIndex={0} className="max-h-96 space-y-3 overflow-y-auto overscroll-contain rounded-sm pr-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300">
              {pending.map((item) => (
                <li key={item.id} className="break-words rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="font-medium text-white">{item.title}</p>
                    <div className="flex gap-2">
                      <SeverityBadge severity={item.severity} />
                    </div>
                  </div>
                  <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Problem detected</dt>
                      <dd className="text-slate-200">{item.issueDetected}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Parameter</dt>
                      <dd className="text-slate-200">{PARAMETER_LABELS[item.parameter]?.label ?? item.parameter}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Measured value</dt>
                      <dd className="text-slate-200">{measurementText(item)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Severity</dt>
                      <dd className="text-slate-200">{item.severity.toUpperCase()}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">Generated</dt>
                      <dd className="text-slate-200">
                        {item.createdAt > 0 ? <time dateTime={new Date(item.createdAt).toISOString()}>{generatedAtFormatter.format(item.createdAt)}</time> : 'Timestamp unavailable'}
                      </dd>
                    </div>
                    {thresholdText(item) ? (
                      <div className="sm:col-span-2">
                        <dt className="text-xs uppercase tracking-wide text-slate-500">Applicable threshold</dt>
                        <dd className="text-slate-200">{thresholdText(item)}</dd>
                      </div>
                    ) : null}
                  </dl>
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
                    <Button size="sm" disabled={savingId === item.id} onClick={() => { setNotice(''); setApplying(item); }}>
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
      </details>
      {applying ? (
        <LogMaintenanceModal
          aquariumId={aquariumId}
          aquariumName={aquariumName}
          recommendation={applying}
          onClose={() => setApplying(null)}
          onLogged={setNotice}
        />
      ) : null}
    </Card>
  );
}
