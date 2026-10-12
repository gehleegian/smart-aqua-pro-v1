import type { AlertSeverityFilter, AlertStatusFilter } from '../../types/alerts';

interface AlertsFiltersProps {
  selectedSeverity: AlertSeverityFilter;
  selectedStatus: AlertStatusFilter;
  onSelectSeverity: (severity: AlertSeverityFilter) => void;
  onSelectStatus: (status: AlertStatusFilter) => void;
}

export function AlertsFilters({
  selectedSeverity,
  selectedStatus,
  onSelectSeverity,
  onSelectStatus,
}: AlertsFiltersProps) {
  const severityOptions: AlertSeverityFilter[] = ['all', 'critical', 'warning'];
  const statusOptions: AlertStatusFilter[] = ['all', 'active', 'acknowledged', 'resolved'];

  return (
    <div className="flex flex-wrap gap-3 rounded-xl border border-slate-600/35 bg-slate-800/40 p-4 backdrop-blur-sm">
      <select
        value={selectedSeverity}
        onChange={(event) => onSelectSeverity(event.target.value as AlertSeverityFilter)}
        className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
      >
        {severityOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All Severities' : option}
          </option>
        ))}
      </select>
      <select
        value={selectedStatus}
        onChange={(event) => onSelectStatus(event.target.value as AlertStatusFilter)}
        className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
      >
        {statusOptions.map((option) => (
          <option key={option} value={option}>
            {option === 'all' ? 'All Statuses' : option}
          </option>
        ))}
      </select>
    </div>
  );
}
