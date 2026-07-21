import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getDeviceTelemetryStatusText, type DeviceShadow } from '../types/device';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import { getDashboardData } from '../services/dashboardService';
import type {
  DashboardAquarium,
  DashboardSummaryCard,
  DashboardTankStat,
  OwnerGroup,
} from '../types/dashboard';
import type { UserRole } from '../types/user';
import {
  buildAdminActivities,
  buildAdminAlerts,
  buildAdminSummaryCards,
  buildOwnerGroups,
  buildUserActivities,
  buildUserAlerts,
  buildUserSummaryCards,
  getErrorMessage,
  getStatsForTank,
  mergeDashboardAquariums,
} from '../utils/dashboardHelpers';

function getLiveDataError(
  deviceSubscriptionErrors: Record<string, string>,
  selectedTankId: string,
  visibleAquariums: DashboardAquarium[]
) {
  const preferredAquariumIds = selectedTankId
    ? [selectedTankId]
    : visibleAquariums.map((aquarium) => aquarium.id);

  for (const aquariumId of preferredAquariumIds) {
    const aquariumError = deviceSubscriptionErrors[aquariumId];

    if (aquariumError) {
      return aquariumError;
    }
  }

  const telemetryIssue =
    visibleAquariums.find((aquarium) => aquarium.id === selectedTankId) ??
    visibleAquariums[0];

  if (telemetryIssue && telemetryIssue.telemetryState !== 'live') {
    return `${telemetryIssue.name}: ${getDeviceTelemetryStatusText(
      telemetryIssue.telemetryState
    )}`;
  }

  return Object.values(deviceSubscriptionErrors).find(Boolean) || '';
}

export function useDashboardController() {
  const [aquariums, setAquariums] = useState<DashboardAquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [totalUsers, setTotalUsers] = useState(0);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());

  const resetDashboardData = useCallback(() => {
    setAquariums([]);
    setDeviceShadows({});
    setDeviceSubscriptionErrors({});
    setSelectedOwnerId('');
    setSelectedTankId('');
    setTotalUsers(0);
  }, []);

  const loadDashboardData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        resetDashboardData();
        return;
      }

      const data = await getDashboardData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        resetDashboardData();
        return;
      }

      setUserRole(data.userProfile.role);
      setAquariums(data.aquariums);
      setTotalUsers(data.userProfile.role === 'Admin' ? data.users.length : 0);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError('Failed to load dashboard data.');
      resetDashboardData();
    } finally {
      setLoading(false);
    }
  }, [resetDashboardData]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadDashboardData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadDashboardData]);

  useEffect(() => {
    const telemetryTickTimer = window.setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => window.clearInterval(telemetryTickTimer);
  }, []);

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
    () => mergeDashboardAquariums(aquariums, deviceShadows, telemetryNow),
    [aquariums, deviceShadows, telemetryNow]
  );

  const ownerGroups = useMemo(() => buildOwnerGroups(liveAquariums), [liveAquariums]);

  useEffect(() => {
    if (userRole !== 'Admin') {
      if (liveAquariums.length > 0 && !liveAquariums.some((item) => item.id === selectedTankId)) {
        setSelectedTankId(liveAquariums[0].id);
      }
      return;
    }

    if (ownerGroups.length === 0) {
      setSelectedOwnerId('');
      setSelectedTankId('');
      return;
    }

    const hasOwner = ownerGroups.some((group) => group.ownerId === selectedOwnerId);
    const nextOwnerId = hasOwner ? selectedOwnerId : ownerGroups[0].ownerId;

    if (nextOwnerId !== selectedOwnerId) {
      setSelectedOwnerId(nextOwnerId);
    }

    const ownerAquariums =
      ownerGroups.find((group) => group.ownerId === nextOwnerId)?.aquariums ?? [];
    const hasTank = ownerAquariums.some((tank) => tank.id === selectedTankId);

    if (!hasTank && ownerAquariums.length > 0) {
      setSelectedTankId(ownerAquariums[0].id);
    }
  }, [liveAquariums, ownerGroups, selectedOwnerId, selectedTankId, userRole]);

  const selectedOwnerGroup = useMemo<OwnerGroup | null>(() => {
    if (userRole !== 'Admin') {
      return null;
    }

    return ownerGroups.find((group) => group.ownerId === selectedOwnerId) ?? null;
  }, [ownerGroups, selectedOwnerId, userRole]);

  const visibleAquariums = useMemo(() => {
    if (userRole === 'Admin') {
      return selectedOwnerGroup?.aquariums ?? [];
    }

    return liveAquariums;
  }, [liveAquariums, selectedOwnerGroup, userRole]);

  const selectedTank = useMemo<DashboardAquarium | null>(() => {
    if (visibleAquariums.length === 0) {
      return null;
    }

    return visibleAquariums.find((tank) => tank.id === selectedTankId) ?? visibleAquariums[0];
  }, [selectedTankId, visibleAquariums]);

  const liveDataError = useMemo(
    () => getLiveDataError(deviceSubscriptionErrors, selectedTankId, visibleAquariums),
    [deviceSubscriptionErrors, selectedTankId, visibleAquariums]
  );

  const totalAquariums = liveAquariums.length;
  const warningAquariums = liveAquariums.filter((tank) => tank.status === 'warning').length;
  const healthyAquariums = liveAquariums.filter((tank) => tank.status === 'healthy').length;

  const ownersNeedingAttention = ownerGroups.filter((group) => group.warningCount > 0);
  const ownersMostTanks = [...ownerGroups]
    .sort((a, b) => b.aquariums.length - a.aquariums.length)
    .slice(0, 5);
  const userWarningTanks = liveAquariums.filter((tank) => tank.status === 'warning').length;

  const stats = useMemo<DashboardTankStat[]>(
    () => (selectedTank ? getStatsForTank(selectedTank) : []),
    [selectedTank]
  );

  const adminSummaryCards = useMemo<DashboardSummaryCard[]>(
    () =>
      buildAdminSummaryCards({
        totalUsers,
        totalAquariums,
        warningAquariums,
        healthyAquariums,
      }),
    [healthyAquariums, totalAquariums, totalUsers, warningAquariums]
  );

  const userSummaryCards = useMemo<DashboardSummaryCard[]>(
    () =>
      buildUserSummaryCards({
        aquariumCount: aquariums.length,
        warningAquariums: userWarningTanks,
        healthyAquariums,
        selectedTankName: selectedTank?.name || 'None',
      }),
    [aquariums.length, healthyAquariums, selectedTank?.name, userWarningTanks]
  );

  const adminAlerts = useMemo(() => buildAdminAlerts(ownerGroups), [ownerGroups]);
  const userAlerts = useMemo(() => buildUserAlerts(liveAquariums), [liveAquariums]);
  const adminActivities = useMemo(() => buildAdminActivities(ownerGroups), [ownerGroups]);
  const userActivities = useMemo(() => buildUserActivities(liveAquariums), [liveAquariums]);

  return {
    loading,
    error,
    userRole,
    aquariums,
    liveAquariums,
    liveDataError,
    totalUsers,
    totalAquariums,
    healthyAquariums,
    warningAquariums,
    userWarningTanks,
    ownersNeedingAttention,
    ownersMostTanks,
    ownerGroups,
    selectedOwnerGroup,
    selectedOwnerId,
    selectedTank,
    selectedTankId,
    visibleAquariums,
    stats,
    adminSummaryCards,
    userSummaryCards,
    adminAlerts,
    userAlerts,
    adminActivities,
    userActivities,
    actions: {
      loadDashboardData,
      selectOwner: setSelectedOwnerId,
      selectTank: setSelectedTankId,
    },
  };
}
