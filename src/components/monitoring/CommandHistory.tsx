import { useEffect, useState } from 'react';
import { CalendarClock, ChevronDown, History, Info } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';
import { commandLabel, NO_RESPONSE_EXPLANATION, subscribeToCommandLog, type CommandLogEntry, type CommandLogStatus } from '../../services/commandLogService';
import { useClientPagination } from '../../hooks/useClientPagination';
import Pagination from '../ui/Pagination';

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
  const pagination = useClientPagination(current?.entries ?? [], aquariumId, 5);

  return (
    <Card className="self-start">
      <details key={aquariumId} className="group">
        <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-6 py-4 transition-colors hover:bg-slate-700/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 group-open:rounded-b-none [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-3">
            <History className="h-5 w-5 shrink-0 text-teal-300" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-base font-semibold text-white">Command history</span>
              <span className="block text-xs text-slate-400">
                {current?.error ? 'History unavailable' : !current ? 'Loading history…' : current.entries.length === 0 ? 'No commands yet' : `${current.entries.length} recent ${current.entries.length === 1 ? 'command' : 'commands'}`}
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
          {current?.error ? <p className="text-sm text-amber-300" role="status">{current.error}</p> : !current ? <p className="text-sm text-slate-400" role="status">Loading…</p> : current.entries.length === 0 ? (
            <p className="text-sm text-slate-400">No commands sent yet.</p>
          ) : (
            <>
            <ol aria-label="Recent commands" start={pagination.start} className="divide-y divide-slate-700/40">
              {pagination.items.map((entry, index) => (
                <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 pr-2">
                  <div className="min-w-0 max-w-full">
                    <p className="flex items-center gap-2 break-words text-sm font-medium text-white">
                      <span className="shrink-0 text-xs tabular-nums text-teal-300" aria-label={`Record ${pagination.startIndex + index + 1}`}>#{pagination.startIndex + index + 1}</span>
                      {entry.source === 'schedule' ? <CalendarClock className="h-3.5 w-3.5 shrink-0 text-teal-300" aria-label="Scheduled" /> : null}
                      {commandLabel(entry.type, entry.state)}
                    </p>
                    <p className="break-words text-xs text-slate-400">
                      {entry.requestedByName} · {new Date(entry.requestedAt).toLocaleString()}
                      {entry.executedAt ? ` · device: ${new Date(entry.executedAt).toLocaleTimeString()}` : ''}
                      {entry.error ? ` · ${entry.error}` : ''}
                    </p>
                  </div>
                  <CommandStatusBadge status={entry.status} />
                </li>
              ))}
            </ol>
            <Pagination {...pagination} label="Command history" itemLabel="commands" />
            </>
          )}
        </CardContent>
      </details>
    </Card>
  );
}
