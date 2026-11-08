import type { SensorValidity, TelemetryValidity } from './monitoringAssessmentCore';

export type SensorDisplay = { value: string; status: string; isError: boolean };

// Validity-aware sensor display (device contract decision 4). An invalid sensor
// shows "Sensor error" instead of a number, so faulty readings are never read
// as water conditions.
export function getSensorDisplay(
  validity: TelemetryValidity | null | undefined,
  sensor: keyof Omit<TelemetryValidity, 'allValid'>,
  hasLiveTelemetry: boolean,
  formatValue: () => string
): SensorDisplay {
  if (!hasLiveTelemetry || !validity) {
    return { value: '--', status: 'Waiting for telemetry', isError: false };
  }
  const entry: SensorValidity = validity[sensor];
  if (entry.status === 'invalid') {
    return { value: 'Sensor error', status: entry.reason ? `Sensor error: ${entry.reason}` : 'Sensor error', isError: true };
  }
  if (entry.status === 'missing') {
    return { value: '--', status: 'Not reported by device', isError: false };
  }
  return { value: formatValue(), status: 'Live telemetry', isError: false };
}
