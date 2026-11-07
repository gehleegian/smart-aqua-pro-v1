import type { Aquarium, AutomationSettings, ManualSystemStatus } from './aquarium';
import { normalizeDevicePowerStatus, getTelemetryFreshness, TELEMETRY_STALE_MS, TELEMETRY_EPOCH_FLOOR } from '../utils/monitoringAssessmentCore.ts';
import type { SystemMode } from './monitoring';
import { resolveWaterLevel, type LevelProfileInput, type WaterLevelProfile } from '../utils/waterLevelProfile.ts';

export type DeviceCommandType =
  | 'feed_now'
  | 'set_filter_state'
  | 'set_light_state'
  | 'sync_control';

export type DeviceCommandState = 'Active' | 'Inactive' | 'On' | 'Off';
export type DevicePowerStatus = 'Online' | 'Offline' | 'Power Interruption' | 'Unknown';

export interface DeviceTelemetry {
  lightState?: 'On' | 'Off';
  temperatureC: number;
  temperatureReadingValid?: boolean;
  waterLevelPercent?: number;
  waterLevelReadingValid?: boolean;
  waterLevelTargetHeightCm?: number;
  waterPresent?: boolean;
  tdsPpm?: number;
  tdsPercent?: number;
  tdsReadingValid?: boolean;
  turbidity?: number;
  turbidityState?: 'Clear' | 'Cloudy' | 'Unknown';
  ammoniaPpm?: number;
  filterState?: 'Active' | 'Inactive';
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: DevicePowerStatus;
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
  equipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  powerStatus?: DevicePowerStatus;
  ph?: number;
  online?: boolean;
  recordedAt: string;
  recordedAtEpoch: number;
  sampleCount?: number;
}

export interface DeviceControlProfile {
  waterLevelProfile?: WaterLevelProfile;
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

export interface DeviceShadow {
  control: DeviceControlProfile | null;
  latestCommand: DeviceCommand | null;
  telemetry: DeviceTelemetry | null;
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

export function getReportedManualStatus(
  fallback: ManualSystemStatus,
  telemetry: DeviceTelemetry | null | undefined,
  now = Date.now()
): ManualSystemStatus {
  if (!telemetry || !hasFreshDeviceTelemetry(telemetry, now)) return { ...fallback };
  return {
    ...fallback,
    light: telemetry.lightState === 'On' || telemetry.lightState === 'Off'
      ? telemetry.lightState : fallback.light,
    filter: telemetry.filterState === 'Active' || telemetry.filterState === 'Inactive'
      ? telemetry.filterState : fallback.filter,
  };
}

export function getDeviceTelemetryStatusText(state: DeviceTelemetryState) {
  return state === 'offline' ? 'Device offline' : state === 'unavailable' ? 'No live data' : 'Live data';
}

export function getFreshTelemetrySnapshot(
  telemetry: DeviceTelemetry | null | undefined,
  now = Date.now(),
  profile?: LevelProfileInput
) {
  if (getDeviceTelemetryState(telemetry, now) !== 'live' || !telemetry) {
    return null;
  }

  if (
    typeof telemetry.temperatureC !== 'number' ||
    !Number.isFinite(telemetry.temperatureC) ||
    (telemetry.waterLevelReadingValid !== false &&
      (typeof telemetry.waterLevelPercent !== 'number' || !Number.isFinite(telemetry.waterLevelPercent)))
  ) {
    return null;
  }

  const purityPercent = getTelemetryPurityPercent(telemetry);
  const level = resolveWaterLevel(profile, telemetry);
  const tdsPpm = getTelemetryTdsPpm(telemetry);
  const waterPresent = telemetry.waterPresent !== false;
  const hasFreshTemperatureTelemetry =
    waterPresent && telemetry.temperatureReadingValid !== false;
  const ph = typeof telemetry.ph === 'number' && Number.isFinite(telemetry.ph) && telemetry.ph >= 0 && telemetry.ph <= 14
    ? telemetry.ph
    : null;
  const turbidity =
    typeof telemetry.turbidity === 'number' && Number.isFinite(telemetry.turbidity) && telemetry.turbidity >= 0
      ? telemetry.turbidity
      : null;
  const powerStatus = normalizeDevicePowerStatus(telemetry.powerStatus);

  return {
    temperatureC: telemetry.temperatureC,
    waterLevelPercent: level.valid ? telemetry.waterLevelPercent! : NaN,
    hasFreshWaterLevelTelemetry: level.valid,
    waterLevelMessage: level.message,
    waterPresent,
    hasFreshTemperatureTelemetry,
    tdsPpm,
    tdsPercent: purityPercent !== null && purityPercent >= 0 && purityPercent <= 100 ? purityPercent : null,
    hasFreshPurityTelemetry: purityPercent !== null && purityPercent >= 0 && purityPercent <= 100,
    ph,
    hasFreshPhTelemetry: ph !== null,
    turbidity,
    turbidityState: telemetry.turbidityState === 'Clear' || telemetry.turbidityState === 'Cloudy'
      ? telemetry.turbidityState : undefined,
    hasFreshTurbidityTelemetry: turbidity !== null,
    powerStatus,
    hasFreshPowerTelemetry: Boolean(powerStatus),
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
