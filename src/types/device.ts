import type { Aquarium, AutomationSettings } from './aquarium';
import {
  COMMAND_ACK_TIMEOUT_MS,
  evaluateTelemetryValidity,
  getCommandStatus,
  normalizeDevicePowerStatus,
  getTelemetryFreshness,
  TELEMETRY_STALE_MS,
  TELEMETRY_EPOCH_FLOOR,
  type CommandStatus,
  type TelemetryValidity,
} from '../utils/monitoringAssessmentCore.ts';
import type { SystemMode } from './monitoring';

export type DeviceCommandType =
  | 'feed_now'
  | 'set_filter_state'
  | 'set_light_state'
  | 'sync_control';

export type DeviceCommandState = 'Active' | 'Inactive' | 'On' | 'Off';
export type DevicePowerStatus = 'Online' | 'Offline' | 'Power Interruption' | 'Unknown';

// RTDB devices/{aquariumId}/telemetry. Field status (current vs new) is
// documented in docs/device-contract.md.
export interface DeviceTelemetry {
  temperatureC: number;
  temperatureReadingValid?: boolean;
  waterLevelPercent: number;
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  /** New (additive). */
  turbidityReadingValid?: boolean;
  /** Allowed by rules; out of scope (no ammonia sensor). */
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: DevicePowerStatus;
  ph?: number;
  /** New (additive). */
  phReadingValid?: boolean;
  /** Epoch ms. New firmware writes the RTDB server timestamp; legacy firmware writes its own clock. */
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
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: DevicePowerStatus;
  ph?: number;
  phReadingValid?: boolean;
  turbidityReadingValid?: boolean;
  online?: boolean;
  recordedAt: string;
  recordedAtEpoch: number;
  sampleCount?: number;
}

export interface DeviceControlProfile {
  mode: SystemMode;
  automationEnabled: boolean;
  feedingTimes: string[];
  lightOnTime?: string;
  lightOffTime?: string;
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

// RTDB devices/{aquariumId}/commandAck/latest (new). Written only by the bound device.
export interface DeviceCommandAck {
  commandId: string;
  status: 'done' | 'failed';
  /** Epoch ms, RTDB server timestamp. */
  executedAt: number;
  error?: string;
}

export interface DeviceShadow {
  control: DeviceControlProfile | null;
  latestCommand: DeviceCommand | null;
  /** Optional for callers that predate command acknowledgement. */
  latestAck?: DeviceCommandAck | null;
  telemetry: DeviceTelemetry | null;
}

export type { CommandStatus, TelemetryValidity };
export { COMMAND_ACK_TIMEOUT_MS };

export function getDeviceCommandStatus(shadow: DeviceShadow | null | undefined, now = Date.now()): CommandStatus {
  return getCommandStatus(shadow?.latestCommand, shadow?.latestAck, now);
}

export function getCommandStatusText(status: CommandStatus) {
  switch (status) {
    case 'pending': return 'Waiting for device';
    case 'done': return 'Done';
    case 'failed': return 'Failed';
    case 'no_response': return 'No response';
    default: return '';
  }
}

export type DeviceTelemetryState = 'live' | 'offline' | 'unavailable';

export const DEVICE_TELEMETRY_STALE_MS = TELEMETRY_STALE_MS;
const DEVICE_TELEMETRY_EPOCH_FLOOR = TELEMETRY_EPOCH_FLOOR;
let deviceTelemetryClockOffsetMs = 0;

export function setDeviceTelemetryClockOffsetMs(offsetMs: number) {
  if (!Number.isFinite(offsetMs)) {
    return;
  }

  deviceTelemetryClockOffsetMs = offsetMs;
}

export { normalizeDevicePowerStatus } from '../utils/monitoringAssessmentCore.ts';

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
  return getTelemetryFreshness(telemetry, now + deviceTelemetryClockOffsetMs);
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
    !Number.isFinite(telemetry.temperatureC) ||
    typeof telemetry.waterLevelPercent !== 'number' ||
    !Number.isFinite(telemetry.waterLevelPercent)
  ) {
    return null;
  }

  const validity = evaluateTelemetryValidity(telemetry as unknown as Record<string, unknown>);
  const purityPercent = getTelemetryPurityPercent(telemetry);
  const tdsValid = validity.tds.status === 'valid';
  const tdsPercent = tdsValid && purityPercent !== null && purityPercent >= 0 && purityPercent <= 100
    ? purityPercent
    : null;
  const waterPresent = telemetry.waterPresent !== false;
  const phValid = validity.ph.status === 'valid';
  const turbidityValid = validity.turbidity.status === 'valid';
  const powerStatus = normalizeDevicePowerStatus(telemetry.powerStatus);

  return {
    temperatureC: telemetry.temperatureC,
    waterLevelPercent: telemetry.waterLevelPercent,
    waterPresent,
    hasFreshTemperatureTelemetry: validity.temperature.status === 'valid',
    tdsPpm: tdsValid ? getTelemetryTdsPpm(telemetry) : null,
    tdsPercent,
    hasFreshPurityTelemetry: tdsPercent !== null,
    ph: phValid ? telemetry.ph! : null,
    hasFreshPhTelemetry: phValid,
    turbidity: turbidityValid ? telemetry.turbidity! : null,
    hasFreshTurbidityTelemetry: turbidityValid,
    powerStatus,
    hasFreshPowerTelemetry: Boolean(powerStatus),
    validity,
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
    lightOnTime: automationSettings.lightOnTime,
    lightOffTime: automationSettings.lightOffTime,
    filtrationStartTime: automationSettings.filtrationStartTime,
    filtrationRuntimeHours: automationSettings.filtrationRuntimeHours,
    manualLightState: aquarium.light === 'On' ? 'On' : 'Off',
    manualFilterState: aquarium.filter === 'Active' ? 'Active' : 'Inactive',
    updatedAt: Date.now(),
  };
}
