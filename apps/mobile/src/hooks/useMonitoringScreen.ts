import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth } from '../services/firebase';
import { updateAquarium, updateAquariumManualStatus } from '../services/aquariumService';
import {
  isRealtimeDatabaseConfigured,
  publishDeviceCommand,
  subscribeToDeviceShadow,
  syncDeviceControlProfile,
} from '../services/deviceService';
import { getMonitoringData } from '../services/monitoringService';
import type { Aquarium, AutomationSettings, ManualSystemStatus } from '../types/aquarium';
import {
  buildDeviceControlProfile,
  getDeviceTelemetryState,
  getDeviceTelemetryStatusText,
  getFreshTelemetrySnapshot,
  type DeviceCommandState,
  type DeviceShadow,
} from '../types/device';
import type {
  ManualActionDisplay,
  ManualActionLock,
  MonitoringAquarium,
  SystemField,
  SystemMode,
} from '../types/monitoring';
import {
  getAutomationSettings,
  getHealthStatus,
  getManualActionDisplay,
  getManualActionKey,
  getManualSystemStatus,
  manualActionTiming,
  prepareAutomationSettings,
  systemStatusConfig,
} from '../utils/monitoringHelpers';
import { useSelectedAquariumSelection } from '../context/SelectedAquariumContext';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

function getControlCommandType(field: Exclude<SystemField, 'feeder'>) {
  return field === 'light' ? 'set_light_state' : 'set_filter_state';
}

export function useMonitoringScreen() {
  const [aquariums, setAquariums] = useState<MonitoringAquarium[]>([]);
  const [deviceShadows, setDeviceShadows] = useState<Record<string, DeviceShadow>>({});
  const [deviceSubscriptionErrors, setDeviceSubscriptionErrors] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [systemError, setSystemError] = useState('');
  const [userName, setUserName] = useState('');
  const [savingManualKey, setSavingManualKey] = useState('');
  const [savingMode, setSavingMode] = useState(false);
  const [savingAutomation, setSavingAutomation] = useState(false);
  const [savingAutomationEnabled, setSavingAutomationEnabled] = useState(false);
  const [showAutomationEditor, setShowAutomationEditor] = useState(false);
  const [automationDraft, setAutomationDraft] = useState<AutomationSettings>(
    getAutomationSettings(null)
  );
  const [automationError, setAutomationError] = useState('');
  const [systemMode, setSystemMode] = useState<SystemMode>('manual');
  const [manualActionLocks, setManualActionLocks] = useState<
    Record<string, ManualActionLock>
  >({});
  const [manualNow, setManualNow] = useState(() => Date.now());
  const [telemetryNow, setTelemetryNow] = useState(() => Date.now());
  const manualTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const {
    selectedAquariumId,
    selectionReady,
    setSelectedAquariumId,
  } = useSelectedAquariumSelection();

  const resetMonitoringData = useCallback(() => {
    setAquariums([]);
    setDeviceShadows({});
    setDeviceSubscriptionErrors({});
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

      setUserName(data.userProfile.name);
      setAquariums(data.aquariums);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, 'Failed to load monitoring data.'));
      setSystemError('');
      resetMonitoringData();
    } finally {
      setLoading(false);
    }
  }, [resetMonitoringData]);

  useEffect(() => {
    void loadMonitoringData();
  }, [loadMonitoringData]);

  useEffect(() => {
    const tickTimer = setInterval(() => {
      setManualNow(Date.now());
    }, 1000);

    return () => clearInterval(tickTimer);
  }, []);

  useEffect(() => {
    const telemetryTickTimer = setInterval(() => {
      setTelemetryNow(Date.now());
    }, 5000);

    return () => clearInterval(telemetryTickTimer);
  }, []);

  useEffect(() => {
    const manualTimers = manualTimersRef.current;

    return () => {
      for (const timer of manualTimers) {
        clearTimeout(timer);
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

  const liveAquariums = useMemo(() => {
    return aquariums.map((aquarium) => {
      const telemetry = deviceShadows[aquarium.id]?.telemetry;
      const telemetryState = getDeviceTelemetryState(telemetry, telemetryNow);
      const snapshot = getFreshTelemetrySnapshot(telemetry, telemetryNow);
      const manualStatus = snapshot?.filterState
        ? {
            ...getManualSystemStatus(aquarium),
            filter: snapshot.filterState,
          }
        : aquarium.manualStatus;

      return {
        ...aquarium,
        temp: snapshot?.hasFreshTemperatureTelemetry ? snapshot.temperatureC : aquarium.temp,
        level: snapshot ? snapshot.waterLevelPercent : aquarium.level,
        ph: snapshot?.ph ?? aquarium.ph,
        turbidity: snapshot?.turbidity ?? aquarium.turbidity,
        tdsPpm: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPpm ?? aquarium.tdsPpm : aquarium.tdsPpm,
        quality: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
        filter: snapshot?.filterState ?? aquarium.filter,
        manualStatus,
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
      };
    });
  }, [aquariums, deviceShadows, telemetryNow]);

  useEffect(() => {
    if (!selectionReady || liveAquariums.length === 0) {
      return;
    }

    const hasSelectedAquarium = liveAquariums.some((aquarium) => aquarium.id === selectedAquariumId);

    if (!selectedAquariumId || !hasSelectedAquarium) {
      setSelectedAquariumId(liveAquariums[0].id);
    }
  }, [liveAquariums, selectedAquariumId, selectionReady, setSelectedAquariumId]);

  const selectedAquarium = useMemo(
    () => liveAquariums.find((aquarium) => aquarium.id === selectedAquariumId) || null,
    [liveAquariums, selectedAquariumId]
  );

  const selectedDeviceShadow = selectedAquarium
    ? deviceShadows[selectedAquarium.id] || null
    : null;

  const selectedTelemetrySnapshot = useMemo(
    () => getFreshTelemetrySnapshot(selectedDeviceShadow?.telemetry, telemetryNow),
    [selectedDeviceShadow?.telemetry, telemetryNow]
  );

  const summary = useMemo(
    () => ({
      total: liveAquariums.length,
      live: liveAquariums.filter((aquarium) => aquarium.hasFreshTelemetry).length,
      warning: liveAquariums.filter((aquarium) => aquarium.healthStatus === 'warning').length,
    }),
    [liveAquariums]
  );

  useEffect(() => {
    if (!selectedAquariumId && liveAquariums.length > 0) {
      setSelectedAquariumId(liveAquariums[0].id);
    }
  }, [liveAquariums, selectedAquariumId]);

  useEffect(() => {
    if (!selectedAquarium || savingMode) {
      return;
    }

    const shadowMode = selectedDeviceShadow?.control?.mode;

    if (shadowMode && shadowMode !== systemMode) {
      setSystemMode(shadowMode);
    }
  }, [savingMode, selectedAquarium, selectedDeviceShadow?.control?.mode, systemMode]);

  const liveDataError = useMemo(() => {
    if (selectedAquarium) {
      const aquariumError = deviceSubscriptionErrors[selectedAquarium.id];

      if (aquariumError) {
        return aquariumError;
      }

      if (selectedAquarium.telemetryState !== 'live') {
        return `${selectedAquarium.name}: ${getDeviceTelemetryStatusText(
          selectedAquarium.telemetryState
        )}`;
      }
    }

    return Object.values(deviceSubscriptionErrors).find(Boolean) || '';
  }, [deviceSubscriptionErrors, selectedAquarium]);

  const manualActions = useMemo<Record<SystemField, ManualActionDisplay> | null>(() => {
    if (!selectedAquarium) {
      return null;
    }

    const manualStatus = getManualSystemStatus(selectedAquarium);
    const displayOptions = {
      aquariumId: selectedAquarium.id,
      locks: manualActionLocks,
      manualStatus,
      now: manualNow,
      savingManualKey,
    };

    return {
      feeder: getManualActionDisplay({ ...displayOptions, field: 'feeder' }),
      light: getManualActionDisplay({ ...displayOptions, field: 'light' }),
      filter: getManualActionDisplay({ ...displayOptions, field: 'filter' }),
    };
  }, [manualActionLocks, manualNow, savingManualKey, selectedAquarium]);

  const automationSettings = useMemo(
    () => (selectedAquarium ? getAutomationSettings(selectedAquarium) : null),
    [selectedAquarium]
  );

  useEffect(() => {
    if (!selectedAquarium) {
      setShowAutomationEditor(false);
      setAutomationError('');
      return;
    }

    setAutomationDraft(getAutomationSettings(selectedAquarium));
    setAutomationError('');
    setShowAutomationEditor(false);
  }, [selectedAquarium?.id]);

  const updateAquariumManualStatusInState = useCallback(
    (aquariumId: string, updates: Partial<ManualSystemStatus>) => {
      setAquariums((currentAquariums) =>
        currentAquariums.map((aquarium) =>
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
    },
    []
  );

  const updateAquariumAutomationInState = useCallback(
    (aquariumId: string, nextAutomationSettings: AutomationSettings | undefined) => {
      setAquariums((currentAquariums) =>
        currentAquariums.map((aquarium) =>
          aquarium.id === aquariumId
            ? { ...aquarium, automationSettings: nextAutomationSettings }
            : aquarium
        )
      );
    },
    []
  );

  const setManualActionLock = useCallback(
    (aquariumId: string, field: SystemField, startedAt: number) => {
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
    },
    []
  );

  const clearManualActionLock = useCallback((aquariumId: string, field: SystemField) => {
    const key = getManualActionKey(aquariumId, field);

    setManualActionLocks((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const syncAquariumDeviceProfile = useCallback(
    async (
      aquarium: Pick<Aquarium, 'automationSettings' | 'filter' | 'id' | 'light'>,
      nextMode = systemMode
    ) => {
      if (!isRealtimeDatabaseConfigured()) {
        return;
      }

      const profile = buildDeviceControlProfile({
        aquarium,
        automationSettings: getAutomationSettings(aquarium),
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
        state?: DeviceCommandState;
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
        requestedBy: auth.currentUser?.uid,
        state: options?.state,
        durationMs: options?.durationMs,
      });
    },
    []
  );

  const handleManualFeeding = useCallback(async () => {
    if (!selectedAquarium) {
      return false;
    }

    const aquariumId = selectedAquarium.id;
    let commandSent = false;

    setSavingManualKey(getManualActionKey(aquariumId, 'feeder'));
    setSystemError('');
    updateAquariumManualStatusInState(aquariumId, { feeder: 'Active' });

    try {
      if (isRealtimeDatabaseConfigured()) {
        await publishAquariumCommand(aquariumId, 'feed_now', {
          durationMs: manualActionTiming.feeder.activeMs,
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

      const resetTimer = setTimeout(() => {
        manualTimersRef.current.delete(resetTimer);
        updateAquariumManualStatusInState(aquariumId, { feeder: 'Inactive' });
        void updateAquariumManualStatus(aquariumId, { feeder: 'Inactive' }).catch((err) => {
          console.error(err);
          setSystemError('Failed to reset feeder after manual feeding.');
        });
      }, manualActionTiming.feeder.activeMs);

      manualTimersRef.current.add(resetTimer);
      return true;
    } catch (err) {
      console.error(err);
      updateAquariumManualStatusInState(aquariumId, { feeder: 'Inactive' });
      setSystemError(getErrorMessage(err, 'Failed to send feeding command.'));
      return false;
    } finally {
      setSavingManualKey('');
    }
  }, [publishAquariumCommand, selectedAquarium, updateAquariumManualStatusInState]);

  const handleManualSystemCommand = useCallback(
    async (field: Exclude<SystemField, 'feeder'>) => {
      if (!selectedAquarium) {
        return false;
      }

      const aquariumId = selectedAquarium.id;
      const previousStatus = getManualSystemStatus(selectedAquarium);
      const statusConfig = systemStatusConfig[field];
      const currentValue = previousStatus[field];
      const nextValue =
        currentValue === statusConfig.activeValue
          ? statusConfig.inactiveValue
          : statusConfig.activeValue;
      const updates = { [field]: nextValue } as Partial<ManualSystemStatus>;
      let commandSent = false;

      setSavingManualKey(getManualActionKey(aquariumId, field));
      setSystemError('');
      updateAquariumManualStatusInState(aquariumId, updates);

      try {
        if (isRealtimeDatabaseConfigured()) {
          await publishAquariumCommand(aquariumId, getControlCommandType(field), {
            state: nextValue as DeviceCommandState,
          });
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
        updateAquariumManualStatusInState(aquariumId, {
          [field]: previousStatus[field],
        } as Partial<ManualSystemStatus>);
        setSystemError(getErrorMessage(err, 'Failed to send manual command.'));
        return false;
      } finally {
        setSavingManualKey('');
      }
    },
    [
      publishAquariumCommand,
      selectedAquarium,
      syncAquariumDeviceProfile,
      systemMode,
      updateAquariumManualStatusInState,
    ]
  );

  const handleManualAction = useCallback(
    async (field: SystemField) => {
      if (!selectedAquarium || !manualActions) {
        return;
      }

      if (savingManualKey || manualActions[field].disabled) {
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
    },
    [
      clearManualActionLock,
      handleManualFeeding,
      handleManualSystemCommand,
      manualActions,
      savingManualKey,
      selectedAquarium,
      setManualActionLock,
    ]
  );

  const handleSystemModeChange = useCallback(
    async (mode: SystemMode) => {
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
        setSystemError(getErrorMessage(err, 'Failed to update control mode.'));
      } finally {
        setSavingMode(false);
      }
    },
    [selectedAquarium, syncAquariumDeviceProfile, systemMode]
  );

  const handleAutomationEnabledToggle = useCallback(async () => {
    if (!selectedAquarium || !automationSettings) {
      return;
    }

    const previousSettings = selectedAquarium.automationSettings;
    const nextEnabled = !automationSettings.enabled;
    const shouldStopFiltration =
      automationSettings.enabled &&
      (getManualSystemStatus(selectedAquarium).filter === 'Active' ||
        selectedAquarium.filter === 'Active' ||
        selectedTelemetrySnapshot?.filterState === 'Active');
    const nextSettings: AutomationSettings = {
      ...automationSettings,
      enabled: nextEnabled,
    };

    setSavingAutomationEnabled(true);
    setSystemError('');
    updateAquariumAutomationInState(selectedAquarium.id, nextSettings);
    if (shouldStopFiltration) {
      updateAquariumManualStatusInState(selectedAquarium.id, { filter: 'Inactive' });
    }

    try {
      await updateAquarium(selectedAquarium.id, {
        automationSettings: nextSettings,
        ...(shouldStopFiltration ? { filter: 'Inactive' } : {}),
      });
      if (shouldStopFiltration) {
        await publishAquariumCommand(selectedAquarium.id, 'set_filter_state', {
          state: 'Inactive',
        });
        await updateAquariumManualStatus(selectedAquarium.id, { filter: 'Inactive' });
      }
      await syncAquariumDeviceProfile(
        {
          ...selectedAquarium,
          automationSettings: nextSettings,
          ...(shouldStopFiltration ? { filter: 'Inactive' } : {}),
        },
        systemMode
      );
    } catch (err) {
      console.error(err);
      updateAquariumAutomationInState(selectedAquarium.id, previousSettings);
      if (shouldStopFiltration) {
        updateAquariumManualStatusInState(selectedAquarium.id, { filter: 'Active' });
      }
      setSystemError(getErrorMessage(err, 'Failed to update automation mode.'));
    } finally {
      setSavingAutomationEnabled(false);
    }
  }, [
    automationSettings,
    selectedAquarium,
    selectedTelemetrySnapshot?.filterState,
    publishAquariumCommand,
    syncAquariumDeviceProfile,
    systemMode,
    updateAquariumAutomationInState,
    updateAquariumManualStatusInState,
  ]);

  const openAutomationEditor = useCallback(() => {
    if (!automationSettings) {
      return;
    }

    setAutomationDraft(automationSettings);
    setAutomationError('');
    setShowAutomationEditor(true);
  }, [automationSettings]);

  const closeAutomationEditor = useCallback(() => {
    if (automationSettings) {
      setAutomationDraft(automationSettings);
    }

    setAutomationError('');
    setShowAutomationEditor(false);
  }, [automationSettings]);

  const updateAutomationDraft = useCallback(
    <Field extends keyof AutomationSettings>(field: Field, value: AutomationSettings[Field]) => {
      setAutomationDraft((current) => ({
        ...current,
        [field]: value,
      }));
      setAutomationError('');
    },
    []
  );

  const updateFeedingTime = useCallback((index: number, value: string) => {
    setAutomationDraft((current) => ({
      ...current,
      feedingTimes: current.feedingTimes.map((time, timeIndex) =>
        timeIndex === index ? value : time
      ),
    }));
    setAutomationError('');
  }, []);

  const addFeedingTime = useCallback(() => {
    setAutomationDraft((current) => ({
      ...current,
      feedingTimes: [...current.feedingTimes, '12:00'],
    }));
    setAutomationError('');
  }, []);

  const removeFeedingTime = useCallback((index: number) => {
    setAutomationDraft((current) => ({
      ...current,
      feedingTimes:
        current.feedingTimes.length === 1
          ? current.feedingTimes
          : current.feedingTimes.filter((_, timeIndex) => timeIndex !== index),
    }));
    setAutomationError('');
  }, []);

  const handleAutomationSave = useCallback(async () => {
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
    setSystemError('');
    updateAquariumAutomationInState(selectedAquarium.id, nextSettings);

    try {
      await updateAquarium(selectedAquarium.id, {
        automationSettings: nextSettings,
      });
      await syncAquariumDeviceProfile(
        {
          ...selectedAquarium,
          automationSettings: nextSettings,
        },
        systemMode
      );
      setShowAutomationEditor(false);
    } catch (err) {
      console.error(err);
      updateAquariumAutomationInState(selectedAquarium.id, previousSettings);
      setAutomationError(getErrorMessage(err, 'Failed to save automation settings.'));
    } finally {
      setSavingAutomation(false);
    }
  }, [
    automationDraft,
    selectedAquarium,
    syncAquariumDeviceProfile,
    systemMode,
    updateAquariumAutomationInState,
  ]);

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
    realtimeEnabled: isRealtimeDatabaseConfigured(),
    savingAutomation,
    savingAutomationEnabled,
    savingManualKey,
    savingMode,
    selectedAquarium,
    selectedDeviceShadow,
    selectedTelemetrySnapshot,
    showAutomationEditor,
    summary,
    systemError,
    systemMode,
    userName,
    actions: {
      addFeedingTime,
      closeAutomationEditor,
      handleAutomationEnabledToggle,
      handleAutomationSave,
      handleManualAction,
      handleSystemModeChange,
      openAutomationEditor,
      refresh: loadMonitoringData,
      removeFeedingTime,
      selectAquarium: setSelectedAquariumId,
      updateAutomationDraft,
      updateFeedingTime,
    },
  };
}
