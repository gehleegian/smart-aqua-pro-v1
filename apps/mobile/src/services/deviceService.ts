import {
  child,
  get,
  onValue,
  ref,
  set,
  type DatabaseReference,
} from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db, rtdb } from './firebase';
import { getCurrentUserProfile } from './userService';
import {
  setDeviceTelemetryClockOffsetMs,
  type DeviceCommand,
  type DeviceControlProfile,
  type DeviceShadow,
  type DeviceTelemetry,
  type DeviceTelemetryLogEntry,
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

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getDeviceRootRef(aquariumId: string): DatabaseReference | null {
  if (!rtdb) {
    return null;
  }

  return ref(rtdb, `devices/${aquariumId}`);
}

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

  const aquariumData = aquariumSnap.data() as Record<string, unknown>;

  if (currentProfile.role === 'Admin') {
    return aquariumData;
  }

  const ownerId = readString(aquariumData.ownerId);

  if (!ownerId || ownerId !== currentProfile.id) {
    throw new Error(
      `You are not allowed to ${action} device data for this aquarium.`
    );
  }

  return aquariumData;
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

export async function publishDeviceCommand(command: DeviceCommand): Promise<void> {
  const deviceRootRef = getDeviceRootRef(command.aquariumId);

  if (!deviceRootRef) {
    return;
  }

  await assertRealtimeDeviceAccess(command.aquariumId, 'write');

  const payload = Object.fromEntries(
    Object.entries(command).filter(([, value]) => value !== undefined)
  );

  await set(child(deviceRootRef, 'commands/latest'), payload);
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

  const snapshot = await get(child(deviceRootRef, `history/${dateKey}`));

  if (!snapshot.exists()) {
    return [];
  }

  const value = snapshot.val() as Record<string, unknown>;

  return Object.values(value)
    .map(mapTelemetryHistoryEntry)
    .filter((entry): entry is DeviceTelemetryLogEntry => Boolean(entry))
    .sort((a, b) => a.recordedAtEpoch - b.recordedAtEpoch);
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
          const commands = value && 'commands' in value
            ? (value.commands as { latest?: DeviceCommand } | null)
            : null;

          callback({
            control: value?.control || null,
            latestCommand: value?.latestCommand || commands?.latest || null,
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
