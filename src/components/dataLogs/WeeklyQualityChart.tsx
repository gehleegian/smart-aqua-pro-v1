import type { ChartPoint } from '../../types/dataLogs';

interface WeeklyQualityChartProps {
  data: ChartPoint[];
  emptyMessage: string;
  barClassName: string;
}

export function WeeklyQualityChart({
  data,
  emptyMessage,
  barClassName,
}: WeeklyQualityChartProps) {
  const hasData = data.some((point) => point.value > 0);

  if (!hasData) {
    return <p className="py-8 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }

  return (
    <div className="flex h-56 items-end gap-3">
      {data.map((point) => (
        <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-44 w-full items-end rounded-lg bg-slate-900/70">
            <div
              className={`w-full rounded-lg ${barClassName}`}
              style={{ height: `${Math.max(6, Math.min(point.value, 100))}%` }}
            />
          </div>
          <span className="w-full truncate text-center text-xs text-slate-500">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
