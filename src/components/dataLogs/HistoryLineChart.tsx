import type { ChartPoint } from '../../types/dataLogs';
import { toFixedValue } from '../../utils/dataLogsHelpers';

type HistoryLineChartProps = {
  data: ChartPoint[];
  color: string;
  label: string;
  unit: string;
  emptyMessage: string;
};

export function HistoryLineChart({
  data,
  color,
  label,
  unit,
  emptyMessage,
}: HistoryLineChartProps) {
  if (data.length === 0) {
    return <p className="text-sm text-slate-400">{emptyMessage}</p>;
  }

  const max = Math.max(...data.map((point) => point.value));
  const min = Math.min(...data.map((point) => point.value));
  const range = max - min || 1;
  const chartWidth = 420;
  const chartHeight = 120;

  const points = data
    .map((point, index) => {
      const x = data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth;
      const y = chartHeight - ((point.value - min) / range) * (chartHeight - 20) - 10;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-sm font-medium text-white">
          {toFixedValue(min, unit.trim() === '%' ? 0 : 1)}
          {unit} - {toFixedValue(max, unit.trim() === '%' ? 0 : 1)}
          {unit}
        </span>
      </div>

      <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} className="h-32 w-full">
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {data.map((point, index) => {
          const x =
            data.length === 1 ? chartWidth / 2 : (index / (data.length - 1)) * chartWidth;
          const y = chartHeight - ((point.value - min) / range) * (chartHeight - 20) - 10;
          return <circle key={`${point.label}-${index}`} cx={x} cy={y} r="3" fill={color} />;
        })}
      </svg>

      <div className="mt-1 flex justify-between gap-2 overflow-hidden text-[11px] text-slate-500">
        {data.map((point, index) => (
          <span key={`${point.label}-${index}`} className="truncate">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
