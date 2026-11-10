import type { Aquarium } from '../types/aquarium';
import type { DeviceShadow, DeviceTelemetryLogEntry } from '../types/device';
import {
  getTelemetryPurityPercent,
  getTelemetryTdsPpm,
  normalizeDevicePowerStatus,
} from '../types/device';
import type { ChartPoint, PeriodKey, SummaryItem } from '../types/dataLogs';
import {
  evaluateTelemetryValidity,
  type TelemetryValidity,
} from './monitoringAssessmentCore';
import { evaluateAquariumReading } from './conditionAssessment';
import type { RuleConfigSnapshot } from '../services/ruleConfigService';
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
    !telemetry || telemetry.waterLevelReadingValid === false ||
    (typeof telemetry.temperatureC !== 'number' && telemetry.temperatureReadingValid !== false) ||
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
    temperatureC: telemetry.temperatureReadingValid === false ? NaN : telemetry.temperatureC!,
    temperatureReadingValid: telemetry.temperatureReadingValid,
    waterLevelPercent: clampPercent(telemetry.waterLevelPercent),
    tdsPpm: getTelemetryTdsPpm(telemetry) ?? undefined,
    tdsPercent:
      getTelemetryPurityPercent(telemetry) === null
        ? undefined
        : clampPercent(getTelemetryPurityPercent(telemetry)!),
    tdsReadingValid: telemetry.tdsReadingValid,
    turbidity: telemetry.turbidity,
    turbidityState: telemetry.turbidityState,
    ammoniaPpm: telemetry.ammoniaPpm,
    filterState:
      telemetry.filterState === 'Active' || telemetry.filterState === 'Inactive'
        ? telemetry.filterState
        : undefined,
    lightState: telemetry.lightState,
    equipmentStatus: telemetry.equipmentStatus,
    powerStatus: normalizeDevicePowerStatus(telemetry.powerStatus),
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

type HistorySensor = keyof Omit<TelemetryValidity, 'allValid'>;
export type HistoryRowStatus = 'normal' | 'warning' | 'critical' | 'sensor error';

export function getEntryValidity(entry: DeviceTelemetryLogEntry): TelemetryValidity {
  return evaluateTelemetryValidity(entry as unknown as Record<string, unknown>);
}

export function isEntrySensorValid(entry: DeviceTelemetryLogEntry, sensor: HistorySensor) {
  return getEntryValidity(entry)[sensor].status === 'valid';
}

// History cell: invalid readings show "Sensor error", never a number.
export function formatHistoryValue(
  entry: DeviceTelemetryLogEntry,
  sensor: HistorySensor,
  format: () => string
) {
  const status = getEntryValidity(entry)[sensor].status;
  return status === 'invalid' ? 'Sensor error' : status === 'missing' ? '--' : format();
}

const WATER_PARAMETERS = new Set<string>(['temperatureC', 'ph', 'turbidity', 'tdsPpm', 'waterLevelPercent']);

// Row status uses the shared rule engine with the Firestore thresholds (no
// thresholds defined here). Only water parameters are considered; invalid
// readings are a sensor error, not a water condition.
export function getRowStatus(
  entry: DeviceTelemetryLogEntry,
  aquarium: Aquarium,
  ruleConfig: RuleConfigSnapshot | null
): HistoryRowStatus {
  const raw = entry as unknown as Record<string, unknown>;
  const validity = evaluateTelemetryValidity(raw);
  const result = evaluateAquariumReading(aquarium as unknown as Record<string, unknown>, raw, ruleConfig);
  const water = (result?.perParameter ?? []).filter((item) => WATER_PARAMETERS.has(item.parameter));
  if (water.some((item) => item.status === 'critical')) return 'critical';
  if (water.some((item) => item.status === 'warning')) return 'warning';
  return validity.allValid ? 'normal' : 'sensor error';
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
      { label: 'Average pH', value: '--' },
      { label: 'Average Turbidity', value: '--' },
      { label: 'Power Status', value: '--' },
    ];
  }

  const validPurityReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'tds'))
    .map((entry) => getTelemetryPurityPercent(entry))
    .filter((value): value is number => value !== null);
  const validTdsReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'tds'))
    .map((entry) => getTelemetryTdsPpm(entry))
    .filter((value): value is number => value !== null);
  const validPhReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'ph'))
    .map((entry) => entry.ph as number);
  const validTurbidityReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'turbidity'))
    .map((entry) => entry.turbidity as number);
  const validTemperatureReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'temperature'))
    .map((entry) => entry.temperatureC);
  const validLevelReadings = rangeEntries
    .filter((entry) => isEntrySensorValid(entry, 'waterLevel'))
    .map((entry) => entry.waterLevelPercent);
  const latestPowerStatus = [...rangeEntries]
    .reverse()
    .map((entry) => normalizeDevicePowerStatus(entry.powerStatus))
    .find(Boolean);

  return [
    { label: 'Samples Captured', value: `${rangeEntries.length}` },
    {
      label: 'Average Temp',
      value: validTemperatureReadings.length === 0
        ? '--'
        : `${toFixedValue(average(validTemperatureReadings), 1)} C`,
    },
    {
      label: 'Lowest Level',
      value: validLevelReadings.length === 0
        ? '--'
        : `${toFixedValue(Math.min(...validLevelReadings), 0)}%`,
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
    {
      label: 'Average pH',
      value:
        validPhReadings.length === 0
          ? '--'
          : toFixedValue(average(validPhReadings), 1),
    },
    {
      label: 'Average Turbidity',
      value:
        validTurbidityReadings.length === 0
          ? '--'
          : `${toFixedValue(average(validTurbidityReadings), 0)} NTU`,
    },
    {
      label: 'Power Status',
      value: latestPowerStatus || '--',
    },
  ];
}

export function buildTemperatureChartData(options: {
  timePeriod: PeriodKey;
  selectedDayEntries: DeviceTelemetryLogEntry[];
  rangeEntries: DeviceTelemetryLogEntry[];
  rangeDateKeys: string[];
}) {
  const { timePeriod, rangeDateKeys } = options;
  const selectedDayEntries = options.selectedDayEntries.filter((entry) => isEntrySensorValid(entry, 'temperature'));
  const rangeEntries = options.rangeEntries.filter((entry) => isEntrySensorValid(entry, 'temperature'));

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
  const { timePeriod, rangeDateKeys } = options;
  const selectedDayEntries = options.selectedDayEntries.filter((entry) => isEntrySensorValid(entry, 'waterLevel'));
  const rangeEntries = options.rangeEntries.filter((entry) => isEntrySensorValid(entry, 'waterLevel'));

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
