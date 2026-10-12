import type { ChartPoint } from '../../types/dataLogs';

interface HistoryLineChartProps {
  data: ChartPoint[];
  color: string;
  label: string;
  unit: string;
  emptyMessage: string;
}

export function HistoryLineChart({
  data,
  color,
  label,
  unit,
  emptyMessage,
}: HistoryLineChartProps) {
  if (data.length === 0) {
    return <p className="py-10 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }

  const values = data.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1);
  const points = data
    .map((point, index) => {
      const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
      const y = 90 - ((point.value - min) / span) * 75;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        <p className="text-sm font-medium text-white">
          {data[data.length - 1]?.value.toFixed(1)}
          {unit}
        </p>
      </div>
      <svg viewBox="0 0 100 100" className="h-56 w-full overflow-visible">
        <polyline fill="none" stroke={color} strokeWidth="3" points={points} />
        {data.map((point, index) => {
          const x = data.length === 1 ? 50 : (index / (data.length - 1)) * 100;
          const y = 90 - ((point.value - min) / span) * 75;

          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="2.5" fill={color} />;
        })}
      </svg>
      <div className="mt-2 flex justify-between text-xs text-slate-500">
        <span>{data[0]?.label}</span>
        <span>{data[data.length - 1]?.label}</span>
      </div>
    </div>
  );
}
