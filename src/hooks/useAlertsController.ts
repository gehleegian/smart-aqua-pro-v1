import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getAlertsPageData } from '../services/alertsService';
import { isRealtimeDatabaseConfigured, subscribeToDeviceShadow } from '../services/deviceService';
import type {
  AlertSeverityFilter,
  AlertStatusFilter,
  AquariumAlert,
} from '../types/alerts';
import type { Aquarium } from '../types/aquarium';
import type { DeviceShadow } from '../types/device';
import type { UserRole } from '../types/user';
import {
  buildAlertCandidates,
  buildDistribution,
  buildSummaryCounts,
  filterAlerts,
  getAlertPanelTitle,
  getAlertStatus,
  getErrorMessage,
  sortAlertsByRecency,
  syncAlertHistory,
} from '../utils/alertsHelpers';
import { mapDashboardAquariums, mergeDashboardAquariums } from '../utils/dashboardHelpers';

const ALERT_REFRESH_MS = 5000;

export function useAlertsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [alerts, setAlerts] = useState<AquariumAlert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverityFilter>('all');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatusFilter>('all');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [liveDataError, setLiveDataError] = useState('');
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());

  const loadAlerts = useCallback(async () => {
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
      void loadAlerts();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadAlerts]);

  const aquariumSubscriptionKey = useMemo(
    () => JSON.stringify(aquariums.map((aquarium) => aquarium.id).sort()),
    [aquariums]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setTelemetryNow(Date.now()), ALERT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const aquariumIds = JSON.parse(aquariumSubscriptionKey) as string[];
    if (aquariumIds.length === 0) return;

    if (!isRealtimeDatabaseConfigured()) {
      const timer = window.setTimeout(
        () => setLiveDataError('Realtime Database is not configured. Live device data is unavailable.'),
        0
      );
      return () => window.clearTimeout(timer);
    }

    const unsubscribers = aquariumIds.map((aquariumId) =>
      subscribeToDeviceShadow(
        aquariumId,
        (shadow) => setDeviceShadows((prev) => ({ ...prev, [aquariumId]: shadow })),
        {
          onError: (subscriptionError) =>
            setLiveDataError(
              getErrorMessage(subscriptionError, `Live device data for aquarium ${aquariumId} is unavailable.`)
            ),
        }
      )
    );

    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [aquariumSubscriptionKey]);

  // Alerts come only from the shared assessment of validated, fresh telemetry.
  // Stored profile values and sensor-fault readings never raise alerts.
  const alertCandidates = useMemo(
    () => buildAlertCandidates(
      mergeDashboardAquariums(mapDashboardAquariums(aquariums), deviceShadows, telemetryNow)
    ),
    [aquariums, deviceShadows, telemetryNow]
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAlerts((prev) => sortAlertsByRecency(syncAlertHistory(prev, alertCandidates, telemetryNow)));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alertCandidates, telemetryNow]);

  const filteredAlerts = useMemo(
    () => filterAlerts(alerts, selectedSeverity, selectedStatus),
    [alerts, selectedSeverity, selectedStatus]
  );
  const recentResolvedAlerts = useMemo(
    () => alerts.filter((alert) => getAlertStatus(alert) === 'resolved').slice(0, 5),
    [alerts]
  );
  const summaryCounts = useMemo(() => buildSummaryCounts(alerts), [alerts]);

  const acknowledgeAlert = (alertId: string) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.id === alertId ? { ...alert, acknowledgedAt: Date.now() } : alert
      )
    );
  };

  return {
    aquariums,
    distribution: buildDistribution(alerts),
    error,
    filteredAlerts,
    liveDataError,
    loading,
    openAlertCount: alerts.filter((alert) => getAlertStatus(alert) === 'active').length,
    panelTitle: getAlertPanelTitle(userRole),
    recentResolvedAlerts,
    selectedAlertId,
    selectedSeverity,
    selectedStatus,
    summaryCounts,
    userRole,
    actions: {
      acknowledgeAlert,
      selectSeverity: setSelectedSeverity,
      selectStatus: setSelectedStatus,
      toggleSelectedAlert: (alertId: string) =>
        setSelectedAlertId((prev) => (prev === alertId ? '' : alertId)),
    },
  };
}
