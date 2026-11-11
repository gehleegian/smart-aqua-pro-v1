import type { DeviceTelemetry } from '../types/device';
import { readTelemetryNumber, readTurbidityVoltage, normalizeDevicePowerStatus } from './monitoringAssessmentCore.ts';

export function normalizeTelemetry(value: unknown): DeviceTelemetry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const telemetry = value as Record<string, unknown>;
  const temperatureC = readTelemetryNumber(telemetry.temperatureC);
  const waterLevelPercent = readTelemetryNumber(telemetry.waterLevelPercent);
  const tdsPpm = readTelemetryNumber(telemetry.tdsPpm);
  const tdsPercent = readTelemetryNumber(telemetry.tdsPercent ?? telemetry.waterQualityPercent);
  const turbidity = readTelemetryNumber(telemetry.turbidity);
  const ammoniaPpm = readTelemetryNumber(telemetry.ammoniaPpm);
  const updatedAt = readTelemetryNumber(telemetry.updatedAt);
  const hasTdsPpm = Number.isFinite(tdsPpm);
  const hasTdsPercent = Number.isFinite(tdsPercent);
  const tdsReadingValid =
    typeof telemetry.tdsReadingValid === 'boolean'
      ? telemetry.tdsReadingValid
      : hasTdsPercent;

  if (
    (temperatureC === undefined && telemetry.temperatureReadingValid !== false) ||
    (waterLevelPercent === undefined && telemetry.waterLevelReadingValid !== false) ||
    updatedAt === undefined
  ) {
    return null;
  }

  return {
    temperatureC,
    // Validity flags pass through unchanged; a missing flag is resolved by
    // evaluateTelemetryValidity() according to REQUIRE_SENSOR_VALIDITY_FLAGS.
    temperatureReadingValid:
      typeof telemetry.temperatureReadingValid === 'boolean'
        ? telemetry.temperatureReadingValid
        : undefined,
    waterLevelPercent,
    waterLevelReadingValid: typeof telemetry.waterLevelReadingValid === 'boolean' ? telemetry.waterLevelReadingValid : undefined,
    waterLevelTargetHeightCm: readTelemetryNumber(telemetry.waterLevelTargetHeightCm),
    waterPresent: typeof telemetry.waterPresent === 'boolean' ? telemetry.waterPresent : true,
    tdsPpm: hasTdsPpm ? tdsPpm : undefined,
    tdsPercent: hasTdsPercent ? tdsPercent : undefined,
    tdsReadingValid,
    turbidity: Number.isFinite(turbidity) ? turbidity : undefined,
    turbidityVoltage: readTurbidityVoltage(telemetry.turbidityVoltage),
    turbidityReadingValid:
      telemetry.turbidity != null && turbidity === undefined ? false :
        typeof telemetry.turbidityReadingValid === 'boolean' ? telemetry.turbidityReadingValid : undefined,
    turbidityState: telemetry.turbidityState === 'Clear' || telemetry.turbidityState === 'Cloudy' || telemetry.turbidityState === 'Unknown'
      ? telemetry.turbidityState : undefined,
    ammoniaPpm: Number.isFinite(ammoniaPpm) ? ammoniaPpm : undefined,
    lightState: telemetry.lightState === 'On' || telemetry.lightState === 'Off'
      ? telemetry.lightState : undefined,
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
    ...(typeof telemetry.mainsPresent === 'boolean' ? { mainsPresent: telemetry.mainsPresent } : {}),
    ph: readTelemetryNumber(telemetry.ph),
    phReadingValid: typeof telemetry.phReadingValid === 'boolean' ? telemetry.phReadingValid : undefined,
    updatedAt,
    online: typeof telemetry.online === 'boolean' ? telemetry.online : true,
  };
}

/**
 * Prevent a late/replayed RTDB write from rolling a live web subscription
 * back to an older sample. A missing or malformed latest node still clears
 * the snapshot so the UI never keeps presenting old data as current.
 */
export function selectNewestTelemetrySnapshot(
  current: DeviceTelemetry | null | undefined,
  incoming: DeviceTelemetry | null
): DeviceTelemetry | null {
  if (!incoming) return null;
  if (!current || incoming.updatedAt > current.updatedAt) return incoming;
  return current;
}
