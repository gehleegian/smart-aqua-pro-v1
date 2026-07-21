import { useCallback, useEffect, useMemo, useState } from 'react';
import type { UserData } from '@smartaqua/shared';
import { auth } from '../services/firebase';
import { getDashboardData } from '../services/dashboardService';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import type { DeviceShadow } from '../types/device';
import type { DashboardAquarium, DashboardSummaryCard, DashboardTankStat, OwnerGroup } from '../types/dashboard';
import type { UserRole } from '@smartaqua/shared';
import {
  buildAdminActivities,
  buildAdminAlerts,
  buildAdminSummaryCards,
  buildOwnerGroups,
  buildUserActivities,
  buildUserAlerts,
  buildUserSummaryCards,
  getDashboardEmptyMessage,
  getErrorMessage,
  getStatsForTank,
  mergeDashboardAquariums,
} from '../utils/dashboardHelpers';
import { getDeviceTelemetryStatusText } from '../types/device';

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

  const telemetryIssue = visibleAquariums.find((aquarium) => aquarium.id === selectedTankId) ?? visibleAquariums[0];

  if (telemetryIssue && telemetryIssue.telemetryState !== 'live') {
    return `${telemetryIssue.name}: ${getDeviceTelemetryStatusText(telemetryIssue.telemetryState)}`;
  }

  return Object.values(deviceSubscriptionErrors).find(Boolean) || '';
}

export function useDashboardScreen() {
  const [aquariums, setAquariums] = useState<DashboardAquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [userName, setUserName] = useState('');
  const [users, setUsers] = useState<UserData[]>([]);
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
    setUsers([]);
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

      setUserName(data.userProfile.name);
      setUserRole(data.userProfile.role);
      setAquariums(data.aquariums);
      setUsers(data.userProfile.role === 'Admin' ? data.users : []);
      setTotalUsers(data.userProfile.role === 'Admin' ? data.users.length : 0);
    } catch (loadError) {
      console.error(loadError);
      setError('Failed to load dashboard data.');
      resetDashboardData();
    } finally {
      setLoading(false);
    }
  }, [resetDashboardData]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const telemetryTickTimer = setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => clearInterval(telemetryTickTimer);
  }, []);

  useEffect(() => {
    if (aquariums.length === 0) {
      setDeviceShadows({});
      setDeviceSubscriptionErrors({});
      return;
    }

    if (!isRealtimeDatabaseConfigured()) {
      const errorMessage = 'Realtime Database is not configured. Live device data is unavailable.';

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
  const onlineUsers = useMemo(() => users.filter((user) => user.status === 'online'), [users]);

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

    const ownerAquariums = ownerGroups.find((group) => group.ownerId === nextOwnerId)?.aquariums ?? [];
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

  const selectedTank = useMemo(() => {
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
  const userWarningTanks = liveAquariums.filter((tank) => tank.status === 'warning').length;

  const stats: DashboardTankStat[] = useMemo(
    () => (selectedTank ? getStatsForTank(selectedTank) : []),
    [selectedTank]
  );

  const summaryCards: DashboardSummaryCard[] = useMemo(
    () =>
      userRole === 'Admin'
        ? buildAdminSummaryCards({
            totalUsers,
            onlineUsers: onlineUsers.length,
            totalAquariums,
            warningAquariums,
            healthyAquariums,
          })
        : buildUserSummaryCards({
            aquariumCount: aquariums.length,
            warningAquariums: userWarningTanks,
            healthyAquariums,
            selectedTankName: selectedTank?.name || 'None',
          }),
    [
      aquariums.length,
      healthyAquariums,
      selectedTank?.name,
      totalAquariums,
      onlineUsers.length,
      totalUsers,
      userRole,
      userWarningTanks,
      warningAquariums,
    ]
  );

  const alerts = useMemo(
    () => (userRole === 'Admin' ? buildAdminAlerts(ownerGroups) : buildUserAlerts(liveAquariums)),
    [liveAquariums, ownerGroups, userRole]
  );

  const activities = useMemo(
    () =>
      userRole === 'Admin' ? buildAdminActivities(ownerGroups) : buildUserActivities(liveAquariums),
    [liveAquariums, ownerGroups, userRole]
  );

  return {
    loading,
    error,
    userRole,
    userName,
    users,
    onlineUsers,
    totalUsers,
    aquariums: liveAquariums,
    ownerGroups,
    selectedOwnerGroup,
    selectedOwnerId,
    selectedTank,
    selectedTankId,
    visibleAquariums,
    liveDataError,
    summaryCards,
    stats,
    alerts,
    activities,
    emptyMessage: getDashboardEmptyMessage(userRole),
    actions: {
      loadDashboardData,
      selectOwner: setSelectedOwnerId,
      selectTank: setSelectedTankId,
    },
  };
}
