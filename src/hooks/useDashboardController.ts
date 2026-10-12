import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import { getDashboardData } from '../services/dashboardService';
import type { AquariumDirectoryEntry } from '../types/aquarium';
import type { DashboardAquarium } from '../types/dashboard';
import type { DeviceShadow } from '../types/device';
import type { UserData, UserRole } from '../types/user';
import {
  buildAdminSummaryCards,
  mergeDashboardAquariums,
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
  const [adminUsers, setAdminUsers] = useState<UserData[]>([]);
  const [aquariumDirectory, setAquariumDirectory] = useState<AquariumDirectoryEntry[]>([]);
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
      setAdminUsers(data.users);
      setAquariumDirectory(data.aquariumDirectory);
      setDashboardAquariums(data.aquariums);
      if (data.userProfile.role === 'Admin' || data.aquariums.length === 0) {
        setDeviceShadows({});
        setDeviceSubscriptionErrors({});
      }
      setSelectedTankId((prev) =>
        prev && data.aquariums.some((aquarium) => aquarium.id === prev)
          ? prev
          : data.aquariums[0]?.id || ''
      );
    } catch (loadError) {
      console.error(loadError);
      setError(getErrorMessage(loadError, 'Failed to load dashboard data.'));
      setDashboardAquariums([]);
      setAdminUsers([]);
      setAquariumDirectory([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadDashboard();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadDashboard]);

  useEffect(() => {
    if (userRole === 'Admin') {
      return;
    }

    const tickTimer = window.setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => window.clearInterval(tickTimer);
  }, [userRole]);

  useEffect(() => {
    if (userRole === 'Admin' || dashboardAquariums.length === 0) {
      return;
    }

    if (!isRealtimeDatabaseConfigured()) {
      const errorMessage = 'Realtime Database is not configured. Live device data is unavailable.';
      const errorTimer = window.setTimeout(() => {
        setDeviceShadows({});
        setDeviceSubscriptionErrors(
          Object.fromEntries(dashboardAquariums.map((aquarium) => [aquarium.id, errorMessage]))
        );
      }, 0);
      return () => window.clearTimeout(errorTimer);
    }

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
  }, [dashboardAquariums, userRole]);

  const liveAquariums = useMemo(
    () => mergeDashboardAquariums(dashboardAquariums, deviceShadows, telemetryNow),
    [dashboardAquariums, deviceShadows, telemetryNow]
  );

  const selectedTank = useMemo(
    () =>
      liveAquariums.find((aquarium) => aquarium.id === selectedTankId) ||
      liveAquariums[0] ||
      null,
    [liveAquariums, selectedTankId]
  );
  const warningAquariums = liveAquariums.filter((aquarium) => aquarium.status === 'warning').length;
  const healthyAquariums = liveAquariums.length - warningAquariums;

  return {
    adminUsers,
    aquariumDirectory,
    adminSummaryCards: buildAdminSummaryCards({
      totalUsers: adminUsers.length,
      totalAquariums: aquariumDirectory.length,
      adminUsers: adminUsers.filter((user) => user.role === 'Admin').length,
      caretakerUsers: adminUsers.filter((user) => user.role === 'User').length,
    }),
    error,
    liveAquariums,
    liveDataError: Object.values(deviceSubscriptionErrors).find(Boolean) || '',
    loading,
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
      selectTank: setSelectedTankId,
    },
  };
}
