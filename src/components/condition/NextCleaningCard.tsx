import type { CleaningSummary } from '../../utils/monitoringAssessmentCore';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';

const REASON_TEXT: Record<CleaningSummary['reason'], string> = {
  interval: 'Regular interval for this bioload',
  tds_rise: 'Brought forward: TDS rose since the last cleaning',
  turbidity_repeat: 'Brought forward: turbidity reached WARNING twice within 24 h',
  bioload_unknown: 'Add fish weights and working volume to the profile to compute the bioload',
  no_species_config: 'No species thresholds are configured for this aquarium',
};

function formatDate(epoch: number) {
  return new Date(epoch).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function NextCleaningCard({ cleaning, now }: { cleaning: CleaningSummary | null; now: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Next cleaning</h3>
        <Badge variant="info">Draft schedule</Badge>
      </CardHeader>
      <CardContent>
        {!cleaning ? (
          <p className="text-sm text-slate-400">The cleaning schedule appears once the rules engine has evaluated this aquarium.</p>
        ) : cleaning.status !== 'scheduled' || cleaning.nextCleaningDue === null ? (
          <p className="text-sm text-slate-400">{REASON_TEXT[cleaning.reason]}</p>
        ) : (
          <div className="space-y-2 text-sm">
            <p className="text-2xl font-semibold text-white">
              {cleaning.nextCleaningDue <= now ? 'Due now' : formatDate(cleaning.nextCleaningDue)}
            </p>
            <p className="text-slate-300">{REASON_TEXT[cleaning.reason]}</p>
            <p className="text-xs text-slate-400">
              Bioload {cleaning.bioloadLevel ?? 'unknown'} · every {cleaning.intervalDays} days · last cleaned{' '}
              {cleaning.lastCleanedAt ? formatDate(cleaning.lastCleanedAt) : 'never logged'}
              {cleaning.lastCleanedSource === 'createdAt' ? ' (aquarium creation date; no cleaning logged yet)' : ''}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
