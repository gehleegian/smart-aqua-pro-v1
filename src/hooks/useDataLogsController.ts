import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getDeviceTelemetryHistory, subscribeToDeviceShadow } from '../services/deviceService';
import { getDataLogsPageData } from '../services/dataLogsService';
import {
  createMonitoringReport,
  getAlertRecordSummaryForRange,
} from '../services/monitoringReportsService';
import type { Aquarium } from '../types/aquarium';
import type { DeviceShadow, DeviceTelemetryLogEntry } from '../types/device';
import type { PeriodKey } from '../types/dataLogs';
import {
  buildChartRangeLabel,
  buildDateKeys,
  buildHistoricalTableEmptyMessage,
  buildHistoricalTableEntries,
  buildLiveEntry,
  buildRangeFilenameSuffix,
  buildSummaryItems,
  buildTemperatureChartData,
  buildWaterLevelChartData,
  buildWeeklyQualityData,
  downloadTextFile,
  formatDateKey,
  formatTimeLabel,
  getDataLogsEmptyMessage,
  getErrorMessage,
  getRowStatus,
  parseDateKey,
  periodConfig,
} from '../utils/dataLogsHelpers';
import { getTelemetryPurityPercent, getTelemetryTdsPpm } from '../types/device';

export function useDataLogsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [selectedAquariumId, setSelectedAquariumId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [timePeriod, setTimePeriod] = useState<PeriodKey>('7d');
  const [userRole, setUserRole] = useState<'Admin' | 'User'>('User');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [liveDataError, setLiveDataError] = useState('');
  const [historyEntries, setHistoryEntries] = useState<DeviceTelemetryLogEntry[]>([]);
  const [deviceShadow, setDeviceShadow] = useState<DeviceShadow | null>(null);

  const loadPageData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariums([]);
        return;
      }

      const data = await getDataLogsPageData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        setAquariums([]);
        return;
      }

      setUserRole(data.userProfile.role);
      setAquariums(data.aquariums);
      setSelectedAquariumId((previousId) => {
        if (previousId && data.aquariums.some((aquarium) => aquarium.id === previousId)) {
          return previousId;
        }

        return data.aquariums[0]?.id || '';
      });
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load aquarium logs.');
      setAquariums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadPageData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadPageData]);

  useEffect(() => {
    if (!selectedAquariumId) {
      setDeviceShadow(null);
      setLiveDataError('');
      return;
    }

    setLiveDataError('');

    return subscribeToDeviceShadow(
      selectedAquariumId,
      (shadow) => {
        setDeviceShadow(shadow);
        setLiveDataError('');
      },
      {
        onError: (subscriptionError) => {
          setLiveDataError(
            getErrorMessage(
              subscriptionError,
              'Live telemetry is unavailable for the selected aquarium.'
            )
          );
        },
      }
    );
  }, [selectedAquariumId]);

  useEffect(() => {
    async function loadHistory() {
      if (!selectedAquariumId) {
        setHistoryEntries([]);
        return;
      }

      try {
        setHistoryLoading(true);
        setError('');

        const daysToFetch = Math.max(periodConfig[timePeriod].days, 7);
        const dateKeys = buildDateKeys(selectedDate, daysToFetch);
        const logGroups = await Promise.all(
          dateKeys.map((dateKey) => getDeviceTelemetryHistory(selectedAquariumId, dateKey))
        );

        setHistoryEntries(logGroups.flat());
      } catch (historyError) {
        console.error(historyError);
        setError('Failed to load telemetry history.');
        setHistoryEntries([]);
      } finally {
        setHistoryLoading(false);
      }
    }

    void loadHistory();
  }, [selectedAquariumId, selectedDate, timePeriod]);

  const selectedAquarium = useMemo(
    () => aquariums.find((aquarium) => aquarium.id === selectedAquariumId) || null,
    [aquariums, selectedAquariumId]
  );

  const liveEntry = useMemo(() => buildLiveEntry(deviceShadow), [deviceShadow]);
  const todayDateKey = formatDateKey(new Date());

  const mergedEntries = useMemo(() => {
    const entries = [...historyEntries];

    if (
      liveEntry &&
      selectedAquariumId &&
      selectedDate === todayDateKey &&
      !entries.some((entry) => Math.abs(entry.recordedAtEpoch - liveEntry.recordedAtEpoch) < 60000)
    ) {
      entries.push(liveEntry);
    }

    return entries.sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);
  }, [historyEntries, liveEntry, selectedAquariumId, selectedDate, todayDateKey]);

  const selectedDayEntries = useMemo(() => {
    return mergedEntries.filter(
      (entry) => formatDateKey(new Date(entry.recordedAtEpoch)) === selectedDate
    );
  }, [mergedEntries, selectedDate]);

  const rangeDateKeys = useMemo(
    () => buildDateKeys(selectedDate, periodConfig[timePeriod].days),
    [selectedDate, timePeriod]
  );

  const rangeEntries = useMemo(() => {
    const dateKeySet = new Set(rangeDateKeys);
    return mergedEntries.filter((entry) =>
      dateKeySet.has(formatDateKey(new Date(entry.recordedAtEpoch)))
    );
  }, [mergedEntries, rangeDateKeys]);

  const weeklyQualityData = useMemo(
    () => buildWeeklyQualityData(mergedEntries, selectedDate),
    [mergedEntries, selectedDate]
  );

  const tableEntries = useMemo(
    () =>
      buildHistoricalTableEntries({
        timePeriod,
        selectedDayEntries,
        rangeEntries,
      }),
    [rangeEntries, selectedDayEntries, timePeriod]
  );

  const chartDayEntries = timePeriod === '24h' ? tableEntries : selectedDayEntries;

  const temperatureChartData = useMemo(
    () =>
      buildTemperatureChartData({
        timePeriod,
        selectedDayEntries: chartDayEntries,
        rangeEntries,
        rangeDateKeys,
      }),
    [chartDayEntries, rangeDateKeys, rangeEntries, timePeriod]
  );

  const waterLevelChartData = useMemo(
    () =>
      buildWaterLevelChartData({
        timePeriod,
        selectedDayEntries: chartDayEntries,
        rangeEntries,
        rangeDateKeys,
      }),
    [chartDayEntries, rangeDateKeys, rangeEntries, timePeriod]
  );

  const chartRangeLabel = buildChartRangeLabel(selectedDate, timePeriod);
  const summaryItems = useMemo(() => buildSummaryItems(rangeEntries), [rangeEntries]);
  const exportEntries = tableEntries;
  const exportRangeLabel =
    timePeriod === '24h'
      ? selectedDate
      : `${rangeDateKeys[0]} to ${rangeDateKeys[rangeDateKeys.length - 1]}`;
  const exportFilenameSuffix = buildRangeFilenameSuffix(
    selectedDate,
    timePeriod,
    rangeDateKeys
  );
  const historicalTableEmptyMessage = buildHistoricalTableEmptyMessage({
    timePeriod,
    selectedDate,
    rangeDateKeys,
  });
  const exportGeneratedAt = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date());

  const reportType =
    timePeriod === '24h'
      ? 'Daily'
      : timePeriod === '7d'
        ? 'Weekly'
        : timePeriod === '30d'
          ? 'Monthly'
          : '90-Day';

  const reportStartDate = parseDateKey(rangeDateKeys[0] || selectedDate);
  const reportEndDate = parseDateKey(rangeDateKeys[rangeDateKeys.length - 1] || selectedDate);
  reportEndDate.setHours(23, 59, 59, 999);

  function buildSensorSummary() {
    const warningReadings = exportEntries.filter(
      (entry) => selectedAquarium && getRowStatus(entry, selectedAquarium) === 'warning'
    ).length;

    return [
      ...summaryItems.map((item) => `${item.label}: ${item.value}`),
      `Grouped Log Entries: ${exportEntries.length}`,
      `Warning Log Entries: ${warningReadings}`,
    ].join('; ');
  }

  const handleExportCsv = useCallback(() => {
    if (!selectedAquarium) {
      return;
    }

    const rows = [
      ['SmartAqua Telemetry Export'],
      ['Aquarium', selectedAquarium.name],
      ['Owner', selectedAquarium.ownerName],
      ['Range', exportRangeLabel],
      ['Period', periodConfig[timePeriod].label],
      ['Generated At', exportGeneratedAt],
      [],
      [
        'Date',
        'Time',
        'Samples',
        'Aquarium',
        'TemperatureC',
        'WaterLevelPercent',
        'TdsPpm',
        'PurityScorePercent',
        'pH',
        'Status',
      ],
      ...exportEntries.map((entry) => {
        const date = new Date(entry.recordedAtEpoch);
        const status = getRowStatus(entry, selectedAquarium);

        return [
          formatDateKey(date),
          formatTimeLabel(entry.recordedAtEpoch),
          entry.sampleCount ?? 1,
          selectedAquarium.name,
          entry.temperatureC.toFixed(1),
          entry.waterLevelPercent.toFixed(0),
          getTelemetryTdsPpm(entry)?.toFixed(0) ?? '--',
          getTelemetryPurityPercent(entry)?.toFixed(0) ?? '--',
          typeof entry.ph === 'number' ? entry.ph.toFixed(2) : '--',
          status,
        ];
      }),
    ];

    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
      .join('\n');

    downloadTextFile(
      `${selectedAquarium.name.replaceAll(' ', '_')}-${exportFilenameSuffix}-logs.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  }, [
    exportEntries,
    exportFilenameSuffix,
    exportGeneratedAt,
    exportRangeLabel,
    selectedAquarium,
    timePeriod,
  ]);

  const handleGenerateReport = useCallback(async () => {
    if (!selectedAquarium) {
      return;
    }

    const currentUserId = auth.currentUser?.uid || '';

    if (!currentUserId) {
      setError('No logged-in user found.');
      return;
    }

    const generatedAtDate = new Date();
    const generatedAtLabel = new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(generatedAtDate);
    let alertSummary = {
      total: 0,
      critical: 0,
      warning: 0,
      resolved: 0,
      active: 0,
    };

    try {
      alertSummary = await getAlertRecordSummaryForRange(
        selectedAquarium.id,
        reportStartDate,
        reportEndDate
      );
    } catch (alertSummaryError) {
      console.warn('Failed to load alert summary for monitoring report.', alertSummaryError);
    }
    const summary = [
      buildSensorSummary(),
      `Alert Records: ${alertSummary.total}`,
      `Critical Alerts: ${alertSummary.critical}`,
      `Warning Alerts: ${alertSummary.warning}`,
      `Resolved Alerts: ${alertSummary.resolved}`,
      `Active Alerts: ${alertSummary.active}`,
    ].join('; ');

    try {
      await createMonitoringReport({
        aquarium_id: selectedAquarium.id,
        report_type: reportType,
        start_date: reportStartDate,
        end_date: reportEndDate,
        summary,
        fileUrl: null,
        generated_at: generatedAtDate,
        generated_by: currentUserId,
      });
    } catch (reportError) {
      console.error(reportError);
      setError(
        getErrorMessage(
          reportError,
          'The report file was generated, but the monitoring report record could not be saved.'
        )
      );
    }

    const reportLines = [
      'SmartAqua Telemetry Report',
      `Aquarium: ${selectedAquarium.name}`,
      `Owner: ${selectedAquarium.ownerName}`,
      `Range: ${exportRangeLabel}`,
      `Report Type: ${reportType}`,
      `Generated At: ${generatedAtLabel}`,
      '',
      'Summary',
      ...summaryItems.map((item) => `- ${item.label}: ${item.value}`),
      `- Alert Records: ${alertSummary.total}`,
      `- Critical Alerts: ${alertSummary.critical}`,
      `- Warning Alerts: ${alertSummary.warning}`,
      `- Resolved Alerts: ${alertSummary.resolved}`,
      `- Active Alerts: ${alertSummary.active}`,
      '',
      'Logged readings',
      ...exportEntries.map((entry) => {
        const status = getRowStatus(entry, selectedAquarium);
        const dateLabel = formatDateKey(new Date(entry.recordedAtEpoch));

        return `${dateLabel} ${formatTimeLabel(entry.recordedAtEpoch)} | Samples ${
          entry.sampleCount ?? 1
        } | Temp ${entry.temperatureC.toFixed(1)} C | Level ${entry.waterLevelPercent.toFixed(
          0
        )}% | TDS ${getTelemetryTdsPpm(entry)?.toFixed(0) ?? '--'} ppm | Purity Score ${
          getTelemetryPurityPercent(entry)?.toFixed(0) ?? '--'
        }% | pH ${typeof entry.ph === 'number' ? entry.ph.toFixed(2) : '--'} | ${status}`;
      }),
    ];

    downloadTextFile(
      `${selectedAquarium.name.replaceAll(' ', '_')}-${exportFilenameSuffix}-report.txt`,
      reportLines.join('\n'),
      'text/plain;charset=utf-8'
    );
  }, [
    exportEntries,
    exportFilenameSuffix,
    exportRangeLabel,
    reportEndDate,
    reportStartDate,
    reportType,
    selectedAquarium,
    summaryItems,
  ]);

  return {
    aquariums,
    selectedAquarium,
    selectedAquariumId,
    selectedDate,
    timePeriod,
    userRole,
    loading,
    historyLoading,
    error,
    liveDataError,
    temperatureChartData,
    waterLevelChartData,
    weeklyQualityData,
    chartRangeLabel,
    summaryItems,
    exportEntries,
    tableEntries,
    historicalTableEmptyMessage,
    emptyMessage: getDataLogsEmptyMessage(userRole),
    actions: {
      loadPageData,
      selectAquarium: setSelectedAquariumId,
      setSelectedDate,
      setTimePeriod,
      exportCsv: handleExportCsv,
      generateReport: handleGenerateReport,
    },
  };
}
