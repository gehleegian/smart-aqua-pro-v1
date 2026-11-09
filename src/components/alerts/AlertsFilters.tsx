import type { AlertSeverityFilter, AlertStatusFilter } from '../../types/alerts';
import Button from '../ui/Button';

interface AlertsFiltersProps {
  selectedSeverity: AlertSeverityFilter;
  selectedStatus: AlertStatusFilter;
  onSelectSeverity: (severity: AlertSeverityFilter) => void;
  onSelectStatus: (status: AlertStatusFilter) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
}

export function AlertsFilters({
  selectedSeverity,
  selectedStatus,
  onSelectSeverity,
  onSelectStatus,
  selectedDate,
  onSelectDate,
}: AlertsFiltersProps) {
  const severityOptions: AlertSeverityFilter[] = ['all', 'critical', 'warning'];
  const statusOptions: AlertStatusFilter[] = ['all', 'active', 'acknowledged', 'resolved'];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-600/35 bg-slate-800/40 p-4 backdrop-blur-sm">
      <select
        aria-label="Filter by severity"
        value={selectedSeverity}
        onChange={(event) => onSelectSeverity(event.target.value as AlertSeverityFilter)}
        className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
      >
        {severityOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All Severities' : option}
          </option>
        ))}
      </select>
      <select
        aria-label="Filter by status"
        value={selectedStatus}
        onChange={(event) => onSelectStatus(event.target.value as AlertStatusFilter)}
        className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm capitalize text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
      >
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All Statuses' : option}
          </option>
        ))}
      </select>
      <div>
        <label htmlFor="alerts-date" className="mb-1 block text-xs text-slate-400">Alert date (UTC+8)</label>
        <input
          id="alerts-date"
          type="date"
          aria-label="Filter alerts by last-seen date"
          value={selectedDate}
          onChange={(event) => onSelectDate(event.target.value)}
          className="min-h-10 min-w-0 rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
        />
      </div>
      {selectedDate ? <Button type="button" variant="ghost" onClick={() => onSelectDate('')}>All dates</Button> : null}
      <p className="w-full text-xs text-slate-400">Date filters use the last-seen date in UTC+8 and search loaded alert history only.</p>
    </div>
  );
}
