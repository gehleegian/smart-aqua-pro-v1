import type { Aquarium } from '../../types/aquarium';
import type { PeriodKey } from '../../types/dataLogs';
import type { UserRole } from '../../types/user';

interface DataLogsToolbarProps {
  timePeriod: PeriodKey;
  selectedDate: string;
  selectedAquariumId: string;
  aquariums: Aquarium[];
  userRole: UserRole;
  onSelectPeriod: (period: PeriodKey) => void;
  onSelectDate: (date: string) => void;
  onSelectAquarium: (aquariumId: string) => void;
}

export function DataLogsToolbar({
  timePeriod,
  selectedDate,
  selectedAquariumId,
  aquariums,
  userRole,
  onSelectPeriod,
  onSelectDate,
  onSelectAquarium,
}: DataLogsToolbarProps) {
  const periods: PeriodKey[] = ['24h', '7d', '30d', '90d'];

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-600/35 bg-slate-800/40 p-4 backdrop-blur-sm">
      <div className="min-w-full flex-1 sm:min-w-56">
        <label htmlFor="data-logs-aquarium" className="mb-1 block text-xs text-slate-400">Aquarium</label>
        <select
          id="data-logs-aquarium"
          value={selectedAquariumId}
          onChange={(event) => onSelectAquarium(event.target.value)}
          className="w-full rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
        >
          {aquariums.map((aquarium) => (
            <option key={aquarium.id} value={aquarium.id}>
              {userRole === 'Admin' ? `${aquarium.ownerName} - ${aquarium.name}` : aquarium.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="data-logs-date" className="mb-1 block text-xs text-slate-400">Date</label>
        <input
          id="data-logs-date"
          type="date"
          value={selectedDate}
          onChange={(event) => onSelectDate(event.target.value)}
          className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
        />
      </div>
      <div className="flex rounded-lg border border-slate-600/50 bg-slate-900/45 p-1">
        {periods.map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={timePeriod === period}
            onClick={() => onSelectPeriod(period)}
            className={`rounded-md px-3 py-1.5 text-sm ${
              timePeriod === period ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
            }`}
          >
            {period}
          </button>
        ))}
      </div>
    </div>
  );
}
