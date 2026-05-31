import type { Aquarium } from '../types/aquarium';
import type { DeviceShadow, DeviceTelemetryLogEntry } from '../types/device';
import { getTelemetryPurityPercent, getTelemetryTdsPpm } from '../types/device';
import type { ChartPoint, PeriodKey, SummaryItem } from '../types/dataLogs';
import type { UserRole } from '../types/user';

export const periodConfig: Record<PeriodKey, { days: number; label: string }> = {
  '24h': { days: 1, label: '24h' },
  '7d': { days: 7, label: '7d' },
  '30d': { days: 30, label: '30d' },
  '90d': { days: 90, label: '90d' },
};

const historicalBucketMs: Record<PeriodKey, number> = {
  '24h': 1000 * 60 * 5,
  '7d': 1000 * 60 * 60,
  '30d': 1000 * 60 * 60 * 24,
  '90d': 1000 * 60 * 60 * 24,
};

export function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string) {
  const [yearText, monthText, dayText] = dateKey.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  return new Date(year, month - 1, day);
}

export function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

export function buildDateKeys(anchorDateKey: string, days: number) {
  const anchorDate = parseDateKey(anchorDateKey);
  const dateKeys: string[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dateKeys.push(formatDateKey(addDays(anchorDate, -offset)));
  }

  return dateKeys;
}

export function formatTimeLabel(epochMillis: number) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(epochMillis));
}

export function formatDateLabel(dateKey: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
  }).format(parseDateKey(dateKey));
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

export function buildLiveEntry(shadow: DeviceShadow | null): DeviceTelemetryLogEntry | null {
  const telemetry = shadow?.telemetry;

  if (
    !telemetry ||
    typeof telemetry.temperatureC !== 'number' ||
    typeof telemetry.waterLevelPercent !== 'number'
  ) {
    return null;
  }

  const recordedAtEpoch =
    typeof telemetry.updatedAt === 'number' && telemetry.updatedAt >= 946684800000
      ? telemetry.updatedAt
      : null;

  if (!recordedAtEpoch) {
    return null;
  }

  const recordedAtDate = new Date(recordedAtEpoch);

  return {
    temperatureC: telemetry.temperatureC,
    waterLevelPercent: clampPercent(telemetry.waterLevelPercent),
    tdsPpm: getTelemetryTdsPpm(telemetry) ?? undefined,
    tdsPercent:
      getTelemetryPurityPercent(telemetry) === null
        ? undefined
        : clampPercent(getTelemetryPurityPercent(telemetry)!),
    tdsReadingValid: telemetry.tdsReadingValid,
    turbidity: telemetry.turbidity,
    ammoniaPpm: telemetry.ammoniaPpm,
    filterState:
      telemetry.filterState === 'Active' || telemetry.filterState === 'Inactive'
        ? telemetry.filterState
        : undefined,
    ph: typeof telemetry.ph === 'number' ? telemetry.ph : undefined,
    online: telemetry.online,
    recordedAt: `${formatDateKey(recordedAtDate)}T${String(
      recordedAtDate.getHours()
    ).padStart(2, '0')}:${String(recordedAtDate.getMinutes()).padStart(2, '0')}:${String(
      recordedAtDate.getSeconds()
    ).padStart(2, '0')}`,
    recordedAtEpoch,
  };
}

export function getRowStatus(entry: DeviceTelemetryLogEntry, aquarium: Aquarium) {
  const outOfTempRange =
    entry.temperatureC < aquarium.minTemp || entry.temperatureC > aquarium.maxTemp;
  const lowLevel = entry.waterLevelPercent < aquarium.minLevel;
  const purityPercent = getTelemetryPurityPercent(entry);
  const tdsPpm = getTelemetryTdsPpm(entry);
  const lowQuality =
    purityPercent === null ||
    (typeof tdsPpm === 'number' ? tdsPpm > 500 : purityPercent < aquarium.minQuality);

  if (outOfTempRange || lowLevel || lowQuality) {
    return 'warning';
  }

  return 'normal';
}

export function toFixedValue(value: number, digits = 1) {
  return Number.isFinite(value) ? value.toFixed(digits) : '--';
}

export function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function bucketTelemetryEntries(entries: DeviceTelemetryLogEntry[], bucketMs: number) {
  if (entries.length === 0) {
    return [] as DeviceTelemetryLogEntry[];
  }

  const buckets = new Map<number, DeviceTelemetryLogEntry[]>();

  for (const entry of [...entries].sort((left, right) => left.recordedAtEpoch - right.recordedAtEpoch)) {
    const bucketStart = Math.floor(entry.recordedAtEpoch / bucketMs) * bucketMs;
    const bucketEntries = buckets.get(bucketStart);

    if (bucketEntries) {
      bucketEntries.push(entry);
      continue;
    }

    buckets.set(bucketStart, [entry]);
  }

  return Array.from(buckets.values())
    .map((bucketEntries) => {
      const latestEntry = bucketEntries[bucketEntries.length - 1];

      return {
        ...latestEntry,
        sampleCount: bucketEntries.length,
      };
    })
    .sort((left, right) => left.recordedAtEpoch - right.recordedAtEpoch);
}

export function buildDailyAverageChartData(
  entries: DeviceTelemetryLogEntry[],
  dateKeys: string[],
  getValue: (entry: DeviceTelemetryLogEntry) => number
) {
  return dateKeys
    .map((dateKey) => {
      const dayEntries = entries.filter(
        (entry) => formatDateKey(new Date(entry.recordedAtEpoch)) === dateKey
      );

      if (dayEntries.length === 0) {
        return null;
      }

      return {
        label: formatDateLabel(dateKey),
        value: average(dayEntries.map(getValue)),
      };
    })
    .filter((point): point is ChartPoint => Boolean(point));
}

export function downloadTextFile(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}

export function buildRangeFilenameSuffix(
  selectedDate: string,
  timePeriod: PeriodKey,
  rangeDateKeys: string[]
) {
  if (timePeriod === '24h' || rangeDateKeys.length === 0) {
    return selectedDate;
  }

  return `${rangeDateKeys[0]}_to_${rangeDateKeys[rangeDateKeys.length - 1]}`;
}

export function buildChartRangeLabel(selectedDate: string, timePeriod: PeriodKey) {
  return timePeriod === '24h'
    ? selectedDate
    : `${periodConfig[timePeriod].label} ending ${selectedDate}`;
}

export function buildHistoricalTableEntries(options: {
  timePeriod: PeriodKey;
  selectedDayEntries: DeviceTelemetryLogEntry[];
  rangeEntries: DeviceTelemetryLogEntry[];
}) {
  const { timePeriod, selectedDayEntries, rangeEntries } = options;
  const sourceEntries = timePeriod === '24h' ? selectedDayEntries : rangeEntries;
  return bucketTelemetryEntries(sourceEntries, historicalBucketMs[timePeriod]);
}

export function buildHistoricalTableTitle(timePeriod: PeriodKey) {
  return timePeriod === '24h' ? 'Historical Data Log' : 'Historical Data Log Range';
}

export function buildHistoricalTableEmptyMessage(options: {
  timePeriod: PeriodKey;
  selectedDate: string;
  rangeDateKeys: string[];
}) {
  const { timePeriod, selectedDate, rangeDateKeys } = options;

  if (timePeriod === '24h') {
    return `No log entries were recorded for ${selectedDate} yet. Upload the updated Arduino sketch and let the device run to start collecting history.`;
  }

  return `No log entries were recorded from ${rangeDateKeys[0]} to ${
    rangeDateKeys[rangeDateKeys.length - 1]
  } yet. Upload the updated Arduino sketch and let the device run to start collecting history.`;
}

export function buildSummaryItems(rangeEntries: DeviceTelemetryLogEntry[]): SummaryItem[] {
  if (rangeEntries.length === 0) {
    return [
      { label: 'Samples Captured', value: '0' },
      { label: 'Average Temp', value: '--' },
      { label: 'Lowest Level', value: '--' },
      { label: 'Average Purity (TDS)', value: '--' },
      { label: 'Average TDS', value: '--' },
    ];
  }

  const validPurityReadings = rangeEntries
    .map((entry) => getTelemetryPurityPercent(entry))
    .filter((value): value is number => value !== null);
  const validTdsReadings = rangeEntries
    .map((entry) => getTelemetryTdsPpm(entry))
    .filter((value): value is number => value !== null);

  return [
    { label: 'Samples Captured', value: `${rangeEntries.length}` },
    {
      label: 'Average Temp',
      value: `${toFixedValue(average(rangeEntries.map((entry) => entry.temperatureC)), 1)} C`,
    },
    {
      label: 'Lowest Level',
      value: `${toFixedValue(
        Math.min(...rangeEntries.map((entry) => entry.waterLevelPercent)),
        0
      )}%`,
    },
    {
      label: 'Average Purity (TDS)',
      value:
        validPurityReadings.length === 0
          ? '--'
          : `${toFixedValue(average(validPurityReadings), 0)}%`,
    },
    {
      label: 'Average TDS',
      value:
        validTdsReadings.length === 0
          ? '--'
          : `${toFixedValue(average(validTdsReadings), 0)} ppm`,
    },
  ];
}

export function buildTemperatureChartData(options: {
  timePeriod: PeriodKey;
  selectedDayEntries: DeviceTelemetryLogEntry[];
  rangeEntries: DeviceTelemetryLogEntry[];
  rangeDateKeys: string[];
}) {
  const { timePeriod, selectedDayEntries, rangeEntries, rangeDateKeys } = options;

  return timePeriod === '24h'
    ? selectedDayEntries.map((entry) => ({
        label: formatTimeLabel(entry.recordedAtEpoch),
        value: entry.temperatureC,
      }))
    : buildDailyAverageChartData(rangeEntries, rangeDateKeys, (entry) => entry.temperatureC);
}

export function buildWaterLevelChartData(options: {
  timePeriod: PeriodKey;
  selectedDayEntries: DeviceTelemetryLogEntry[];
  rangeEntries: DeviceTelemetryLogEntry[];
  rangeDateKeys: string[];
}) {
  const { timePeriod, selectedDayEntries, rangeEntries, rangeDateKeys } = options;

  return timePeriod === '24h'
    ? selectedDayEntries.map((entry) => ({
        label: formatTimeLabel(entry.recordedAtEpoch),
        value: entry.waterLevelPercent,
      }))
    : buildDailyAverageChartData(
        rangeEntries,
        rangeDateKeys,
        (entry) => entry.waterLevelPercent
      );
}

export function buildWeeklyQualityData(
  mergedEntries: DeviceTelemetryLogEntry[],
  selectedDate: string
) {
  const weeklyKeys = buildDateKeys(selectedDate, 7);

  return weeklyKeys.map((dateKey) => {
    const dayEntries = mergedEntries.filter(
      (entry) => formatDateKey(new Date(entry.recordedAtEpoch)) === dateKey
    );

    return {
      label: formatDateLabel(dateKey),
      value:
        dayEntries.length > 0
          ? average(
              dayEntries
                .map((entry) => getTelemetryPurityPercent(entry))
                .filter((value): value is number => value !== null)
            )
          : 0,
    };
  });
}


export function getDataLogsEmptyMessage(userRole: UserRole) {
  return userRole === 'Admin'
    ? 'No aquarium records are available yet.'
    : 'You do not have any aquariums to show logs for yet.';
}
