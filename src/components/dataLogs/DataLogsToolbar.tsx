import { Calendar } from 'lucide-react';
import type { Aquarium } from '../../types/aquarium';
import type { PeriodKey } from '../../types/dataLogs';
import type { UserRole } from '../../types/user';
import { periodConfig } from '../../utils/dataLogsHelpers';

type DataLogsToolbarProps = {
  timePeriod: PeriodKey;
  selectedDate: string;
  selectedAquariumId: string;
  aquariums: Aquarium[];
  userRole: UserRole;
  onSelectPeriod: (period: PeriodKey) => void;
  onSelectDate: (date: string) => void;
  onSelectAquarium: (aquariumId: string) => void;
};

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
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {(['24h', '7d', '30d', '90d'] as PeriodKey[]).map((period) => (
          <button
            key={period}
            onClick={() => onSelectPeriod(period)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              timePeriod === period
                ? 'bg-cyan-600 text-white'
                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
            }`}
          >
            {periodConfig[period].label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative">
          <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={(event) => onSelectDate(event.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          />
        </div>

        <select
          value={selectedAquariumId}
          onChange={(event) => onSelectAquarium(event.target.value)}
          className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
        >
          {aquariums.map((aquarium) => (
            <option key={aquarium.id} value={aquarium.id}>
              {userRole === 'Admin'
                ? `${aquarium.name} - ${aquarium.ownerName}`
                : aquarium.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
