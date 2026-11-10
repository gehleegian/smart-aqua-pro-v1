import { getActiveMembership } from './orgContext';
import {
  child,
  get,
  onValue,
  ref,
  set,
  update,
  type DatabaseReference,
} from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, rtdb } from '../firebase';
import {
  normalizeTelemetry,
  selectNewestTelemetrySnapshot,
} from '../utils/deviceTelemetryParser';

import {
  evaluateWaterLevelProfile,
  getWaterLevelControl,
  usesProfileWaterLevel,
  type LevelProfileInput,
} from '../utils/waterLevelProfile.ts';
import { getCurrentUserProfile } from './userService';
import { assertCurrentEmailAccess } from './emailVerificationPolicyService';
import {
  appendSensorReading,
  buildSensorReadingDocument,
  buildSensorReadingDocumentFromHistoryEntry,
  buildSensorReadingDocId,
  getSensorReadingsForDateKey,
  upsertSensorReading,
} from './sensorReadingsService';
import {
  normalizeDevicePowerStatus,
  setDeviceTelemetryClockOffsetMs,
} from '../types/device';
import type {
  DeviceCommand,
  DeviceCommandAck,
  DeviceControlProfile,
  DeviceShadow,
  DeviceTelemetry,
  DeviceTelemetryLogEntry,
} from '../types/device';

const emptyDeviceShadow: DeviceShadow = {
  control: null,
  latestCommand: null,
  latestAck: null,
  telemetry: null,
};

let serverTimeOffsetUnsubscribe: (() => void) | null = null;
let serverTimeOffsetSubscriberCount = 0;

type DeviceShadowSubscriptionOptions = {
  onError?: (error: Error) => void;
};

type DeviceCommandRequest = Omit<DeviceCommand, 'requestedBy'>;

async function assertRealtimeDeviceAccess(
  aquariumId: string,
  action: 'read' | 'write' | 'control'
) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to access aquarium device data.');
  }

  await assertCurrentEmailAccess(currentUser);

  const currentProfile = await getCurrentUserProfile(currentUser.uid);

  if (!currentProfile) {
    throw new Error('User profile not found.');
  }

  const aquariumRef = doc(db, 'aquariums', aquariumId);
  const aquariumSnap = await getDoc(aquariumRef);

  if (!aquariumSnap.exists()) {
    throw new Error('Aquarium not found.');
  }

  const aquariumData = aquariumSnap.data() as Record<string, unknown>;
  const ownerId =
    typeof aquariumData.ownerId === 'string' ? aquariumData.ownerId.trim() : '';
  const orgId = typeof aquariumData.orgId === 'string' ? aquariumData.orgId : '';
  const membership = getActiveMembership();
  const caretakerIds = Array.isArray(aquariumData.caretakerIds) ? aquariumData.caretakerIds : [];
  // Sprint 3: owners and assigned caretakers read telemetry and send
  // commands; control/schedules are owner-only (scope 'control').
  const allowed = orgId
    ? membership?.orgId === orgId &&
      membership.org.status === 'active' &&
      (membership.role === 'owner' || (action !== 'control' && caretakerIds.includes(currentProfile.id)))
    : Boolean(ownerId) && ownerId === currentProfile.id;

  if (!allowed) {
    throw new Error(
      `You are not allowed to ${action === 'control' ? 'change schedules' : action} device data for this aquarium.`
    );
  }

  return aquariumData;
}

function getDeviceRootRef(aquariumId: string): DatabaseReference | null {
  if (!rtdb) {
    return null;
  }

  return ref(rtdb, `devices/${aquariumId}`);
}

export function isRealtimeDatabaseConfigured() {
  return Boolean(rtdb);
}

function subscribeToServerTimeOffset() {
  if (!rtdb) {
    return () => undefined;
  }

  serverTimeOffsetSubscriberCount += 1;

  if (!serverTimeOffsetUnsubscribe) {
    serverTimeOffsetUnsubscribe = onValue(
      ref(rtdb, '.info/serverTimeOffset'),
      (snapshot) => {
        setDeviceTelemetryClockOffsetMs(Number(snapshot.val() || 0));
      },
      (error) => {
        console.error('Failed to read Firebase server time offset.', error);
        setDeviceTelemetryClockOffsetMs(0);
      }
    );
  }

  let released = false;

  return () => {
    if (released) {
      return;
    }

    released = true;
    serverTimeOffsetSubscriberCount = Math.max(
      0,
      serverTimeOffsetSubscriberCount - 1
    );

    if (serverTimeOffsetSubscriberCount === 0 && serverTimeOffsetUnsubscribe) {
      serverTimeOffsetUnsubscribe();
      serverTimeOffsetUnsubscribe = null;
      setDeviceTelemetryClockOffsetMs(0);
    }
  };
}

function toReadableDeviceError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  return new Error(fallbackMessage);
}



export async function syncDeviceControlProfile(
  aquariumId: string,
  profile: DeviceControlProfile
): Promise<void> {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    return;
  }

  // Caretakers send commands only; the control profile is owner-written.
  if (getActiveMembership()?.role === 'caretaker') {
    return;
  }
  const aquarium = await assertRealtimeDeviceAccess(aquariumId, 'control');
  await set(child(deviceRootRef, 'control'), {
    ...profile,
    waterLevelProfile: evaluateWaterLevelProfile(aquarium as LevelProfileInput).profile,
  });
}

export async function syncWaterLevelProfile(aquariumId: string): Promise<void> {
  const root = getDeviceRootRef(aquariumId);
  if (!root) return;
  const aquarium = await assertRealtimeDeviceAccess(aquariumId, 'control');
  if (!usesProfileWaterLevel(aquarium as LevelProfileInput)) return;
  const control = child(root, 'control');
  if (!(await get(control)).exists()) return;
  await update(control, { waterLevelProfile: evaluateWaterLevelProfile(aquarium as LevelProfileInput).profile });
}

export async function publishDeviceCommand(command: DeviceCommandRequest): Promise<void> {
  const deviceRootRef = getDeviceRootRef(command.aquariumId);

  if (!deviceRootRef) {
    return;
  }

  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to send aquarium device commands.');
  }

  await assertRealtimeDeviceAccess(command.aquariumId, 'write');

  const payload = Object.fromEntries(
    Object.entries({
      ...command,
      requestedBy: currentUser.uid,
    }).filter(([, value]) => value !== undefined)
  );

  await set(child(deviceRootRef, 'commands/latest'), payload);
}

/**
 * Pending trusted-ingestion migration. Normal browser UI must not use this
 * function as an authoritative source of real sensor telemetry.
 */
export async function writeDeviceTelemetry(
  aquariumId: string,
  telemetry: DeviceTelemetry
): Promise<void> {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    return;
  }

  const aquariumData = await assertRealtimeDeviceAccess(aquariumId, 'write');
  await set(child(deviceRootRef, 'telemetry'), {
    ...telemetry,
    temperatureReadingValid: telemetry.temperatureReadingValid,
    waterPresent: telemetry.waterPresent,
    tdsPpm: telemetry.tdsPpm,
    tdsPercent: telemetry.tdsPercent,
    tdsReadingValid: telemetry.tdsReadingValid,
  });

  const ownerId =
    typeof aquariumData.ownerId === 'string' ? aquariumData.ownerId.trim() : '';
  const ownerName =
    typeof aquariumData.ownerName === 'string' ? aquariumData.ownerName.trim() : '';

  if (!ownerId || !ownerName) {
    return;
  }

  try {
    await appendSensorReading(
      buildSensorReadingDocument({
        aquariumId,
        ownerId,
        ownerName,
        telemetry,
        source: 'device',
      })
    );
  } catch (error) {
    console.warn('Failed to write Firestore sensor reading.', error);
  }
}

function mapTelemetryHistoryEntry(value: unknown): DeviceTelemetryLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const entry = value as Record<string, unknown>;
  const recordedAt = typeof entry.recordedAt === 'string' ? entry.recordedAt : '';
  const recordedAtEpoch = Number(entry.recordedAtEpoch);
  const temperatureC = Number(entry.temperatureC);
  const waterLevelPercent = Number(entry.waterLevelPercent);
  const tdsPpm = Number(entry.tdsPpm);
  const tdsPercent = Number(entry.tdsPercent ?? entry.waterQualityPercent);
  const turbidity = Number(entry.turbidity);
  const ammoniaPpm = Number(entry.ammoniaPpm);
  const hasTdsPpm = Number.isFinite(tdsPpm);
  const hasTdsPercent = Number.isFinite(tdsPercent);
  const tdsReadingValid =
    typeof entry.tdsReadingValid === 'boolean' ? entry.tdsReadingValid : hasTdsPercent;

  if (
    !recordedAt ||
    !Number.isFinite(recordedAtEpoch) ||
    (!Number.isFinite(temperatureC) && entry.temperatureReadingValid !== false) ||
    !Number.isFinite(waterLevelPercent)
  ) {
    return null;
  }

  return {
    temperatureC: entry.temperatureReadingValid === false ? NaN : temperatureC,
    temperatureReadingValid:
      typeof entry.temperatureReadingValid === 'boolean'
        ? entry.temperatureReadingValid
        : true,
    waterLevelPercent,
    waterLevelReadingValid: typeof entry.waterLevelReadingValid === 'boolean' ? entry.waterLevelReadingValid : undefined,
    waterLevelTargetHeightCm: typeof entry.waterLevelTargetHeightCm === 'number' && Number.isFinite(entry.waterLevelTargetHeightCm) ? entry.waterLevelTargetHeightCm : undefined,
    waterPresent: typeof entry.waterPresent === 'boolean' ? entry.waterPresent : true,
    tdsPpm: hasTdsPpm ? tdsPpm : undefined,
    tdsPercent: hasTdsPercent ? tdsPercent : undefined,
    tdsReadingValid,
    turbidity: Number.isFinite(turbidity) ? turbidity : undefined,
    turbidityState:
      entry.turbidityState === 'Clear' || entry.turbidityState === 'Cloudy' || entry.turbidityState === 'Unknown'
        ? entry.turbidityState
        : undefined,
    ammoniaPpm: Number.isFinite(ammoniaPpm) ? ammoniaPpm : undefined,
    filterState:
      entry.filterState === 'Active' || entry.filterState === 'Inactive'
        ? entry.filterState
        : undefined,
    lightState: entry.lightState === 'On' || entry.lightState === 'Off'
      ? entry.lightState
      : undefined,
    equipmentStatus:
      entry.equipmentStatus === 'Normal' ||
      entry.equipmentStatus === 'Warning' ||
      entry.equipmentStatus === 'Fault' ||
      entry.equipmentStatus === 'Unknown'
        ? entry.equipmentStatus
        : undefined,
    powerStatus: normalizeDevicePowerStatus(entry.powerStatus),
    ph: Number.isFinite(Number(entry.ph)) ? Number(entry.ph) : undefined,
    online: typeof entry.online === 'boolean' ? entry.online : undefined,
    recordedAt,
    recordedAtEpoch,
  };
}

export async function getDeviceTelemetryHistory(
  aquariumId: string,
  dateKey: string
): Promise<DeviceTelemetryLogEntry[]> {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    return [];
  }

  await assertRealtimeDeviceAccess(aquariumId, 'read');

  let firestoreHistory: DeviceTelemetryLogEntry[] = [];

  try {
    firestoreHistory = await getSensorReadingsForDateKey(aquariumId, dateKey);
  } catch (error) {
    console.warn('Failed to load Firestore sensor readings.', error);
  }

  if (firestoreHistory.length > 0) {
    return firestoreHistory.sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);
  }

  const snapshot = await get(child(deviceRootRef, `history/${dateKey}`));

  if (!snapshot.exists()) {
    return [];
  }

  const value = snapshot.val() as Record<string, unknown>;

  const realtimeHistory = Object.values(value)
    .map(mapTelemetryHistoryEntry)
    .filter((entry): entry is DeviceTelemetryLogEntry => Boolean(entry))
    .sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);

  return realtimeHistory;
}

export type SensorReadingsBackfillResult = {
  dateKeysProcessed: number;
  readingsWritten: number;
};

/**
 * Pending trusted-ingestion migration. Retained for explicit maintenance use,
 * but no normal production UI read path invokes this client-side writer.
 */
export async function backfillSensorReadingsFromDeviceHistory(
  aquariumId: string,
  dateKeys: string[]
): Promise<SensorReadingsBackfillResult> {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    return {
      dateKeysProcessed: 0,
      readingsWritten: 0,
    };
  }

  const aquariumData = await assertRealtimeDeviceAccess(aquariumId, 'read');
  const ownerId =
    typeof aquariumData.ownerId === 'string' ? aquariumData.ownerId.trim() : '';
  const ownerName =
    typeof aquariumData.ownerName === 'string' ? aquariumData.ownerName.trim() : '';

  if (!ownerId || !ownerName) {
    return {
      dateKeysProcessed: 0,
      readingsWritten: 0,
    };
  }

  // RTDB rules grant owner reads at history/{dateKey} only; reading the
  // history root is denied. Read each requested date key individually.
  let dateKeysProcessed = 0;
  let readingsWritten = 0;

  for (const dateKey of new Set(dateKeys)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      continue;
    }

    const daySnapshot = await get(child(deviceRootRef, `history/${dateKey}`));
    const dayValue: unknown = daySnapshot.exists() ? daySnapshot.val() : null;

    if (!dayValue || typeof dayValue !== 'object' || Array.isArray(dayValue)) {
      continue;
    }

    dateKeysProcessed += 1;

    for (const rawEntry of Object.values(dayValue as Record<string, unknown>)) {
      const entry = mapTelemetryHistoryEntry(rawEntry);

      if (!entry) {
        continue;
      }

      const docId = buildSensorReadingDocId(aquariumId, dateKey, entry.recordedAtEpoch);
      const reading = buildSensorReadingDocumentFromHistoryEntry({
        aquariumId,
        ownerId,
        ownerName,
        entry,
        source: 'sync',
      });

      await upsertSensorReading(docId, reading);
      readingsWritten += 1;
    }
  }

  return {
    dateKeysProcessed,
    readingsWritten,
  };
}

function normalizeCommandAck(value: unknown): DeviceCommandAck | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const ack = value as Record<string, unknown>;
  if (typeof ack.commandId !== 'string' || (ack.status !== 'done' && ack.status !== 'failed') ||
      typeof ack.executedAt !== 'number' || !Number.isFinite(ack.executedAt)) {
    return null;
  }
  return {
    commandId: ack.commandId,
    status: ack.status,
    executedAt: ack.executedAt,
    ...(typeof ack.error === 'string' ? { error: ack.error } : {}),
  };
}

export function subscribeToDeviceShadow(
  aquariumId: string,
  callback: (shadow: DeviceShadow) => void,
  options: DeviceShadowSubscriptionOptions = {}
) {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    callback(emptyDeviceShadow);
    options.onError?.(
      new Error('Realtime Database is not configured. Live device data is unavailable.')
    );
    return () => undefined;
  }

  let cancelled = false;
  let subscriptionsClosed = false;
  let releaseServerTimeOffset: (() => void) | undefined;
  const unsubscribers: Array<() => void> = [];
  const initializedChildren = new Set<keyof DeviceShadow>();
  let shadow: DeviceShadow = { ...emptyDeviceShadow };

  const closeSubscriptions = () => {
    if (subscriptionsClosed) {
      return;
    }

    subscriptionsClosed = true;

    for (const unsubscribe of unsubscribers) {
      unsubscribe();
    }

    unsubscribers.length = 0;
    releaseServerTimeOffset?.();
    releaseServerTimeOffset = undefined;
  };

  const reportSubscriptionError = (error: unknown) => {
    if (cancelled || subscriptionsClosed) {
      return;
    }

    closeSubscriptions();
    callback(emptyDeviceShadow);
    options.onError?.(
      toReadableDeviceError(
        error,
        'Live device data could not be loaded for this aquarium.'
      )
    );
  };

  const updateShadow = <Key extends keyof DeviceShadow>(
    key: Key,
    value: DeviceShadow[Key]
  ) => {
    if (cancelled || subscriptionsClosed) {
      return;
    }

    shadow = {
      ...shadow,
      [key]: value,
    };
    initializedChildren.add(key);

    if (initializedChildren.size === 3) {
      callback(shadow);
    }
  };

  void (async () => {
    try {
      await assertRealtimeDeviceAccess(aquariumId, 'read');

      if (cancelled) {
        return;
      }

      releaseServerTimeOffset = subscribeToServerTimeOffset();

      const telemetryUnsubscribe = onValue(
        child(deviceRootRef, 'telemetry'),
        (snapshot) => {
          const incoming = normalizeTelemetry(snapshot.val());
          updateShadow(
            'telemetry',
            selectNewestTelemetrySnapshot(shadow.telemetry, incoming)
          );
        },
        (error) => {
          console.error(error);
          reportSubscriptionError(error);
        }
      );
      unsubscribers.push(telemetryUnsubscribe);

      if (subscriptionsClosed) {
        telemetryUnsubscribe();
        return;
      }

      const controlUnsubscribe = onValue(
        child(deviceRootRef, 'control'),
        (snapshot) => {
          updateShadow('control', snapshot.val() || null);
        },
        (error) => {
          console.error(error);
          reportSubscriptionError(error);
        }
      );
      unsubscribers.push(controlUnsubscribe);

      if (subscriptionsClosed) {
        controlUnsubscribe();
        return;
      }

      const latestCommandUnsubscribe = onValue(
        child(deviceRootRef, 'commands/latest'),
        (snapshot) => {
          updateShadow('latestCommand', snapshot.val() || null);
        },
        (error) => {
          console.error(error);
          reportSubscriptionError(error);
        }
      );
      unsubscribers.push(latestCommandUnsubscribe);

      if (subscriptionsClosed) {
        latestCommandUnsubscribe();
        return;
      }

      // Command acknowledgements are additive (device contract decision 5).
      // A denied or missing ack node must not break telemetry, so errors here
      // only clear the ack instead of closing the whole subscription.
      const latestAckUnsubscribe = onValue(
        child(deviceRootRef, 'commandAck/latest'),
        (snapshot) => {
          if (cancelled || subscriptionsClosed) return;
          shadow = { ...shadow, latestAck: normalizeCommandAck(snapshot.val()) };
          if (initializedChildren.size === 3) callback(shadow);
        },
        (error) => {
          console.warn('Command acknowledgements are unavailable.', error);
          if (cancelled || subscriptionsClosed) return;
          shadow = { ...shadow, latestAck: null };
        }
      );
      unsubscribers.push(latestAckUnsubscribe);

      if (subscriptionsClosed) {
        latestAckUnsubscribe();
      }
    } catch (error) {
      // The subscription reports handled access/configuration failures to the
      // UI. Keep these out of Next's development error overlay.
      console.warn('Device data subscription could not be started.', error);

      if (!cancelled) {
        reportSubscriptionError(error);
      }
    }
  })();

  return () => {
    cancelled = true;
    closeSubscriptions();
  };
}
