import { useState } from 'react';
import { Wrench } from 'lucide-react';
import type { CleaningSummary } from '../../utils/monitoringAssessmentCore';
import { LogMaintenanceModal } from '../maintenance/LogMaintenanceModal';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';
import StatusMessage from '../ui/StatusMessage';

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

export function NextCleaningCard({ aquariumId, aquariumName, cleaning, now, onOpenMaintenance }: {
  aquariumId: string;
  aquariumName: string;
  cleaning: CleaningSummary | null;
  now: number;
  onOpenMaintenance?: () => void;
}) {
  const [logging, setLogging] = useState(false);
  const [notice, setNotice] = useState('');

  return (
    <>
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
          {notice ? <div className="mt-4"><StatusMessage variant="success">{notice}</StatusMessage></div> : null}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              aria-haspopup="dialog"
              onClick={() => { setNotice(''); setLogging(true); }}
            >
              <Wrench className="h-4 w-4 shrink-0" aria-hidden="true" />
              Log cleaning / water change
            </Button>
            {onOpenMaintenance ? (
              <Button type="button" variant="ghost" onClick={onOpenMaintenance}>
                View maintenance history
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>
      {logging ? (
        <LogMaintenanceModal
          aquariumId={aquariumId}
          aquariumName={aquariumName}
          recommendation={null}
          onClose={() => setLogging(false)}
          onLogged={setNotice}
        />
      ) : null}
    </>
  );
}
