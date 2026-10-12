import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getAlertsPageData } from '../services/alertsService';
import type {
  AlertCategory,
  AlertSeverity,
  AlertSeverityFilter,
  AlertStatusFilter,
  AquariumAlert,
} from '../types/alerts';
import type { Aquarium } from '../types/aquarium';
import type { UserRole } from '../types/user';
import {
  buildDistribution,
  buildSummaryCounts,
  filterAlerts,
  getAlertPanelTitle,
  getAlertStatus,
  sortAlertsByRecency,
} from '../utils/alertsHelpers';

function makeAlert(
  aquarium: Aquarium,
  category: AlertCategory,
  type: AlertSeverity,
  message: string,
  suffix: string
): AquariumAlert {
  const now = Date.now();

  return {
    id: `${aquarium.id}:${suffix}`,
    fingerprint: `${aquarium.id}:${category}:${suffix}`,
    aquariumId: aquarium.id,
    tankName: aquarium.name,
    ownerName: aquarium.ownerName,
    type,
    category,
    message,
    firstDetectedAt: now,
    lastDetectedAt: now,
    acknowledgedAt: null,
    resolvedAt: null,
  };
}

function buildStaticAlerts(aquariums: Aquarium[]) {
  return sortAlertsByRecency(
    aquariums.flatMap((aquarium) => {
      const alerts: AquariumAlert[] = [];

      if (aquarium.temp < aquarium.minTemp || aquarium.temp > aquarium.maxTemp) {
        alerts.push(
          makeAlert(
            aquarium,
            'temperature',
            'warning',
            `${aquarium.name} temperature is outside the configured range.`,
            'temperature'
          )
        );
      }

      if (aquarium.level < aquarium.minLevel) {
        alerts.push(
          makeAlert(
            aquarium,
            'water_level',
            aquarium.level <= Math.max(aquarium.minLevel - 10, 0) ? 'critical' : 'warning',
            `${aquarium.name} water level is below the minimum threshold.`,
            'water-level'
          )
        );
      }

      const qualityWarning =
        typeof aquarium.tdsPpm === 'number'
          ? aquarium.tdsPpm > 500
          : aquarium.quality < aquarium.minQuality;

      if (qualityWarning) {
        alerts.push(
          makeAlert(
            aquarium,
            'water_quality',
            'warning',
            `${aquarium.name} water purity needs attention.`,
            'water-quality'
          )
        );
      }

      return alerts;
    })
  );
}

export function useAlertsController() {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [alerts, setAlerts] = useState<AquariumAlert[]>([]);
  const [selectedAlertId, setSelectedAlertId] = useState('');
  const [selectedSeverity, setSelectedSeverity] = useState<AlertSeverityFilter>('all');
  const [selectedStatus, setSelectedStatus] = useState<AlertStatusFilter>('all');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      setAlerts(buildStaticAlerts(data.aquariums));
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
    void loadAlerts();
  }, [loadAlerts]);

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
    liveDataError: '',
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
