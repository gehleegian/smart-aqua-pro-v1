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
import { markAlertRead, subscribeToAlertRecords } from '../services/alertRecordsService';
import { subscribeToRecommendations } from '../services/recommendationsService';
import type { Recommendation } from '../types/recommendation';
import { useAquariumEngineStates, useRuleConfig } from './useRuleConfig';

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

  // Server alerts: alert_records written by the rules engine (dedup, cooldown,
  // auto-resolve), with their linked recommendations.
  const [serverAlerts, setServerAlerts] = useState<Record<string, AquariumAlert[]>>({});
  const [recommendations, setRecommendations] = useState<Record<string, Recommendation>>({});
  useEffect(() => {
    if (aquariums.length === 0) return;
    const unsubscribers = aquariums.flatMap((aquarium) => [
      subscribeToAlertRecords(
        aquarium,
        (records) => setServerAlerts((prev) => ({ ...prev, [aquarium.id]: records })),
        (subscriptionError) => setLiveDataError(getErrorMessage(subscriptionError, 'Stored alerts are unavailable.'))
      ),
      subscribeToRecommendations(aquarium.id, (items) =>
        setRecommendations((prev) => {
          const next = { ...prev };
          for (const item of items) next[item.id] = item;
          return next;
        })
      ),
    ]);
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [aquariums]);

  const ruleConfig = useRuleConfig();
  const engineStates = useAquariumEngineStates(useMemo(() => aquariums.map((aquarium) => aquarium.id), [aquariums]));

  // Browser fallback, only for aquariums the rules engine has not evaluated yet
  // (no server condition summary and no stored alerts). Same engine and rules;
  // invalid readings never raise water-condition alerts.
  const fallbackAquariumIds = useMemo(
    () => new Set(aquariums
      .filter((aquarium) => !engineStates[aquarium.id]?.condition && (serverAlerts[aquarium.id]?.length ?? 0) === 0)
      .map((aquarium) => aquarium.id)),
    [aquariums, engineStates, serverAlerts]
  );
  const alertCandidates = useMemo(
    () => buildAlertCandidates(
      mergeDashboardAquariums(mapDashboardAquariums(aquariums), deviceShadows, telemetryNow, ruleConfig, engineStates)
    ).filter((candidate) => fallbackAquariumIds.has(candidate.aquariumId)),
    [aquariums, deviceShadows, telemetryNow, ruleConfig, engineStates, fallbackAquariumIds]
  );

  const [clientAlerts, setClientAlerts] = useState<AquariumAlert[]>([]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setClientAlerts((prev) => syncAlertHistory(prev, alertCandidates, telemetryNow).map((alert) => ({ ...alert, origin: 'client' as const })));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [alertCandidates, telemetryNow]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = Object.values(serverAlerts).flat().map((alert) => ({
        ...alert,
        recommendation: alert.recommendationId ? recommendations[alert.recommendationId] ?? null : null,
      }));
      setAlerts(sortAlertsByRecency([...stored, ...clientAlerts.filter((alert) => fallbackAquariumIds.has(alert.aquariumId))]));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [serverAlerts, recommendations, clientAlerts, fallbackAquariumIds]);

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
    const target = alerts.find((alert) => alert.id === alertId);
    if (target?.origin === 'server') {
      void markAlertRead(alertId).catch((ackError) => {
        console.error(ackError);
        setError('Could not mark the alert as read.');
      });
      return;
    }
    setClientAlerts((prev) =>
      prev.map((alert) => (alert.id === alertId ? { ...alert, acknowledgedAt: Date.now() } : alert))
    );
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
