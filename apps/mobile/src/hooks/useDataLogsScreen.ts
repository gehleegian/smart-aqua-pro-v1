import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../services/firebase';
import { getDataLogsPageData } from '../services/dataLogsService';
import {
  createMonitoringReport,
  getAlertRecordSummaryForRange,
} from '../services/monitoringReportsService';
import { getDeviceTelemetryHistory, subscribeToDeviceShadow } from '../services/deviceService';
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
  formatDateKey,
  formatTimeLabel,
  getDataLogsEmptyMessage,
  getErrorMessage,
  getRowStatus,
  parseDateKey,
  periodConfig,
} from '../utils/dataLogsHelpers';
import { getTelemetryPurityPercent, getTelemetryTdsPpm } from '../types/device';

export function useDataLogsScreen() {
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
  const [reportMessage, setReportMessage] = useState('');

  const loadPageData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setReportMessage('');

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

      setUserRole(data.userRole);
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
    void loadPageData();
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

  const selectedDayEntries = useMemo(
    () => mergedEntries.filter((entry) => formatDateKey(new Date(entry.recordedAtEpoch)) === selectedDate),
    [mergedEntries, selectedDate]
  );

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
  const exportFilenameSuffix = buildRangeFilenameSuffix(selectedDate, timePeriod, rangeDateKeys);
  const historicalTableEmptyMessage = buildHistoricalTableEmptyMessage({
    timePeriod,
    selectedDate,
    rangeDateKeys,
  });

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
      ...summaryItems.map((item) => `${item.label}: ${item.value}`),
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
      setReportMessage('Report saved to Firebase.');
    } catch (reportError) {
      console.error(reportError);
      setError(
        getErrorMessage(
          reportError,
          'The monitoring report record could not be saved.'
        )
      );
    }
  }, [rangeDateKeys, selectedAquarium, selectedDate, summaryItems, timePeriod]);

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
    liveShadow: deviceShadow,
    exportEntries,
    tableEntries,
    historicalTableEmptyMessage,
    emptyMessage: getDataLogsEmptyMessage(userRole),
    reportMessage,
    exportRangeLabel,
    exportFilenameSuffix,
    actions: {
      loadPageData,
      selectAquarium: setSelectedAquariumId,
      setSelectedDate,
      setTimePeriod,
      generateReport: handleGenerateReport,
    },
    helpers: {
      getTelemetryTdsPpm,
      getTelemetryPurityPercent,
      getRowStatus,
      formatTimeLabel,
    },
  };
}
