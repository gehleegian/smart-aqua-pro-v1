import { consumeTankFocus } from '../services/tankFocus';
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
  getDeviceCommandStatus,
  getDeviceTelemetryState,
  getDeviceTelemetryStatusText,
  getFreshTelemetrySnapshot,
  getReportedManualStatus,
  type DeviceShadow,
} from '../types/device';
import type {
  ManualActionDisplay,
  ManualActionLock,
  MonitoringAquarium,
  SystemField,
  SystemMode,
  TelemetrySource,
} from '../types/monitoring';
import type { UserData, UserRole } from '../types/user';
import {
  buildMonitoringOwners,
  defaultAutomationSettings,
  deviceProfileSettings,
  getAutomationSettings,
  hasSavedSchedule,
  getManualActionDisplay,
  getManualActionKey,
  getManualSystemStatus,
  manualActionTiming,
  prepareAutomationSettings,
  systemStatusConfig,
} from '../utils/monitoringHelpers';
import { assessAquarium } from '../utils/conditionAssessment';
import { useAquariumEngineStates, useRuleConfig } from './useRuleConfig';

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
  const [selectedAquariumId, setSelectedAquariumId] = useState(() => consumeTankFocus());
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
  const aquariumSubscriptionKey = useMemo(
    () =>
      JSON.stringify(
        Array.from(new Set(aquariums.map((aquarium) => aquarium.id))).sort()
      ),
    [aquariums]
  );

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
    const aquariumIds = JSON.parse(aquariumSubscriptionKey) as string[];

    if (aquariumIds.length === 0) {
      const resetTimer = window.setTimeout(() => {
        setDeviceShadows({});
        setDeviceSubscriptionErrors({});
      }, 0);

      return () => window.clearTimeout(resetTimer);
    }

    if (!isRealtimeDatabaseConfigured()) {
      const errorMessage =
        'Realtime Database is not configured. Live device data is unavailable.';

      const errorTimer = window.setTimeout(() => {
        setDeviceShadows({});
        setDeviceSubscriptionErrors(
          Object.fromEntries(aquariumIds.map((aquariumId) => [aquariumId, errorMessage]))
        );
      }, 0);

      return () => window.clearTimeout(errorTimer);
    }

    const clearErrorsTimer = window.setTimeout(() => {
      setDeviceSubscriptionErrors({});
    }, 0);

    const unsubscribers = aquariumIds.map((aquariumId) =>
      subscribeToDeviceShadow(
        aquariumId,
        (shadow) => {
          // A just-arrived server timestamp must be compared with receive time,
          // not the previous five-second UI tick (which can precede the reading).
          setTelemetryNow(Date.now());
          setDeviceShadows((prev) => ({
            ...prev,
            [aquariumId]: shadow,
          }));
          setDeviceSubscriptionErrors((prev) => {
            if (!prev[aquariumId]) {
              return prev;
            }

            const next = { ...prev };
            delete next[aquariumId];
            return next;
          });
        },
        {
          onError: (error) => {
            setDeviceSubscriptionErrors((prev) => ({
              ...prev,
              [aquariumId]: getErrorMessage(
                error,
                `Live device data for aquarium ${aquariumId} is unavailable.`
              ),
            }));
          },
        }
      )
    );

    return () => {
      window.clearTimeout(clearErrorsTimer);

      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    };
  }, [aquariumSubscriptionKey]);

  useEffect(() => {
    if (!selectedAquariumId || savingMode) {
      return;
    }

    const shadowMode = deviceShadows[selectedAquariumId]?.control?.mode;

    if (shadowMode && shadowMode !== systemMode) {
      const modeSyncTimer = window.setTimeout(() => {
        setSystemMode(shadowMode);
      }, 0);

      return () => window.clearTimeout(modeSyncTimer);
    }
  }, [deviceShadows, savingMode, selectedAquariumId, systemMode]);

  const ruleConfig = useRuleConfig();
  const engineStates = useAquariumEngineStates(useMemo(() => aquariums.map((aquarium) => aquarium.id), [aquariums]));

  const liveAquariums = useMemo<MonitoringAquarium[]>(() => {
    return aquariums.map((aquarium) => {
      // Main (PR #8) removed the browser telemetry simulator: live data only.
      const telemetry = deviceShadows[aquarium.id]?.telemetry;
      const telemetryState = getDeviceTelemetryState(telemetry, telemetryNow);
      const snapshot = getFreshTelemetrySnapshot(telemetry, telemetryNow, aquarium);
      // Main (PR #8): light/filter as the device reports them, when fresh.
      const manualStatus = getReportedManualStatus(getManualSystemStatus(aquarium), telemetry, telemetryNow);
      const telemetrySource: TelemetrySource = snapshot ? 'live' : 'unavailable';
      const assessment = assessAquarium({
        aquarium: aquarium as unknown as Record<string, unknown>,
        reading: snapshot && telemetry ? telemetry as unknown as Record<string, unknown> : null,
        source: telemetrySource,
        now: telemetryNow,
        ruleConfig,
        engineState: engineStates[aquarium.id] ?? null,
      });

      return {
        ...aquarium,
        turbidityState: snapshot?.turbidityState,
        temp: snapshot ? snapshot.temperatureC : aquarium.temp,
        level: snapshot ? snapshot.waterLevelPercent : aquarium.level,
        // TDS ppm stands on its own (firmware may send ppm without the legacy purity %).
        tdsPpm: snapshot && typeof snapshot.tdsPpm === 'number' ? snapshot.tdsPpm : aquarium.tdsPpm,
        ph: snapshot?.hasFreshPhTelemetry ? snapshot.ph ?? aquarium.ph : aquarium.ph,
        turbidity: snapshot?.hasFreshTurbidityTelemetry
          ? snapshot.turbidity ?? aquarium.turbidity
          : aquarium.turbidity,
        powerStatus: snapshot?.hasFreshPowerTelemetry
          ? snapshot.powerStatus ?? aquarium.powerStatus
          : aquarium.powerStatus,
        quality: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
        filter: manualStatus.filter,
        light: manualStatus.light,
        healthStatus: assessment.overallSeverity === 'normal' ? 'healthy' : 'warning',
        assessment,
        telemetrySource,
        hasFreshTelemetry: Boolean(snapshot),
        hasFreshWaterLevelTelemetry: Boolean(snapshot?.hasFreshWaterLevelTelemetry),
        waterLevelMessage: snapshot?.waterLevelMessage,
        hasFreshTemperatureTelemetry: Boolean(snapshot?.hasFreshTemperatureTelemetry),
        hasFreshPurityTelemetry: Boolean(snapshot?.hasFreshPurityTelemetry),
        hasFreshPhTelemetry: Boolean(snapshot?.hasFreshPhTelemetry),
        hasFreshTurbidityTelemetry: Boolean(snapshot?.hasFreshTurbidityTelemetry),
        hasFreshPowerTelemetry: Boolean(snapshot?.hasFreshPowerTelemetry),
        telemetryState,
        sensorValidity: snapshot?.validity ?? null,
        commandStatus: getDeviceCommandStatus(deviceShadows[aquarium.id], telemetryNow),
        manualStatus,
      };
    });
  }, [aquariums, deviceShadows, engineStates, ruleConfig, telemetryNow]);

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
        automationSettings: deviceProfileSettings(aquarium, nextSettings),
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
    if (nextSettings.enabled) {
      const prepared = prepareAutomationSettings(nextSettings);
      if (!prepared.settings) {
        setSystemError(prepared.error);
        return;
      }
    }

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

    // A newly claimed aquarium has no control snapshot yet. Clicking the already
    // selected Manual tab must initialize it so the ESP32 can establish access
    // and a safe command baseline before the first equipment command.
    if (!selectedAquarium ||
        (mode === systemMode && deviceShadows[selectedAquarium.id]?.control)) {
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
    automationEnabled: hasSavedSchedule(selectedAquarium) && Boolean(automationSettings?.enabled),
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
