// Descriptive history only: no forecasts, maintenance decisions or new thresholds.
// Keep identical in web, Functions and mobile; checked by water-trends parity tests.
export type WaterTrendPoint = { at: number; value: number };
export type WaterTrend = {
  samples: number;
  excluded: number;
  first: WaterTrendPoint | null;
  last: WaterTrendPoint | null;
  low: WaterTrendPoint | null;
  high: WaterTrendPoint | null;
  change: number | null;
  pattern: 'rose' | 'fell' | 'varied' | 'unchanged' | 'insufficient';
  maxGapMs: number | null;
};

export type WaterTrendInput = { at: number; value: unknown; valid: boolean };

/** Uses distinct, chronological, explicitly validated observations only.
 * Conflicting values at one timestamp are excluded, not arbitrarily ordered.
 * Missing observations are never filled or treated as normal water conditions.
 */
export function summarizeWaterTrend(rows: readonly WaterTrendInput[]): WaterTrend {
  const groups = new Map<number, WaterTrendPoint[]>();
  for (const row of rows) {
    if (!row.valid || !Number.isFinite(row.at) || typeof row.value !== 'number' || !Number.isFinite(row.value)) continue;
    const point = { at: row.at, value: row.value };
    const group = groups.get(row.at);
    if (group) group.push(point);
    else groups.set(row.at, [point]);
  }
  const points = [...groups.values()]
    .filter(group => group.every(point => point.value === group[0].value))
    .map(group => group[0])
    .sort((a, b) => a.at - b.at);
  let up = false;
  let down = false;
  let maxGapMs: number | null = null;
  let low: WaterTrendPoint | null = null;
  let high: WaterTrendPoint | null = null;
  points.forEach((point, index) => {
    if (!low || point.value < low.value) low = point;
    if (!high || point.value > high.value) high = point;
    if (index === 0) return;
    const previous = points[index - 1];
    up ||= point.value > previous.value;
    down ||= point.value < previous.value;
    maxGapMs = Math.max(maxGapMs ?? 0, point.at - previous.at);
  });
  const first = points[0] ?? null;
  const last = points.at(-1) ?? null;
  return {
    samples: points.length,
    excluded: rows.length - points.length,
    first, last, low, high,
    change: points.length >= 2 ? Number((last!.value - first!.value).toPrecision(12)) : null,
    pattern: points.length < 2 ? 'insufficient' : up && down ? 'varied' : up ? 'rose' : down ? 'fell' : 'unchanged',
    maxGapMs,
  };
}

/** Shared wording does not claim clinical significance, steady rates or recovery. */
export function describeWaterTrend(trend: WaterTrend | null | undefined, unit: string | null = null): string {
  if (!trend) return 'Trend not stored in this report. Generate a new report to include it.';
  if (trend.pattern === 'insufficient' || !trend.first || !trend.last || trend.change === null) {
    return 'Not enough distinct valid samples to describe a trend.';
  }
  const value = (number: number) => `${Number(number.toPrecision(6))}${unit ? ` ${unit}` : ''}`;
  const direction = trend.change > 0 ? `Last sample higher by ${value(trend.change)}`
    : trend.change < 0 ? `Last sample lower by ${value(Math.abs(trend.change))}`
      : 'First and last samples equal';
  const pattern = trend.pattern === 'varied' ? 'Readings rose and fell between samples.'
    : trend.pattern === 'rose' ? 'No decreases between the available samples.'
      : trend.pattern === 'fell' ? 'No increases between the available samples.'
        : 'All available sample values equal.';
  const high = trend.high && trend.high.value > Math.max(trend.first.value, trend.last.value)
    ? ` Earlier high: ${value(trend.high.value)}.` : '';
  const low = trend.low && trend.low.value < Math.min(trend.first.value, trend.last.value)
    ? ` Earlier low: ${value(trend.low.value)}.` : '';
  return `${direction} (${value(trend.first.value)} to ${value(trend.last.value)}). ${pattern}${high}${low}`;
}
