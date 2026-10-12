import {
  child,
  get,
  onValue,
  ref,
  set,
  type DatabaseReference,
} from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, rtdb } from '../firebase';
import { getCurrentUserProfile } from './userService';
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
  DeviceControlProfile,
  DeviceShadow,
  DeviceTelemetry,
  DeviceTelemetryLogEntry,
} from '../types/device';

const emptyDeviceShadow: DeviceShadow = {
  control: null,
  latestCommand: null,
  telemetry: null,
};

let serverTimeOffsetUnsubscribe: (() => void) | null = null;

type DeviceShadowSubscriptionOptions = {
  onError?: (error: Error) => void;
};

type DeviceCommandRequest = Omit<DeviceCommand, 'requestedBy'>;

async function assertRealtimeDeviceAccess(
  aquariumId: string,
  action: 'read' | 'write'
) {
  const currentUser = auth.currentUser;

  if (!currentUser) {
    throw new Error('You must be logged in to access aquarium device data.');
  }

  const currentProfile = await getCurrentUserProfile(currentUser.uid);

  if (!currentProfile) {
    throw new Error('User profile not found.');
  }

  const aquariumRef = doc(db, 'aquariums', aquariumId);
  const aquariumSnap = await getDoc(aquariumRef);

  if (!aquariumSnap.exists()) {
    throw new Error('Aquarium not found.');
  }

  if (currentProfile.role === 'Admin') {
    return aquariumSnap.data() as Record<string, unknown>;
  }

  const aquariumData = aquariumSnap.data() as Record<string, unknown>;
  const ownerId =
    typeof aquariumData.ownerId === 'string' ? aquariumData.ownerId.trim() : '';

  if (!ownerId || ownerId !== currentProfile.id) {
    throw new Error(
      `You are not allowed to ${action} device data for this aquarium.`
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

function ensureServerTimeOffsetSubscription() {
  if (!rtdb || serverTimeOffsetUnsubscribe) {
    return;
  }

  serverTimeOffsetUnsubscribe = onValue(ref(rtdb, '.info/serverTimeOffset'), (snapshot) => {
    setDeviceTelemetryClockOffsetMs(Number(snapshot.val() || 0));
  });
}

function toReadableDeviceError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return error;
  }

  return new Error(fallbackMessage);
}

function normalizeTelemetry(value: unknown): DeviceTelemetry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const telemetry = value as Record<string, unknown>;
  const temperatureC = Number(telemetry.temperatureC);
  const waterLevelPercent = Number(telemetry.waterLevelPercent);
  const tdsPpm = Number(telemetry.tdsPpm);
  const tdsPercent = Number(telemetry.tdsPercent ?? telemetry.waterQualityPercent);
  const turbidity = Number(telemetry.turbidity);
  const ammoniaPpm = Number(telemetry.ammoniaPpm);
  const updatedAt = Number(telemetry.updatedAt);
  const hasTdsPpm = Number.isFinite(tdsPpm);
  const hasTdsPercent = Number.isFinite(tdsPercent);
  const tdsReadingValid =
    typeof telemetry.tdsReadingValid === 'boolean'
      ? telemetry.tdsReadingValid
      : hasTdsPercent;

  if (
    !Number.isFinite(temperatureC) ||
    !Number.isFinite(waterLevelPercent) ||
    !Number.isFinite(updatedAt)
  ) {
    return null;
  }

  return {
    temperatureC,
    temperatureReadingValid:
      typeof telemetry.temperatureReadingValid === 'boolean'
        ? telemetry.temperatureReadingValid
        : true,
    waterLevelPercent,
    waterPresent: typeof telemetry.waterPresent === 'boolean' ? telemetry.waterPresent : true,
    tdsPpm: hasTdsPpm ? tdsPpm : undefined,
    tdsPercent: hasTdsPercent ? tdsPercent : undefined,
    tdsReadingValid,
    turbidity: Number.isFinite(turbidity) ? turbidity : undefined,
    ammoniaPpm: Number.isFinite(ammoniaPpm) ? ammoniaPpm : undefined,
    filterState:
      telemetry.filterState === 'Active' || telemetry.filterState === 'Inactive'
        ? telemetry.filterState
        : undefined,
    equipmentStatus:
      telemetry.equipmentStatus === 'Normal' ||
      telemetry.equipmentStatus === 'Warning' ||
      telemetry.equipmentStatus === 'Fault' ||
      telemetry.equipmentStatus === 'Unknown'
        ? telemetry.equipmentStatus
        : undefined,
    powerStatus: normalizeDevicePowerStatus(telemetry.powerStatus),
    ph: Number.isFinite(Number(telemetry.ph)) ? Number(telemetry.ph) : undefined,
    updatedAt,
    online: typeof telemetry.online === 'boolean' ? telemetry.online : true,
  };
}

export async function syncDeviceControlProfile(
  aquariumId: string,
  profile: DeviceControlProfile
): Promise<void> {
  const deviceRootRef = getDeviceRootRef(aquariumId);

  if (!deviceRootRef) {
    return;
  }

  await assertRealtimeDeviceAccess(aquariumId, 'write');
  await set(child(deviceRootRef, 'control'), profile);
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
    !Number.isFinite(temperatureC) ||
    !Number.isFinite(waterLevelPercent)
  ) {
    return null;
  }

  return {
    temperatureC,
    temperatureReadingValid:
      typeof entry.temperatureReadingValid === 'boolean'
        ? entry.temperatureReadingValid
        : true,
    waterLevelPercent,
    waterPresent: typeof entry.waterPresent === 'boolean' ? entry.waterPresent : true,
    tdsPpm: hasTdsPpm ? tdsPpm : undefined,
    tdsPercent: hasTdsPercent ? tdsPercent : undefined,
    tdsReadingValid,
    turbidity: Number.isFinite(turbidity) ? turbidity : undefined,
    ammoniaPpm: Number.isFinite(ammoniaPpm) ? ammoniaPpm : undefined,
    filterState:
      entry.filterState === 'Active' || entry.filterState === 'Inactive'
        ? entry.filterState
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
  aquariumId: string
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

  const historySnapshot = await get(child(deviceRootRef, 'history'));

  if (!historySnapshot.exists()) {
    return {
      dateKeysProcessed: 0,
      readingsWritten: 0,
    };
  }

  const historyByDate = historySnapshot.val() as Record<string, unknown>;
  let dateKeysProcessed = 0;
  let readingsWritten = 0;

  for (const [dateKey, dayValue] of Object.entries(historyByDate)) {
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

  ensureServerTimeOffsetSubscription();

  let cancelled = false;
  let unsubscribe: (() => void) | undefined;

  void (async () => {
    try {
      await assertRealtimeDeviceAccess(aquariumId, 'read');

      if (cancelled) {
        return;
      }

      unsubscribe = onValue(
        deviceRootRef,
        (snapshot) => {
          const value = snapshot.val() as Partial<DeviceShadow> | null;

          callback({
            control: value?.control || null,
            latestCommand: value?.latestCommand || null,
            telemetry: normalizeTelemetry(value?.telemetry) || null,
          });
        },
        (error) => {
          console.error(error);

          if (cancelled) {
            return;
          }

          callback(emptyDeviceShadow);
          options.onError?.(
            toReadableDeviceError(
              error,
              'Live device data could not be loaded for this aquarium.'
            )
          );
        }
      );
    } catch (error) {
      console.error(error);

      if (!cancelled) {
        callback(emptyDeviceShadow);
        options.onError?.(
          toReadableDeviceError(
            error,
            'Live device data could not be loaded for this aquarium.'
          )
        );
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}
