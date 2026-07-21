type MiniSparklineProps = {
  data: number[];
  color: string;
};

export function MiniSparkline({ data, color }: MiniSparklineProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map(
      (value, index) =>
        `${(index / (data.length - 1)) * 60},${30 - ((value - min) / range) * 25}`
    )
    .join(' ');

  return (
    <svg width="60" height="30" className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
