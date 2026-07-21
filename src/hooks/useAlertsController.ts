import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getDeviceTelemetryState, getDeviceTelemetryStatusText, type DeviceShadow } from '../types/device';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import { syncAlertRecords } from '../services/alertRecordsService';
import { getAlertsPageData } from '../services/alertsService';
import type { Aquarium } from '../types/aquarium';
import type { AquariumAlert, AlertSeverityFilter, AlertStatusFilter } from '../types/alerts';
import type { UserRole } from '../types/user';
import {
  acknowledgeAlert,
  buildAlertCandidates,
  buildDistribution,
  buildSummaryCounts,
  dedupeAlertsByFingerprint,
  filterAlerts,
  formatAlertTimestamp,
  getAlertPanelTitle,
  getErrorMessage,
  mergeLiveAquariums,
  readAlertHistory,
  sortAlertsByRecency,
  syncAlertHistory,
  writeAlertHistory,
} from '../utils/alertsHelpers';

export function useAlertsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<
    Record<string, string>
  >({});
  const [alerts, setAlerts] = useState<AquariumAlert[]>([]);
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverityFilter>('all');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatusFilter>('active');
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [currentUserId, setCurrentUserId] = useState('');

  const loadAlertsData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariums([]);
        setAlerts([]);
        return;
      }

      const data = await getAlertsPageData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        setAquariums([]);
        setAlerts([]);
        return;
      }

      setCurrentUserId(currentUser.uid);
      setUserRole(data.userProfile.role);
      setAquariums(data.aquariums);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load alerts.');
      setAquariums([]);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadAlertsData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadAlertsData]);

  useEffect(() => {
    if (aquariums.length === 0) {
      setDeviceShadows({});
      setDeviceSubscriptionErrors({});
      return;
    }

    if (!isRealtimeDatabaseConfigured()) {
      const errorMessage =
        'Realtime Database is not configured. Live device data is unavailable.';

      setDeviceShadows({});
      setDeviceSubscriptionErrors(
        Object.fromEntries(aquariums.map((aquarium) => [aquarium.id, errorMessage]))
      );
      return;
    }

    setDeviceSubscriptionErrors({});

    const unsubscribers = aquariums.map((aquarium) =>
      subscribeToDeviceShadow(
        aquarium.id,
        (shadow) => {
          setDeviceShadows((prev) => ({
            ...prev,
            [aquarium.id]: shadow,
          }));
          setDeviceSubscriptionErrors((prev) => {
            if (!prev[aquarium.id]) {
              return prev;
            }

            const next = { ...prev };
            delete next[aquarium.id];
            return next;
          });
        },
        {
          onError: (subscriptionError) => {
            setDeviceSubscriptionErrors((prev) => ({
              ...prev,
              [aquarium.id]: getErrorMessage(
                subscriptionError,
                `Live device data for ${aquarium.name} is unavailable.`
              ),
            }));
          },
        }
      )
    );

    return () => {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [aquariums]);

  const liveAquariums = useMemo(
    () => mergeLiveAquariums(aquariums, deviceShadows),
    [aquariums, deviceShadows]
  );

  const historyStorageKey = currentUserId
    ? `smartaqua.alertHistory.v1.${currentUserId}`
    : '';

  useEffect(() => {
    if (loading || !historyStorageKey) {
      return;
    }

    const existingHistory = readAlertHistory(historyStorageKey);
    const activeCandidates = buildAlertCandidates(liveAquariums, deviceShadows);
    const nextHistory = dedupeAlertsByFingerprint(
      sortAlertsByRecency(syncAlertHistory(existingHistory, activeCandidates))
    );

    setAlerts(nextHistory);
    writeAlertHistory(historyStorageKey, nextHistory);
    void syncAlertRecords(nextHistory).catch((syncError) => {
      console.warn('Failed to sync alert records.', syncError);
    });
  }, [deviceShadows, historyStorageKey, liveAquariums, loading]);

  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, selectedSeverity, selectedStatus),
    [alerts, selectedSeverity, selectedStatus]
  );

  const summaryCounts = useMemo(() => buildSummaryCounts(alerts), [alerts]);

  const openAlerts = useMemo(
    () => alerts.filter((alert) => !alert.resolvedAt),
    [alerts]
  );

  const recentResolvedAlerts = useMemo(
    () => dedupeAlertsByFingerprint(alerts.filter((alert) => alert.resolvedAt)).slice(0, 5),
    [alerts]
  );

  const distribution = useMemo(() => buildDistribution(openAlerts), [openAlerts]);

  const selectedAlert = useMemo(
    () => alerts.find((alert) => alert.id === selectedAlertId) || null,
    [alerts, selectedAlertId]
  );

  useEffect(() => {
    if (selectedAlertId && !alerts.some((alert) => alert.id === selectedAlertId)) {
      setSelectedAlertId('');
    }
  }, [alerts, selectedAlertId]);

  const liveDataError = useMemo(
    () => {
      const subscriptionError = Object.values(deviceSubscriptionErrors).find(Boolean);

      if (subscriptionError) {
        return subscriptionError;
      }

      const telemetryIssueAquarium = aquariums.find((aquarium) => {
        const telemetryState = getDeviceTelemetryState(deviceShadows[aquarium.id]?.telemetry);
        return telemetryState !== 'live';
      });

      if (!telemetryIssueAquarium) {
        return '';
      }

      return `${telemetryIssueAquarium.name}: ${getDeviceTelemetryStatusText(
        getDeviceTelemetryState(deviceShadows[telemetryIssueAquarium.id]?.telemetry)
      )}`;
    },
    [aquariums, deviceShadows, deviceSubscriptionErrors]
  );

  const acknowledgeSelectedAlert = useCallback(
    (alertId: string) => {
      if (!historyStorageKey) {
        return;
      }

      const nextAlerts = dedupeAlertsByFingerprint(sortAlertsByRecency(acknowledgeAlert(alerts, alertId)));
      setAlerts(nextAlerts);
      writeAlertHistory(historyStorageKey, nextAlerts);
      void syncAlertRecords(nextAlerts).catch((syncError) => {
        console.warn('Failed to sync alert records.', syncError);
      });
    },
    [alerts, historyStorageKey]
  );

  return {
    aquariums: liveAquariums,
    alerts,
    filteredAlerts,
    selectedAlert,
    selectedAlertId,
    selectedSeverity,
    selectedStatus,
    loading,
    error,
    liveDataError,
    userRole,
    summaryCounts,
    distribution,
    recentResolvedAlerts,
    openAlertCount: openAlerts.length,
    panelTitle: getAlertPanelTitle(userRole),
    formatAlertTimestamp,
    actions: {
      loadAlertsData,
      selectSeverity: setSelectedSeverity,
      selectStatus: setSelectedStatus,
      toggleSelectedAlert: (alertId: string) =>
        setSelectedAlertId((current) => (current === alertId ? '' : alertId)),
      acknowledgeAlert: acknowledgeSelectedAlert,
    },
  };
}
