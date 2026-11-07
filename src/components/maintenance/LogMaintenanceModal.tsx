import { useId, useState } from 'react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';
import StatusMessage from '../ui/StatusMessage';
import {
  CYCLE_RESET_WATER_CHANGE_PCT,
  logMaintenance,
  MAINTENANCE_TYPES,
  type MaintenanceType,
} from '../../services/maintenanceService';
import type { Recommendation } from '../../types/recommendation';

/** Suggest a type from the recommendation (the user can change it). */
export function suggestedType(recommendation: Pick<Recommendation, 'ruleId' | 'parameter' | 'action'> | null): MaintenanceType {
  if (!recommendation) return 'water_change';
  if (recommendation.ruleId.startsWith('cleaning_due')) return 'tank_cleaning';
  if (/filter/i.test(recommendation.ruleId) || recommendation.parameter === 'filter') return 'filter_clean';
  if (recommendation.parameter === 'equipment' || recommendation.parameter === 'power' || recommendation.parameter === 'device') return 'equipment_check';
  if (/water change/i.test(recommendation.action)) return 'water_change';
  return 'other';
}

function localDateTimeValue(epoch: number) {
  const date = new Date(epoch - new Date(epoch).getTimezoneOffset() * 60_000);
  return date.toISOString().slice(0, 16);
}

export function LogMaintenanceModal({
  aquariumId,
  aquariumName,
  recommendation,
  onClose,
  onLogged,
}: {
  aquariumId: string;
  aquariumName?: string;
  recommendation: Recommendation | null;
  onClose: () => void;
  onLogged?: (message: string) => void;
}) {
  const titleId = useId();
  const [type, setType] = useState<MaintenanceType>(() => suggestedType(recommendation));
  const [percent, setPercent] = useState('30');
  const [notes, setNotes] = useState(() => (recommendation ? `Done: ${recommendation.title}` : ''));
  const [when, setWhen] = useState(() => localDateTimeValue(Date.now()));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const resets = type === 'tank_cleaning' || (type === 'water_change' && Number(percent) >= CYCLE_RESET_WATER_CHANGE_PCT);
  const [maxWhen] = useState(() => localDateTimeValue(Date.now() + 5 * 60_000));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const performedAt = new Date(when).getTime();
    if (!Number.isFinite(performedAt) || performedAt > Date.now() + 60_000) {
      setError('When it was done cannot be in the future.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const result = await logMaintenance({
        aquariumId,
        type,
        waterChangePercent: type === 'water_change' ? Number(percent) : null,
        notes: notes.trim(),
        performedAt,
        recommendationId: recommendation?.id ?? null,
      });
      onLogged?.(
        `Maintenance logged${result.recommendationApplied ? ' and the recommendation marked applied' : ''}.` +
        (result.resetsCleaningCycle ? ' A new cleaning cycle starts from this date.' : '')
      );
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^.*?: /, '') : 'The maintenance could not be logged.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal labelledBy={titleId} onClose={onClose} className="max-w-lg">
      <form onSubmit={(event) => void submit(event)} className="space-y-4 p-6">
        <div>
          <h2 id={titleId} className="text-lg font-semibold text-white">Log maintenance</h2>
          <p className="text-sm text-slate-400">{aquariumName ?? 'This aquarium'}{recommendation ? ` · for “${recommendation.title}”` : ''}</p>
        </div>
        {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
        {recommendation ? (
          <div className="rounded-lg border border-slate-600/30 bg-slate-900/40 p-3 text-sm">
            <p className="text-xs uppercase tracking-wide text-slate-500">Recommended action</p>
            <p className="text-slate-200">{recommendation.action}</p>
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className="block text-sm font-medium text-slate-200">What was done</span>
          <select value={type} onChange={(event) => setType(event.target.value as MaintenanceType)} disabled={saving}
            className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-slate-100">
            {MAINTENANCE_TYPES.map((item) => <option key={item.id} value={item.id} className="bg-slate-900">{item.label}</option>)}
          </select>
        </label>
        {type === 'water_change' ? (
          <Input label="Water changed (%)" type="number" min="1" max="100" value={percent} disabled={saving} onChange={(event) => setPercent(event.target.value)} />
        ) : null}
        <Input label="When" type="datetime-local" max={maxWhen} value={when} disabled={saving} onChange={(event) => setWhen(event.target.value)} />
        <label className="block space-y-1">
          <span className="block text-sm font-medium text-slate-200">Notes (optional)</span>
          <textarea value={notes} maxLength={500} rows={3} disabled={saving} onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-sm text-slate-100" />
        </label>
        <p className="text-xs text-slate-400">
          {resets
            ? 'This starts a new cleaning cycle: the next cleaning date is counted from this time.'
            : `A tank cleaning, or a water change of ${CYCLE_RESET_WATER_CHANGE_PCT}% or more, starts a new cleaning cycle.`}
        </p>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="submit" disabled={saving}>{saving ? 'Saving…' : recommendation ? 'Log and mark applied' : 'Log maintenance'}</Button>
        </div>
      </form>
    </Modal>
  );
}
