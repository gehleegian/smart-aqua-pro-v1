import { useCallback, useEffect, useMemo, useState } from 'react';
import { auth } from '../firebase';
import { getHeaderData } from '../services/headerService';
import {
  isRealtimeDatabaseConfigured,
  subscribeToDeviceShadow,
} from '../services/deviceService';
import { syncAlertRecords } from '../services/alertRecordsService';
import type { Aquarium } from '../types/aquarium';
import type { AquariumAlert } from '../types/alerts';
import {
  getDeviceTelemetryState,
  type DeviceShadow,
} from '../types/device';
import type {
  HeaderConnectionStatus,
  HeaderNotification,
} from '../types/header';
import type { UserData, UserRole } from '../types/user';
import {
  buildAlertCandidates,
  getErrorMessage,
  getAlertStatus,
  readAlertHistory,
  sortAlertsByRecency,
  syncAlertHistory,
  writeAlertHistory,
} from '../utils/alertsHelpers';

const MAX_HEADER_NOTIFICATIONS = 8;

function buildConnectionStatus(
  userRole: UserRole,
  aquariums: Aquarium[],
  deviceShadows: Record<string, DeviceShadow>,
  deviceSubscriptionErrors: Record<string, string>
): HeaderConnectionStatus {
  const unitLabel = userRole === 'Admin' ? 'device' : 'tank';

  if (aquariums.length === 0) {
    return {
      label: userRole === 'Admin' ? 'No devices' : 'No tanks',
      detail: 'No aquariums are available for live monitoring yet.',
      tone: 'warning',
    };
  }

  const hasSubscriptionErrors = Object.values(deviceSubscriptionErrors).some(Boolean);
  const states = aquariums.map((aquarium) =>
    getDeviceTelemetryState(deviceShadows[aquarium.id]?.telemetry)
  );
  const liveCount = states.filter((state) => state === 'live').length;
  const offlineCount = states.filter((state) => state === 'offline').length;
  const unavailableCount = states.filter((state) => state === 'unavailable').length;

  if (liveCount === aquariums.length) {
    return {
      label:
        aquariums.length === 1
          ? `${unitLabel === 'device' ? 'Device' : 'Tank'} Live`
          : `All ${unitLabel === 'device' ? 'Devices' : 'Tanks'} Live`,
      detail: `${liveCount} of ${aquariums.length} ${unitLabel}${
        aquariums.length === 1 ? '' : 's'
      } reporting fresh telemetry.`,
      tone: 'online',
    };
  }

  if (liveCount > 0) {
    return {
      label: `${liveCount}/${aquariums.length} ${unitLabel === 'device' ? 'Devices' : 'Tanks'} Live`,
      detail: `${offlineCount} ${unitLabel}${offlineCount === 1 ? '' : 's'} offline, ${unavailableCount} waiting for live data.`,
      tone: 'warning',
    };
  }

  if (offlineCount > 0) {
    return {
      label: userRole === 'Admin' ? 'Devices Offline' : 'Tanks Offline',
      detail: `${offlineCount} ${unitLabel}${offlineCount === 1 ? '' : 's'} not reporting fresh telemetry.`,
      tone: 'offline',
    };
  }

  return {
    label: hasSubscriptionErrors ? 'Connection issue' : 'No live data',
    detail: hasSubscriptionErrors
      ? 'Live device connections are currently unavailable.'
      : 'Waiting for the first fresh telemetry updates from your devices.',
    tone: 'warning',
  };
}

function getReadStorageKey(userId: string) {
  return `smartaqua.headerNotificationRead.v1.${userId}`;
}

function readNotificationReadIds(storageKey: string) {
  if (typeof window === 'undefined') {
    return [] as string[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return [] as string[];
    }

    const parsed = JSON.parse(raw) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [] as string[];
  }
}

function writeNotificationReadIds(storageKey: string, ids: string[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(ids));
}

function mapHeaderNotifications(
  alerts: AquariumAlert[],
  readIds: Set<string>
): HeaderNotification[] {
  return alerts
    .filter((alert) => getAlertStatus(alert) !== 'resolved')
    .slice(0, MAX_HEADER_NOTIFICATIONS)
    .map((alert) => ({
      id: alert.id,
      fingerprint: alert.fingerprint,
      type: alert.type,
      category: alert.category,
      message: alert.message,
      tankName: alert.tankName,
      ownerName: alert.ownerName,
      timestamp: alert.lastDetectedAt,
      read: readIds.has(alert.id),
    }));
}

export function useHeaderController(user: UserData) {
  const [aquariums, setAquariums] = useState<Aquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<
    Record<string, string>
  >({});
  const [notificationReadIds, setNotificationReadIds] = useState<string[]>([]);
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());

  const currentUserId = user.id || auth.currentUser?.uid || '';
  const alertHistoryStorageKey = currentUserId
    ? `smartaqua.alertHistory.v1.${currentUserId}`
    : '';
  const notificationReadStorageKey = currentUserId ? getReadStorageKey(currentUserId) : '';

  const loadHeaderData = useCallback(async () => {
    const firebaseUser = auth.currentUser;

    if (!firebaseUser) {
      setAquariums([]);
      setDeviceShadows({});
      setDeviceSubscriptionErrors({});
      return;
    }

    try {
      const data = await getHeaderData(firebaseUser.uid);

      if (!data) {
        setAquariums([]);
        setDeviceShadows({});
        setDeviceSubscriptionErrors({});
        return;
      }

      setAquariums(data.aquariums);
    } catch (error) {
      console.error(error);
      setAquariums([]);
      setDeviceShadows({});
      setDeviceSubscriptionErrors({
        global: getErrorMessage(error, 'Header data could not be loaded.'),
      });
    }
  }, []);

  useEffect(() => {
    void loadHeaderData();
  }, [loadHeaderData]);

  useEffect(() => {
    if (!notificationReadStorageKey) {
      setNotificationReadIds([]);
      return;
    }

    setNotificationReadIds(readNotificationReadIds(notificationReadStorageKey));
  }, [notificationReadStorageKey]);

  useEffect(() => {
    const telemetryTickTimer = window.setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => window.clearInterval(telemetryTickTimer);
  }, []);

  useEffect(() => {
    if (aquariums.length === 0) {
      setDeviceShadows({});
      setDeviceSubscriptionErrors((prev) =>
        prev.global ? ({ global: prev.global } as Record<string, string>) : {}
      );
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

  const syncedAlerts = useMemo(() => {
    if (!alertHistoryStorageKey) {
      return [] as AquariumAlert[];
    }

    const existingHistory = readAlertHistory(alertHistoryStorageKey);
    const activeCandidates = buildAlertCandidates(aquariums, deviceShadows, telemetryNow);
    const nextHistory = sortAlertsByRecency(syncAlertHistory(existingHistory, activeCandidates));

    writeAlertHistory(alertHistoryStorageKey, nextHistory);

    return nextHistory;
  }, [alertHistoryStorageKey, aquariums, deviceShadows, telemetryNow]);

  useEffect(() => {
    if (syncedAlerts.length === 0) {
      return;
    }

    void syncAlertRecords(syncedAlerts).catch((syncError) => {
      console.warn('Failed to sync alert records.', syncError);
    });
  }, [syncedAlerts]);

  useEffect(() => {
    if (!notificationReadStorageKey) {
      return;
    }

    const activeNotificationIds = new Set(
      syncedAlerts
        .filter((alert) => getAlertStatus(alert) !== 'resolved')
        .map((alert) => alert.id)
    );
    const nextReadIds = notificationReadIds.filter((id) => activeNotificationIds.has(id));

    if (nextReadIds.length !== notificationReadIds.length) {
      setNotificationReadIds(nextReadIds);
      writeNotificationReadIds(notificationReadStorageKey, nextReadIds);
    }
  }, [notificationReadIds, notificationReadStorageKey, syncedAlerts]);

  const readIdSet = useMemo(() => new Set(notificationReadIds), [notificationReadIds]);

  const notifications = useMemo(
    () => mapHeaderNotifications(syncedAlerts, readIdSet),
    [readIdSet, syncedAlerts]
  );

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  const connectionStatus = useMemo(
    () =>
      buildConnectionStatus(user.role, aquariums, deviceShadows, deviceSubscriptionErrors),
    [aquariums, deviceShadows, deviceSubscriptionErrors, user.role, telemetryNow]
  );

  const markNotificationRead = useCallback(
    (notificationId: string) => {
      if (!notificationReadStorageKey) {
        return;
      }

      setNotificationReadIds((prev) => {
        if (prev.includes(notificationId)) {
          return prev;
        }

        const next = [...prev, notificationId];
        writeNotificationReadIds(notificationReadStorageKey, next);
        return next;
      });
    },
    [notificationReadStorageKey]
  );

  const markAllNotificationsRead = useCallback(() => {
    if (!notificationReadStorageKey) {
      return;
    }

    const allIds = notifications.map((notification) => notification.id);
    setNotificationReadIds(allIds);
    writeNotificationReadIds(notificationReadStorageKey, allIds);
  }, [notificationReadStorageKey, notifications]);

  return {
    connectionStatus,
    notifications,
    unreadCount,
    actions: {
      markAllNotificationsRead,
      markNotificationRead,
    },
  };
}
