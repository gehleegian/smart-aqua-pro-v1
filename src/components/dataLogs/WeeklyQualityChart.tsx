import type { ChartPoint } from '../../types/dataLogs';

type WeeklyQualityChartProps = {
  data: ChartPoint[];
  emptyMessage: string;
  barClassName: string;
};

export function WeeklyQualityChart({
  data,
  emptyMessage,
  barClassName,
}: WeeklyQualityChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((point) => point.value), 1);

  return (
    <div className="flex h-32 items-end gap-3">
      {data.map((point) => (
        <div key={point.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-xs font-medium text-white">{Math.round(point.value)}%</span>
          <div
            className={`w-full rounded-t-md transition-all ${barClassName}`}
            style={{
              height: `${Math.max((point.value / max) * 100, 8)}%`,
            }}
          />
          <span className="text-xs text-slate-500">{point.label}</span>
        </div>
      ))}
    </div>
  );
}
