import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../firebase';
import {
  updateAquarium,
  updateAquariumManualStatus,
} from '../services/aquariumService';
import {
  isRealtimeDatabaseConfigured,
  publishDeviceCommand,
  subscribeToDeviceShadow,
  syncDeviceControlProfile,
} from '../services/deviceService';
import { getMonitoringData } from '../services/monitoringService';
import type {
  Aquarium,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';
import {
  buildDeviceControlProfile,
  getDeviceTelemetryState,
  getDeviceTelemetryStatusText,
  getFreshTelemetrySnapshot,
  type DeviceShadow,
} from '../types/device';
import type {
  ManualActionDisplay,
  ManualActionLock,
  MonitoringAquarium,
  SystemField,
  SystemMode,
} from '../types/monitoring';
import type { UserData, UserRole } from '../types/user';
import {
  buildMonitoringOwners,
  defaultAutomationSettings,
  getAutomationSettings,
  getHealthStatus,
  getManualActionDisplay,
  getManualActionKey,
  getManualSystemStatus,
  manualActionTiming,
  prepareAutomationSettings,
  systemStatusConfig,
} from '../utils/monitoringHelpers';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

export function useMonitoringController() {
  const [aquariums, setAquariums] = useState<MonitoringAquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<
    Record<string, string>
  >({});
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedAquariumId, setSelectedAquariumId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [systemError, setSystemError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [userName, setUserName] = useState('');
  const [savingSystemKey, setSavingSystemKey] = useState('');
  const [savingManualKey, setSavingManualKey] = useState('');
  const [systemMode, setSystemMode] = useState<SystemMode>('manual');
  const [savingMode, setSavingMode] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [automationDraft, setAutomationDraft] = useState<AutomationSettings>(
    defaultAutomationSettings
  );
  const [automationError, setAutomationError] = useState('');
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingAutomationEnabled, setSavingAutomationEnabled] = useState(false);
  const [manualActionLocks, setManualActionLocks] = useState<
    Record<string, ManualActionLock>
  >({});
  const [manualNow, setManualNow] = useState(() => Date.now());
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());
  const manualTimersRef = useRef<Set<number>>(new Set());

  const resetMonitoringData = useCallback(() => {
    setAquariums([]);
    setDeviceShadows({});
    setDeviceSubscriptionErrors({});
    setUsers([]);
    setSelectedOwnerId('');
    setSelectedAquariumId('');
  }, []);

  const loadMonitoringData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setSystemError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        resetMonitoringData();
        return;
      }

      const data = await getMonitoringData(currentUser.uid);

      if (!data) {
        setError('User profile not found.');
        resetMonitoringData();
        return;
      }

      setUserRole(data.userProfile.role);
      setUserName(data.userProfile.name);
      setAquariums(data.aquariums);
      setUsers(data.users);

      if (data.userProfile.role === 'Admin') {
        setSelectedOwnerId((prev) => {
          if (!prev) {
            return '';
          }

          const ownerStillExists =
            data.users.some((user) => user.id === prev) ||
            data.aquariums.some((aquarium) => aquarium.ownerId === prev);

          return ownerStillExists ? prev : '';
        });
        setSelectedAquariumId('');
      } else if (data.aquariums.length > 0) {
        setSelectedAquariumId((prev) =>
          prev && data.aquariums.some((aquarium) => aquarium.id === prev) ? prev : ''
        );
      } else {
        setSelectedAquariumId('');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load monitoring data.');
      setSystemError('');
      resetMonitoringData();
    } finally {
      setLoading(false);
    }
  }, [resetMonitoringData]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadMonitoringData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, [loadMonitoringData]);

  useEffect(() => {
    const tickTimer = window.setInterval(() => {
      setManualNow(Date.now());
    }, 1000);

    return () => window.clearInterval(tickTimer);
  }, []);

  useEffect(() => {
    const telemetryTickTimer = window.setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => window.clearInterval(telemetryTickTimer);
  }, []);

  useEffect(() => {
    const manualTimers = manualTimersRef.current;

    return () => {
      for (const timer of manualTimers) {
        window.clearTimeout(timer);
      }

      manualTimers.clear();
    };
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
          onError: (error) => {
            setDeviceSubscriptionErrors((prev) => ({
              ...prev,
              [aquarium.id]: getErrorMessage(
                error,
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

  useEffect(() => {
    if (!selectedAquariumId || savingMode) {
      return;
    }

    const shadowMode = deviceShadows[selectedAquariumId]?.control?.mode;

    if (shadowMode && shadowMode !== systemMode) {
      setSystemMode(shadowMode);
    }
  }, [deviceShadows, savingMode, selectedAquariumId, systemMode]);

  const liveAquariums = useMemo(() => {
    return aquariums.map((aquarium) => {
      const telemetry = deviceShadows[aquarium.id]?.telemetry;
      const telemetryState = getDeviceTelemetryState(telemetry, telemetryNow);
      const snapshot = getFreshTelemetrySnapshot(telemetry, telemetryNow);

      return {
        ...aquarium,
        temp: snapshot ? snapshot.temperatureC : aquarium.temp,
        level: snapshot ? snapshot.waterLevelPercent : aquarium.level,
        tdsPpm: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPpm ?? aquarium.tdsPpm : aquarium.tdsPpm,
        ph: snapshot?.ph ?? aquarium.ph,
        turbidity: snapshot?.turbidity ?? aquarium.turbidity,
        quality: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
        filter: snapshot?.filterState ?? aquarium.filter,
        healthStatus: snapshot
          ? getHealthStatus(
              snapshot.waterLevelPercent,
              snapshot.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
              aquarium.minLevel,
              aquarium.minQuality,
              snapshot.hasFreshPurityTelemetry,
              snapshot.tdsPpm
            )
          : 'warning',
        hasFreshTelemetry: Boolean(snapshot),
        hasFreshTemperatureTelemetry: Boolean(snapshot?.hasFreshTemperatureTelemetry),
        hasFreshPurityTelemetry: Boolean(snapshot?.hasFreshPurityTelemetry),
        telemetryState,
        manualStatus: snapshot?.filterState
          ? {
              ...getManualSystemStatus(aquarium),
              filter: snapshot.filterState,
            }
          : aquarium.manualStatus,
      };
    });
  }, [aquariums, deviceShadows, telemetryNow]);

  const ownerCards = useMemo(
    () => buildMonitoringOwners(liveAquariums, users),
    [liveAquariums, users]
  );

  const selectedOwner = useMemo(() => {
    return ownerCards.find((owner) => owner.id === selectedOwnerId);
  }, [ownerCards, selectedOwnerId]);

  const selectedAquarium = useMemo(() => {
    return liveAquariums.find((aquarium) => aquarium.id === selectedAquariumId) || null;
  }, [liveAquariums, selectedAquariumId]);

  const liveDataError = useMemo(() => {
    const preferredAquariums =
      userRole === 'Admin' && selectedOwnerId
        ? liveAquariums.filter((aquarium) => aquarium.ownerId === selectedOwnerId)
        : selectedAquariumId
          ? liveAquariums.filter((aquarium) => aquarium.id === selectedAquariumId)
          : liveAquariums;
    const preferredAquariumIds = preferredAquariums.map((aquarium) => aquarium.id);

    for (const aquariumId of preferredAquariumIds) {
      const aquariumError = deviceSubscriptionErrors[aquariumId];

      if (aquariumError) {
        return aquariumError;
      }
    }

    const telemetryIssue = preferredAquariums.find(
      (aquarium) => aquarium.telemetryState !== 'live'
    );

    if (telemetryIssue) {
      return `${telemetryIssue.name}: ${getDeviceTelemetryStatusText(
        telemetryIssue.telemetryState
      )}`;
    }

    return Object.values(deviceSubscriptionErrors).find(Boolean) || '';
  }, [
    deviceSubscriptionErrors,
    liveAquariums,
    selectedAquariumId,
    selectedOwnerId,
    userRole,
  ]);

  const automationSettings = useMemo(() => {
    return selectedAquarium ? getAutomationSettings(selectedAquarium) : null;
  }, [selectedAquarium]);

  const manualActions = useMemo<Record<SystemField, ManualActionDisplay> | null>(() => {
    if (!selectedAquarium) {
      return null;
    }

    const manualSystemStatus = getManualSystemStatus(selectedAquarium);
    const displayOptions = {
      aquariumId: selectedAquarium.id,
      locks: manualActionLocks,
      manualStatus: manualSystemStatus,
      now: manualNow,
      savingManualKey,
    };

    return {
      feeder: getManualActionDisplay({ ...displayOptions, field: 'feeder' }),
      light: getManualActionDisplay({ ...displayOptions, field: 'light' }),
      filter: getManualActionDisplay({ ...displayOptions, field: 'filter' }),
    };
  }, [manualActionLocks, manualNow, savingManualKey, selectedAquarium]);

  const updateAquariumStatusInState = (
    aquariumId: string,
    updates: Partial<Pick<Aquarium, SystemField>>
  ) => {
    setAquariums((prev) =>
      prev.map((aquarium) =>
        aquarium.id === aquariumId ? { ...aquarium, ...updates } : aquarium
      )
    );
  };

  const updateAquariumAutomationInState = (
    aquariumId: string,
    nextAutomationSettings: AutomationSettings | undefined
  ) => {
    setAquariums((prev) =>
      prev.map((aquarium) =>
        aquarium.id === aquariumId
          ? { ...aquarium, automationSettings: nextAutomationSettings }
          : aquarium
      )
    );
  };

  const updateAquariumManualStatusInState = (
    aquariumId: string,
    updates: Partial<ManualSystemStatus>
  ) => {
    setAquariums((prev) =>
      prev.map((aquarium) =>
        aquarium.id === aquariumId
          ? {
              ...aquarium,
              manualStatus: {
                ...getManualSystemStatus(aquarium),
                ...updates,
              },
            }
          : aquarium
      )
    );
  };

  const closeAutomationEditor = () => {
    setShowAutomationModal(false);
    setAutomationError('');
  };

  const openAutomationEditor = () => {
    if (!selectedAquarium) {
      return;
    }

    setAutomationDraft(getAutomationSettings(selectedAquarium));
    setAutomationError('');
    setShowAutomationModal(true);
  };

  const updateAutomationDraft = <Field extends keyof AutomationSettings>(
    field: Field,
    value: AutomationSettings[Field]
  ) => {
    setAutomationDraft((prev) => ({ ...prev, [field]: value }));
  };

  const updateFeedingTime = (index: number, value: string) => {
    setAutomationDraft((prev) => ({
      ...prev,
      feedingTimes: prev.feedingTimes.map((time, timeIndex) =>
        timeIndex === index ? value : time
      ),
    }));
  };

  const addFeedingTime = () => {
    setAutomationDraft((prev) => ({
      ...prev,
      feedingTimes: [...prev.feedingTimes, '12:00'],
    }));
  };

  const removeFeedingTime = (index: number) => {
    setAutomationDraft((prev) => ({
      ...prev,
      feedingTimes:
        prev.feedingTimes.length === 1
          ? prev.feedingTimes
          : prev.feedingTimes.filter((_, timeIndex) => timeIndex !== index),
    }));
  };

  const setManualActionLock = (
    aquariumId: string,
    field: SystemField,
    startedAt: number
  ) => {
    const timing = manualActionTiming[field];
    const key = getManualActionKey(aquariumId, field);

    setManualNow(startedAt);
    setManualActionLocks((prev) => ({
      ...prev,
      [key]: {
        activeUntil: startedAt + timing.activeMs,
        cooldownUntil: startedAt + timing.activeMs + timing.cooldownMs,
      },
    }));
  };

  const clearManualActionLock = (aquariumId: string, field: SystemField) => {
    const key = getManualActionKey(aquariumId, field);

    setManualActionLocks((prev) => {
      const next = { ...prev };

      delete next[key];

      return next;
    });
  };

  const syncAquariumDeviceProfile = useCallback(
    async (
      aquarium: Pick<Aquarium, 'automationSettings' | 'filter' | 'id' | 'light'>,
      nextMode = systemMode,
      nextSettings?: AutomationSettings
    ) => {
      if (!isRealtimeDatabaseConfigured()) {
        return;
      }

      const profile = buildDeviceControlProfile({
        aquarium,
        automationSettings: nextSettings || getAutomationSettings(aquarium),
        mode: nextMode,
      });

      await syncDeviceControlProfile(aquarium.id, profile);
    },
    [systemMode]
  );

  const publishAquariumCommand = useCallback(
    async (
      aquariumId: string,
      type: 'feed_now' | 'set_filter_state' | 'set_light_state',
      options?: {
        durationMs?: number;
        requestedBy?: string;
        state?: 'Active' | 'Inactive' | 'On' | 'Off';
      }
    ) => {
      if (!isRealtimeDatabaseConfigured()) {
        return;
      }

      const requestedAt = Date.now();

      await publishDeviceCommand({
        aquariumId,
        commandId: `${type}-${requestedAt}`,
        type,
        requestedAt,
        requestedBy: options?.requestedBy,
        state: options?.state,
        durationMs: options?.durationMs,
      });
    },
    []
  );

  const handleSystemToggle = async (field: SystemField) => {
    if (!selectedAquarium) {
      return false;
    }

    const statusConfig = systemStatusConfig[field];
    const currentValue = selectedAquarium[field];
    const nextValue =
      currentValue === statusConfig.activeValue
        ? statusConfig.inactiveValue
        : statusConfig.activeValue;
    const previousValue = currentValue;
    const updates: Partial<Pick<Aquarium, SystemField>> = {};

    updates[field] = nextValue;
    setSavingSystemKey(`${selectedAquarium.id}-${field}`);
    setSystemError('');
    updateAquariumStatusInState(selectedAquarium.id, updates);

    try {
      await updateAquarium(selectedAquarium.id, updates);
      const nextAquarium = { ...selectedAquarium, ...updates };

      await syncAquariumDeviceProfile(nextAquarium);
      return true;
    } catch (err) {
      console.error(err);
      updates[field] = previousValue;
      updateAquariumStatusInState(selectedAquarium.id, updates);
      setSystemError('Failed to update system status.');
      return false;
    } finally {
      setSavingSystemKey('');
    }
  };

  const handleManualFeeding = async () => {
    if (!selectedAquarium) {
      return false;
    }

    const aquariumId = selectedAquarium.id;
    const realtimeEnabled = isRealtimeDatabaseConfigured();
    let commandSent = false;

    setSavingManualKey(`${aquariumId}-feeder`);
    setSystemError('');
    updateAquariumManualStatusInState(aquariumId, { feeder: 'Active' });

    try {
      if (realtimeEnabled) {
        await publishAquariumCommand(aquariumId, 'feed_now', {
          durationMs: manualActionTiming.feeder.activeMs,
          requestedBy: auth.currentUser?.uid,
        });
        commandSent = true;
      }

      try {
        await updateAquariumManualStatus(aquariumId, { feeder: 'Active' });
      } catch (err) {
        console.error(err);

        if (!commandSent) {
          throw err;
        }

        setSystemError('Feeding command sent, but dashboard status could not be saved.');
      }

      const resetTimer = window.setTimeout(() => {
        manualTimersRef.current.delete(resetTimer);
        updateAquariumManualStatusInState(aquariumId, { feeder: 'Inactive' });
        void updateAquariumManualStatus(aquariumId, { feeder: 'Inactive' }).catch(
          (err) => {
            console.error(err);
            setSystemError('Failed to reset feeder after manual feeding.');
          }
        );
      }, manualActionTiming.feeder.activeMs);

      manualTimersRef.current.add(resetTimer);
      return true;
    } catch (err) {
      console.error(err);
      updateAquariumManualStatusInState(aquariumId, {
        feeder: 'Inactive',
      });
      setSystemError(
        realtimeEnabled
          ? getErrorMessage(err, 'Failed to send feeding command.')
          : getErrorMessage(err, 'Failed to start manual feeding.')
      );
      return false;
    } finally {
      setSavingManualKey('');
    }
  };

  const handleManualSystemCommand = async (
    field: Exclude<SystemField, 'feeder'>
  ) => {
    if (!selectedAquarium) {
      return false;
    }

    const aquariumId = selectedAquarium.id;
    const previousStatus = getManualSystemStatus(selectedAquarium);
    const realtimeEnabled = isRealtimeDatabaseConfigured();
    const statusConfig = systemStatusConfig[field];
    const currentValue = previousStatus[field];
    const nextValue =
      currentValue === statusConfig.activeValue
        ? statusConfig.inactiveValue
        : statusConfig.activeValue;
    const updates: Partial<ManualSystemStatus> = {};
    let commandSent = false;

    updates[field] = nextValue;
    setSavingManualKey(`${aquariumId}-${field}`);
    setSystemError('');
    updateAquariumManualStatusInState(aquariumId, updates);

    try {
      if (realtimeEnabled) {
        await publishAquariumCommand(
          aquariumId,
          field === 'light' ? 'set_light_state' : 'set_filter_state',
          {
            requestedBy: auth.currentUser?.uid,
            state: nextValue as 'Active' | 'Inactive' | 'On' | 'Off',
          }
        );
        commandSent = true;
      }

      try {
        await updateAquariumManualStatus(aquariumId, updates);
      } catch (err) {
        console.error(err);

        if (!commandSent) {
          throw err;
        }

        setSystemError('Command sent, but dashboard status could not be saved.');
      }

      await syncAquariumDeviceProfile(
        {
          ...selectedAquarium,
          ...(field === 'light' ? { light: nextValue } : { filter: nextValue }),
        },
        systemMode
      );

      return true;
    } catch (err) {
      console.error(err);

      const rollback: Partial<ManualSystemStatus> = {};
      rollback[field] = previousStatus[field];
      updateAquariumManualStatusInState(aquariumId, rollback);
      setSystemError(
        realtimeEnabled
          ? getErrorMessage(err, 'Failed to send manual command.')
          : getErrorMessage(err, 'Failed to apply manual command.')
      );
      return false;
    } finally {
      setSavingManualKey('');
    }
  };

  const handleManualAction = async (field: SystemField) => {
    if (!selectedAquarium) {
      return;
    }

    const actionKey = getManualActionKey(selectedAquarium.id, field);
    const existingLock = manualActionLocks[actionKey];

    if (
      savingManualKey ||
      (existingLock && existingLock.cooldownUntil > manualNow)
    ) {
      return;
    }

    const startedAt = Date.now();

    setManualActionLock(selectedAquarium.id, field, startedAt);

    const actionSucceeded =
      field === 'feeder'
        ? await handleManualFeeding()
        : await handleManualSystemCommand(field);

    if (!actionSucceeded) {
      clearManualActionLock(selectedAquarium.id, field);
    }
  };

  const handleAutomationSave = async () => {
    if (!selectedAquarium) {
      return;
    }

    const { settings: nextSettings, error: validationError } =
      prepareAutomationSettings(automationDraft);

    if (!nextSettings) {
      setAutomationError(validationError);
      return;
    }

    const previousSettings = selectedAquarium.automationSettings;

    setSavingAutomation(true);
    setAutomationError('');
    updateAquariumAutomationInState(selectedAquarium.id, nextSettings);

    try {
      await updateAquarium(selectedAquarium.id, {
        automationSettings: nextSettings,
      });
      await syncAquariumDeviceProfile(selectedAquarium, systemMode, nextSettings);
      setShowAutomationModal(false);
    } catch (err) {
      console.error(err);
      updateAquariumAutomationInState(selectedAquarium.id, previousSettings);
      setAutomationError('Failed to save automation settings.');
    } finally {
      setSavingAutomation(false);
    }
  };

  const handleAutomationEnabledToggle = async () => {
    if (!selectedAquarium || !automationSettings) {
      return;
    }

    const previousSettings = selectedAquarium.automationSettings;
    const nextSettings: AutomationSettings = {
      ...automationSettings,
      enabled: !automationSettings.enabled,
    };

    setSavingAutomationEnabled(true);
    setSystemError('');
    updateAquariumAutomationInState(selectedAquarium.id, nextSettings);

    try {
      await updateAquarium(selectedAquarium.id, {
        automationSettings: nextSettings,
      });
      await syncAquariumDeviceProfile(selectedAquarium, systemMode, nextSettings);
    } catch (err) {
      console.error(err);
      updateAquariumAutomationInState(selectedAquarium.id, previousSettings);
      setSystemError('Failed to update automation mode.');
    } finally {
      setSavingAutomationEnabled(false);
    }
  };

  const handleSystemModeChange = async (mode: SystemMode) => {
    if (!selectedAquarium || mode === systemMode) {
      return;
    }

    const previousMode = systemMode;

    setSavingMode(true);
    setSystemError('');
    setSystemMode(mode);

    try {
      await syncAquariumDeviceProfile(selectedAquarium, mode);
    } catch (err) {
      console.error(err);
      setSystemMode(previousMode);
      setSystemError('Failed to update control mode.');
    } finally {
      setSavingMode(false);
    }
  };

  const selectAquarium = (aquarium: MonitoringAquarium) => {
    setSystemMode('manual');
    setSavingMode(false);
    setShowAutomationModal(false);
    setAutomationError('');
    setSelectedAquariumId(aquarium.id);
  };

  const backToAquariums = () => {
    setSystemMode('manual');
    setSavingMode(false);
    setShowAutomationModal(false);
    setAutomationError('');
    setSelectedAquariumId('');
  };

  return {
    aquariums: liveAquariums,
    automationDraft,
    automationEnabled: Boolean(automationSettings?.enabled),
    automationError,
    automationSettings,
    error,
    liveDataError,
    loading,
    manualActions,
    ownerCards,
    savingAutomation,
    savingAutomationEnabled,
    savingMode,
    savingSystemKey,
    selectedAquarium,
    selectedOwner,
    showAutomationModal,
    systemError,
    systemMode,
    userName,
    userRole,
    actions: {
      addFeedingTime,
      backToAquariums,
      backToUsers: () => setSelectedOwnerId(''),
      closeAutomationEditor,
      handleAutomationEnabledToggle,
      handleAutomationSave,
      handleManualAction,
      handleSystemModeChange,
      handleSystemToggle,
      loadMonitoringData,
      openAutomationEditor,
      removeFeedingTime,
      selectAquarium,
      selectOwner: (ownerId: string) => setSelectedOwnerId(ownerId),
      updateAutomationDraft,
      updateFeedingTime,
    },
  };
}
