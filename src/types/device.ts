import type { Aquarium, AutomationSettings } from './aquarium';
import type { SystemMode } from './monitoring';

export type DeviceCommandType =
  | 'feed_now'
  | 'set_filter_state'
  | 'set_light_state'
  | 'sync_control';

export type DeviceCommandState = 'Active' | 'Inactive' | 'On' | 'Off';

export interface DeviceTelemetry {
  temperatureC: number;
  temperatureReadingValid?: boolean;
  waterLevelPercent: number;
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  ph?: number;
  updatedAt: number;
  online: boolean;
}

export interface DeviceTelemetryLogEntry {
  temperatureC: number;
  temperatureReadingValid?: boolean;
  waterLevelPercent: number;
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  ph?: number;
  online?: boolean;
  recordedAt: string;
  recordedAtEpoch: number;
  sampleCount?: number;
}

export interface DeviceControlProfile {
  mode: SystemMode;
  automationEnabled: boolean;
  feedingTimes: string[];
  filtrationStartTime: string;
  filtrationRuntimeHours: number;
  manualLightState: 'On' | 'Off';
  manualFilterState: 'Active' | 'Inactive';
  updatedAt: number;
}

export interface DeviceCommand {
  aquariumId: string;
  commandId: string;
  type: DeviceCommandType;
  requestedAt: number;
  requestedBy?: string;
  state?: DeviceCommandState;
  durationMs?: number;
}

export interface DeviceShadow {
  control: DeviceControlProfile | null;
  latestCommand: DeviceCommand | null;
  telemetry: DeviceTelemetry | null;
}

export type DeviceTelemetryState = 'live' | 'offline' | 'unavailable';

export const DEVICE_TELEMETRY_STALE_MS = 30_000;
const DEVICE_TELEMETRY_EPOCH_FLOOR = 946684800000;
let deviceTelemetryClockOffsetMs = 0;

export function setDeviceTelemetryClockOffsetMs(offsetMs: number) {
  if (!Number.isFinite(offsetMs)) {
    return;
  }

  deviceTelemetryClockOffsetMs = offsetMs;
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

export function getTelemetryPurityPercent(
  telemetry:
    | (Pick<DeviceTelemetry, 'tdsPercent' | 'tdsReadingValid'> & { waterQualityPercent?: number })
    | (Pick<DeviceTelemetryLogEntry, 'tdsPercent' | 'tdsReadingValid'> & {
        waterQualityPercent?: number;
      })
    | null
    | undefined
) {
  if (!telemetry) {
    return null;
  }

  if (telemetry.tdsReadingValid === false) {
    return null;
  }

  if (typeof telemetry.tdsPercent === 'number' && Number.isFinite(telemetry.tdsPercent)) {
    return telemetry.tdsPercent;
  }

  if ('waterQualityPercent' in telemetry &&
    typeof telemetry.waterQualityPercent === 'number' &&
    Number.isFinite(telemetry.waterQualityPercent)) {
    return telemetry.waterQualityPercent;
  }

  return null;
}

export function getTelemetryTdsPpm(
  telemetry:
    | Pick<DeviceTelemetry, 'tdsPpm' | 'tdsReadingValid'>
    | Pick<DeviceTelemetryLogEntry, 'tdsPpm' | 'tdsReadingValid'>
    | null
    | undefined
) {
  if (!telemetry) {
    return null;
  }

  if (telemetry.tdsReadingValid === false) {
    return null;
  }

  if (typeof telemetry.tdsPpm === 'number' && Number.isFinite(telemetry.tdsPpm)) {
    return telemetry.tdsPpm;
  }

  return null;
}

export function getDeviceTelemetryUpdatedAt(
  telemetry: DeviceTelemetry | null | undefined
): number | null {
  if (!telemetry || typeof telemetry.updatedAt !== 'number' || !Number.isFinite(telemetry.updatedAt)) {
    return null;
  }

  return telemetry.updatedAt >= DEVICE_TELEMETRY_EPOCH_FLOOR ? telemetry.updatedAt : null;
}

export function getDeviceTelemetryState(
  telemetry: DeviceTelemetry | null | undefined,
  now = Date.now()
): DeviceTelemetryState {
  if (!telemetry) {
    return 'unavailable';
  }

  if (telemetry.online === false) {
    return 'offline';
  }

  const updatedAt = getDeviceTelemetryUpdatedAt(telemetry);

  if (!updatedAt) {
    return 'unavailable';
  }

  const serverNow = now + deviceTelemetryClockOffsetMs;

  if (updatedAt > serverNow) {
    return 'live';
  }

  return serverNow - updatedAt <= DEVICE_TELEMETRY_STALE_MS ? 'live' : 'offline';
}

export function hasFreshDeviceTelemetry(
  telemetry: DeviceTelemetry | null | undefined,
  now = Date.now()
) {
  return getDeviceTelemetryState(telemetry, now) === 'live';
}

export function getDeviceTelemetryStatusText(state: DeviceTelemetryState) {
  return state === 'offline' ? 'Device offline' : state === 'unavailable' ? 'No live data' : 'Live data';
}

export function getFreshTelemetrySnapshot(
  telemetry: DeviceTelemetry | null | undefined,
  now = Date.now()
) {
  if (getDeviceTelemetryState(telemetry, now) !== 'live' || !telemetry) {
    return null;
  }

  if (
    typeof telemetry.temperatureC !== 'number' ||
    typeof telemetry.waterLevelPercent !== 'number'
  ) {
    return null;
  }

  const purityPercent = getTelemetryPurityPercent(telemetry);
  const tdsPpm = getTelemetryTdsPpm(telemetry);
  const waterPresent = telemetry.waterPresent !== false;
  const hasFreshTemperatureTelemetry =
    waterPresent && telemetry.temperatureReadingValid !== false;

  return {
    temperatureC: telemetry.temperatureC,
    waterLevelPercent: clampPercent(telemetry.waterLevelPercent),
    waterPresent,
    hasFreshTemperatureTelemetry,
    tdsPpm,
    tdsPercent: purityPercent === null ? null : clampPercent(purityPercent),
    hasFreshPurityTelemetry: purityPercent !== null,
    ph: typeof telemetry.ph === 'number' && Number.isFinite(telemetry.ph) ? telemetry.ph : null,
    turbidity:
      typeof telemetry.turbidity === 'number' && Number.isFinite(telemetry.turbidity)
        ? telemetry.turbidity
        : null,
    filterState:
      telemetry.filterState === 'Active' || telemetry.filterState === 'Inactive'
        ? telemetry.filterState
        : undefined,
  };
}

type DeviceControlProfileOptions = {
  aquarium: Pick<Aquarium, 'filter' | 'id' | 'light'>;
  automationSettings: AutomationSettings;
  mode: SystemMode;
};

export function buildDeviceControlProfile({
  aquarium,
  automationSettings,
  mode,
}: DeviceControlProfileOptions): DeviceControlProfile {
  return {
    mode,
    automationEnabled: automationSettings.enabled,
    feedingTimes: automationSettings.feedingTimes,
    filtrationStartTime: automationSettings.filtrationStartTime,
    filtrationRuntimeHours: automationSettings.filtrationRuntimeHours,
    manualLightState: aquarium.light === 'On' ? 'On' : 'Off',
    manualFilterState: aquarium.filter === 'Active' ? 'Active' : 'Inactive',
    updatedAt: Date.now(),
  };
}
