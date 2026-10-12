import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import { getDashboardData } from '../services/dashboardService';
import type { DashboardAquarium } from '../types/dashboard';
import type { DeviceShadow } from '../types/device';
import type { UserRole } from '../types/user';
import {
  buildAdminActivities,
  buildAdminAlerts,
  buildAdminSummaryCards,
  mergeDashboardAquariums,
  buildOwnerGroups,
  buildUserActivities,
  buildUserAlerts,
  buildUserSummaryCards,
  getErrorMessage,
  getStatsForTank,
} from '../utils/dashboardHelpers';

export function useDashboardController() {
  const [dashboardAquariums, setDashboardAquariums] = useState<DashboardAquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<Record<string, string>>({});
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [usersCount, setUsersCount] = useState(0);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setDashboardAquariums([]);
        return;
      }

      const data = await getDashboardData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        setDashboardAquariums([]);
        return;
      }

      setUserRole(data.userProfile.role);
      setUsersCount(data.users.length);
      setDashboardAquariums(data.aquariums);
      setSelectedTankId((prev) =>
        prev && data.aquariums.some((aquarium) => aquarium.id === prev)
          ? prev
          : data.aquariums[0]?.id || ''
      );
    } catch (loadError) {
      console.error(loadError);
      setError(getErrorMessage(loadError, 'Failed to load dashboard data.'));
      setDashboardAquariums([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    const tickTimer = window.setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => window.clearInterval(tickTimer);
  }, []);

  useEffect(() => {
    if (dashboardAquariums.length === 0) {
      setDeviceShadows({});
      setDeviceSubscriptionErrors({});
      return;
    }

    if (!isRealtimeDatabaseConfigured()) {
      const errorMessage = 'Realtime Database is not configured. Live device data is unavailable.';

      setDeviceShadows({});
      setDeviceSubscriptionErrors(
        Object.fromEntries(dashboardAquariums.map((aquarium) => [aquarium.id, errorMessage]))
      );
      return;
    }

    setDeviceSubscriptionErrors({});

    const unsubscribers = dashboardAquariums.map((aquarium) =>
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
  }, [dashboardAquariums]);

  const liveAquariums = useMemo(
    () => mergeDashboardAquariums(dashboardAquariums, deviceShadows, telemetryNow),
    [dashboardAquariums, deviceShadows, telemetryNow]
  );

  const ownerGroups = useMemo(() => buildOwnerGroups(liveAquariums), [liveAquariums]);
  const selectedOwnerGroup = useMemo(
    () => ownerGroups.find((group) => group.ownerId === selectedOwnerId) || ownerGroups[0] || null,
    [ownerGroups, selectedOwnerId]
  );
  const selectedTank = useMemo(
    () =>
      liveAquariums.find((aquarium) => aquarium.id === selectedTankId) ||
      selectedOwnerGroup?.aquariums[0] ||
      liveAquariums[0] ||
      null,
    [liveAquariums, selectedOwnerGroup, selectedTankId]
  );
  const warningAquariums = liveAquariums.filter((aquarium) => aquarium.status === 'warning').length;
  const healthyAquariums = liveAquariums.length - warningAquariums;

  return {
    adminActivities: buildAdminActivities(ownerGroups),
    adminAlerts: buildAdminAlerts(ownerGroups),
    adminSummaryCards: buildAdminSummaryCards({
      totalUsers: usersCount,
      totalAquariums: liveAquariums.length,
      warningAquariums,
      healthyAquariums,
    }),
    error,
    liveAquariums,
    liveDataError: Object.values(deviceSubscriptionErrors).find(Boolean) || '',
    loading,
    ownerGroups,
    ownersMostTanks: [...ownerGroups].sort((a, b) => b.aquariums.length - a.aquariums.length).slice(0, 5),
    ownersNeedingAttention: ownerGroups.filter((group) => group.warningCount > 0),
    selectedOwnerGroup,
    selectedOwnerId,
    selectedTankId: selectedTank?.id || '',
    stats: selectedTank ? getStatsForTank(selectedTank) : [],
    userActivities: buildUserActivities(liveAquariums),
    userAlerts: buildUserAlerts(liveAquariums),
    userRole,
    userSummaryCards: buildUserSummaryCards({
      aquariumCount: liveAquariums.length,
      warningAquariums,
      healthyAquariums,
      selectedTankName: selectedTank?.name || 'None',
    }),
    actions: {
      selectOwner: setSelectedOwnerId,
      selectTank: setSelectedTankId,
    },
  };
}
