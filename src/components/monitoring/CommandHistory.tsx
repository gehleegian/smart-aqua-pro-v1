import { useEffect, useState } from 'react';
import { CalendarClock, Info } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { commandLabel, NO_RESPONSE_EXPLANATION, subscribeToCommandLog, type CommandLogEntry, type CommandLogStatus } from '../../services/commandLogService';

export function CommandStatusBadge({ status }: { status: CommandLogStatus | 'none' }) {
  if (status === 'none') return null;
  if (status === 'no_response') {
    // Neutral grey, not an error: live firmware does not acknowledge yet.
    return (
      <span title={NO_RESPONSE_EXPLANATION} className="inline-flex items-center gap-1 rounded-full border border-slate-500/40 bg-slate-500/10 px-2.5 py-0.5 text-xs font-medium text-slate-300">
        No response <Info className="h-3 w-3" aria-hidden="true" />
        <span className="sr-only">{NO_RESPONSE_EXPLANATION}</span>
      </span>
    );
  }
  const variant = status === 'done' ? 'success' : status === 'failed' ? 'danger' : 'info';
  return <Badge variant={variant}>{status === 'pending' ? 'Waiting for device' : status === 'done' ? 'Done' : 'Failed'}</Badge>;
}

/** FR19: who sent which command when, and what the device answered. */
export function CommandHistory({ aquariumId }: { aquariumId: string }) {
  const [state, setState] = useState<{ aquariumId: string; entries: CommandLogEntry[]; error: string } | null>(null);
  useEffect(() => subscribeToCommandLog(
    aquariumId,
    (entries) => setState({ aquariumId, entries, error: '' }),
    (error) => setState({ aquariumId, entries: [], error: `Command history is unavailable (${error.message}).` })
  ), [aquariumId]);
  const current = state?.aquariumId === aquariumId ? state : null;

  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-white">Command history</h3>
      </CardHeader>
      <CardContent>
        {current?.error ? <p className="text-sm text-amber-300">{current.error}</p> : null}
        {!current ? <p className="text-sm text-slate-400">Loading…</p> : current.entries.length === 0 ? (
          <p className="text-sm text-slate-400">No commands sent yet.</p>
        ) : (
          <ul className="divide-y divide-slate-700/40">
            {current.entries.map((entry) => (
              <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-white">
                    {entry.source === 'schedule' ? <CalendarClock className="h-3.5 w-3.5 text-teal-300" aria-label="Scheduled" /> : null}
                    {commandLabel(entry.type, entry.state)}
                  </p>
                  <p className="text-xs text-slate-400">
                    {entry.requestedByName} · {new Date(entry.requestedAt).toLocaleString()}
                    {entry.executedAt ? ` · device: ${new Date(entry.executedAt).toLocaleTimeString()}` : ''}
                    {entry.error ? ` · ${entry.error}` : ''}
                  </p>
                </div>
                <CommandStatusBadge status={entry.status} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
