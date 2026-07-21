import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { Aquarium } from '../../types/aquarium';
import type { DeviceTelemetryLogEntry } from '../../types/device';
import { getTelemetryPurityPercent, getTelemetryTdsPpm } from '../../types/device';
import {
  formatDateKey,
  formatTimeLabel,
  getRowStatus,
  toFixedValue,
} from '../../utils/dataLogsHelpers';

type HistoricalDataTableProps = {
  aquarium: Aquarium | null;
  entries: DeviceTelemetryLogEntry[];
  historyLoading: boolean;
  emptyMessage: string;
};

export function HistoricalDataTable({
  aquarium,
  entries,
  historyLoading,
  emptyMessage,
}: HistoricalDataTableProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white">Historical Data Log</h3>
          {historyLoading ? <span className="text-sm text-slate-400">Loading history...</span> : null}
        </div>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Date</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Time</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Samples
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">Tank</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Temp (C)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Level (%)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    TDS (ppm)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Purity (TDS %)
                  </th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">pH</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-slate-400">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {entries
                  .slice()
                  .reverse()
                  .map((entry, index) => {
                    const status = aquarium ? getRowStatus(entry, aquarium) : 'normal';
                    const date = new Date(entry.recordedAtEpoch);

                    return (
                      <tr
                        key={`${entry.recordedAtEpoch}-${index}`}
                        className="border-b border-slate-700/50"
                      >
                        <td className="px-4 py-3 text-sm text-slate-300">{formatDateKey(date)}</td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {formatTimeLabel(entry.recordedAtEpoch)}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-300">
                          {entry.sampleCount ?? 1}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {aquarium?.name || '--'}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {toFixedValue(entry.temperatureC, 1)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {toFixedValue(entry.waterLevelPercent, 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {toFixedValue(getTelemetryTdsPpm(entry) ?? Number.NaN, 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {toFixedValue(getTelemetryPurityPercent(entry) ?? Number.NaN, 0)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white">
                          {typeof entry.ph === 'number' ? entry.ph.toFixed(2) : '--'}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={status === 'normal' ? 'success' : 'warning'}>
                            {status}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
