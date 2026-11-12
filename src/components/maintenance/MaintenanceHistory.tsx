import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { maintenanceLabel, MAINTENANCE_TYPES, subscribeToMaintenance, type MaintenanceEntry } from '../../services/maintenanceService';
import { useClientPagination } from '../../hooks/useClientPagination';
import Pagination from '../ui/Pagination';

/** FR20: the tank's maintenance history, newest first, filterable by type. */
export function MaintenanceHistory({ aquariumId, action }: { aquariumId: string; action?: React.ReactNode }) {
  const [state, setState] = useState<{ aquariumId: string; entries: MaintenanceEntry[]; error: string } | null>(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => subscribeToMaintenance(
    aquariumId,
    (entries) => setState({ aquariumId, entries, error: '' }),
    (error) => setState({ aquariumId, entries: [], error: `Maintenance history is unavailable (${error.message}).` })
  ), [aquariumId]);

  const current = state?.aquariumId === aquariumId ? state : null;
  const entries = (current?.entries ?? []).filter((entry) => filter === 'all' || entry.type === filter);
  const pagination = useClientPagination(entries, `${aquariumId}:${filter}`);

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Maintenance history</h3>
        <div className="flex flex-wrap items-center gap-2">
          <select aria-label="Filter maintenance by type" value={filter} onChange={(event) => setFilter(event.target.value)}
            className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-1.5 text-sm text-slate-100">
            <option value="all" className="bg-slate-900">All types</option>
            {MAINTENANCE_TYPES.map((item) => <option key={item.id} value={item.id} className="bg-slate-900">{item.label}</option>)}
          </select>
          {action}
        </div>
      </CardHeader>
      <CardContent>
        {current?.error ? <p className="text-sm text-amber-300">{current.error}</p> : null}
        {!current ? <p className="text-sm text-slate-400">Loading…</p> : entries.length === 0 ? (
          <p className="text-sm text-slate-400">{filter === 'all' ? 'No maintenance logged yet.' : 'Nothing of this type logged yet.'}</p>
        ) : (
          <>
          <ol aria-label="Maintenance records" start={pagination.start} className="divide-y divide-slate-700/40">
            {pagination.items.map((entry, index) => (
              <li key={entry.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                    <span className="text-xs tabular-nums text-teal-300" aria-label={`Record ${pagination.startIndex + index + 1}`}>#{pagination.startIndex + index + 1}</span>
                    {maintenanceLabel(entry.type)}{entry.waterChangePercent !== null ? ` · ${entry.waterChangePercent}%` : ''}
                    {entry.resetsCleaningCycle ? <Badge variant="info"><RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" />New cleaning cycle</Badge> : null}
                    {entry.recommendationId ? <Badge variant="success">From recommendation</Badge> : null}
                  </p>
                  {entry.notes ? <p className="mt-0.5 text-sm text-slate-300">{entry.notes}</p> : null}
                  <p className="mt-0.5 text-xs text-slate-400">{entry.performedByName}{entry.performedByRole ? ` (${entry.performedByRole})` : ''}</p>
                </div>
                <time className="text-xs text-slate-400" dateTime={new Date(entry.performedAt).toISOString()}>{new Date(entry.performedAt).toLocaleString()}</time>
              </li>
            ))}
          </ol>
          <Pagination {...pagination} label="Maintenance history" itemLabel="maintenance records" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
