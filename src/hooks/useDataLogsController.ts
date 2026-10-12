import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getDataLogsPageData } from '../services/dataLogsService';
import { getDeviceTelemetryHistory } from '../services/deviceService';
import type { Aquarium } from '../types/aquarium';
import type { DeviceTelemetryLogEntry } from '../types/device';
import type { PeriodKey } from '../types/dataLogs';
import type { UserRole } from '../types/user';
import {
  buildChartRangeLabel,
  buildDateKeys,
  buildHistoricalTableEmptyMessage,
  buildHistoricalTableEntries,
  buildRangeFilenameSuffix,
  buildSummaryItems,
  buildTemperatureChartData,
  buildWaterLevelChartData,
  buildWeeklyQualityData,
  downloadTextFile,
  formatDateKey,
  getDataLogsEmptyMessage,
  getErrorMessage,
  periodConfig,
} from '../utils/dataLogsHelpers';

export function useDataLogsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [selectedAquariumId, setSelectedAquariumId] = useState('');
  const [selectedDate, setSelectedDate] = useState(() => formatDateKey(new Date()));
  const [timePeriod, setTimePeriod] = useState<PeriodKey>('7d');
  const [historyEntries, setHistoryEntries] = useState<DeviceTelemetryLogEntry[]>([]);
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

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
      setSelectedAquariumId((prev) =>
        prev && data.aquariums.some((aquarium) => aquarium.id === prev)
          ? prev
          : data.aquariums[0]?.id || ''
      );
    } catch (loadError) {
      console.error(loadError);
      setError(getErrorMessage(loadError, 'Failed to load data logs.'));
      setAquariums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPageData();
  }, [loadPageData]);

  const selectedAquarium = useMemo(
    () => aquariums.find((aquarium) => aquarium.id === selectedAquariumId) || null,
    [aquariums, selectedAquariumId]
  );
  const rangeDateKeys = useMemo(
    () => buildDateKeys(selectedDate, periodConfig[timePeriod].days),
    [selectedDate, timePeriod]
  );

  useEffect(() => {
    if (!selectedAquarium) {
      setHistoryEntries([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        setHistoryLoading(true);
        const entriesByDate = await Promise.all(
          rangeDateKeys.map((dateKey) => getDeviceTelemetryHistory(selectedAquarium.id, dateKey))
        );

        if (!cancelled) {
          setHistoryEntries(entriesByDate.flat());
        }
      } catch (historyError) {
        console.error(historyError);

        if (!cancelled) {
          setError(getErrorMessage(historyError, 'Failed to load telemetry history.'));
          setHistoryEntries([]);
        }
      } finally {
        if (!cancelled) {
          setHistoryLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [rangeDateKeys, selectedAquarium]);

  const selectedDayEntries = useMemo(
    () =>
      historyEntries.filter(
        (entry) => formatDateKey(new Date(entry.recordedAtEpoch)) === selectedDate
      ),
    [historyEntries, selectedDate]
  );
  const tableEntries = useMemo(
    () =>
      buildHistoricalTableEntries({
        timePeriod,
        selectedDayEntries,
        rangeEntries: historyEntries,
      }),
    [historyEntries, selectedDayEntries, timePeriod]
  );
  const exportEntries = tableEntries;

  const exportCsv = () => {
    if (!selectedAquarium || exportEntries.length === 0) {
      return;
    }

    const rows = [
      'Recorded At,Temperature C,Water Level %,TDS ppm,TDS %,pH,Turbidity NTU,Power Status',
      ...exportEntries.map((entry) =>
        [
          entry.recordedAt,
          entry.temperatureC,
          entry.waterLevelPercent,
          entry.tdsPpm ?? '',
          entry.tdsPercent ?? '',
          entry.ph ?? '',
          entry.turbidity ?? '',
          entry.powerStatus ?? '',
        ].join(',')
      ),
    ];
    const suffix = buildRangeFilenameSuffix(selectedDate, timePeriod, rangeDateKeys);

    downloadTextFile(`${selectedAquarium.name}-${suffix}.csv`, rows.join('\n'), 'text/csv');
  };

  const generateReport = () => {
    exportCsv();
  };

  return {
    aquariums,
    chartRangeLabel: buildChartRangeLabel(selectedDate, timePeriod),
    emptyMessage: getDataLogsEmptyMessage(userRole),
    error,
    exportEntries,
    historicalTableEmptyMessage: buildHistoricalTableEmptyMessage({
      timePeriod,
      selectedDate,
      rangeDateKeys,
    }),
    historyLoading,
    liveDataError: '',
    loading,
    selectedAquarium,
    selectedAquariumId,
    selectedDate,
    summaryItems: buildSummaryItems(historyEntries),
    tableEntries,
    temperatureChartData: buildTemperatureChartData({
      timePeriod,
      selectedDayEntries,
      rangeEntries: historyEntries,
      rangeDateKeys,
    }),
    timePeriod,
    userRole,
    waterLevelChartData: buildWaterLevelChartData({
      timePeriod,
      selectedDayEntries,
      rangeEntries: historyEntries,
      rangeDateKeys,
    }),
    weeklyQualityData: buildWeeklyQualityData(historyEntries, selectedDate),
    actions: {
      exportCsv,
      generateReport,
      selectAquarium: setSelectedAquariumId,
      setSelectedDate,
      setTimePeriod,
    },
  };
}
