import type { AlertSeverityFilter, AlertStatusFilter } from '../../types/alerts';

type AlertsFiltersProps = {
  selectedSeverity: AlertSeverityFilter;
  selectedStatus: AlertStatusFilter;
  onSelectSeverity: (severity: AlertSeverityFilter) => void;
  onSelectStatus: (status: AlertStatusFilter) => void;
};

export function AlertsFilters({
  selectedSeverity,
  selectedStatus,
  onSelectSeverity,
  onSelectStatus,
}: AlertsFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {(['all', 'critical', 'warning'] as AlertSeverityFilter[]).map((severity) => (
        <button
          key={severity}
          onClick={() => onSelectSeverity(severity)}
          className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-all ${
            selectedSeverity === severity
              ? severity === 'critical'
                ? 'bg-red-600 text-white'
                : severity === 'warning'
                ? 'bg-amber-600 text-white'
                : 'bg-cyan-600 text-white'
              : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
          }`}
        >
          {severity === 'all' ? 'All Types' : severity}
        </button>
      ))}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {(['all', 'active', 'acknowledged', 'resolved'] as AlertStatusFilter[]).map((status) => (
          <button
            key={status}
            onClick={() => onSelectStatus(status)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all ${
              selectedStatus === status
                ? 'bg-slate-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {status}
          </button>
        ))}
      </div>
    </div>
  );
}
