import type { Aquarium } from '../../types/aquarium';
import type { DeviceTelemetryLogEntry } from '../../types/device';
import { formatHistoryValue, getRowStatus, toFixedValue } from '../../utils/dataLogsHelpers';
import { useRuleConfig } from '../../hooks/useRuleConfig';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { useClientPagination } from '../../hooks/useClientPagination';
import Pagination from '../ui/Pagination';

interface HistoricalDataTableProps {
  aquarium: Aquarium | null;
  entries: DeviceTelemetryLogEntry[];
  historyLoading: boolean;
  emptyMessage: string;
  paginationKey?: string;
}

export function HistoricalDataTable({
  aquarium,
  entries,
  historyLoading,
  emptyMessage,
  paginationKey = '',
}: HistoricalDataTableProps) {
  // Row status uses the same Firestore thresholds/rules as the live engine.
  const ruleConfig = useRuleConfig();
  const pagination = useClientPagination(entries, `${aquarium?.id ?? ''}:${paginationKey}`);
  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-white">Historical Data</h3>
      </CardHeader>
      <CardContent>
        {historyLoading ? (
          <p className="text-sm text-slate-400">Loading history...</p>
        ) : entries.length === 0 || !aquarium ? (
          <p className="text-sm text-slate-400">{emptyMessage}</p>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <caption className="sr-only">Historical measurements</caption>
              <thead className="text-xs uppercase text-slate-400">
                <tr>
                  <th scope="col" className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Recorded</th>
                  <th className="px-3 py-2">Temp</th>
                  <th className="px-3 py-2">Level</th>
                  <th className="px-3 py-2">TDS</th>
                  <th className="px-3 py-2">pH</th>
                  <th className="px-3 py-2">Turbidity</th>
                  <th className="px-3 py-2">Power</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {pagination.items.map((entry, index) => {
                  const status = getRowStatus(entry, aquarium, ruleConfig);

                  return (
                    <tr key={`${entry.recordedAtEpoch}-${entry.sampleCount || 1}`} className="text-slate-300">
                      <th scope="row" className="px-3 py-2 font-normal tabular-nums text-teal-300">{pagination.startIndex + index + 1}</th>
                      <td className="px-3 py-2">{entry.recordedAt}</td>
                      <td className="px-3 py-2">{formatHistoryValue(entry, 'temperature', () => `${toFixedValue(entry.temperatureC)}°C`)}</td>
                      <td className="px-3 py-2">{formatHistoryValue(entry, 'waterLevel', () => `${toFixedValue(entry.waterLevelPercent, 0)}%`)}</td>
                      <td className="px-3 py-2">
                        {formatHistoryValue(entry, 'tds', () => typeof entry.tdsPpm === 'number' ? `${toFixedValue(entry.tdsPpm, 0)} ppm` : '--')}
                      </td>
                      <td className="px-3 py-2">
                        {formatHistoryValue(entry, 'ph', () => toFixedValue(entry.ph as number, 1))}
                      </td>
                      <td className="px-3 py-2">
                        {formatHistoryValue(entry, 'turbidity', () => `${toFixedValue(entry.turbidity as number, 0)} NTU`)}
                      </td>
                      <td className="px-3 py-2">{entry.powerStatus || '--'}</td>
                      <td className="px-3 py-2">
                        <Badge variant={status === 'normal' ? 'success' : status === 'critical' ? 'danger' : 'warning'}>{status}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination {...pagination} label="Historical data" itemLabel="historical records" />
          </>
        )}
      </CardContent>
    </Card>
  );
}
