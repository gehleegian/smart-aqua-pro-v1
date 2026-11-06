import type { DeviceTelemetry } from '../types/device';
import { readTelemetryNumber, normalizeDevicePowerStatus } from './monitoringAssessmentCore.ts';

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
    temperatureC === undefined ||
    waterLevelPercent === undefined ||
    updatedAt === undefined
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
    ph: readTelemetryNumber(telemetry.ph),
    updatedAt,
    online: typeof telemetry.online === 'boolean' ? telemetry.online : true,
  };
}
