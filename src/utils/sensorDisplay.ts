import type { SensorValidity, TelemetryValidity } from './monitoringAssessmentCore';

export type SensorDisplay = { value: string; status: string; isError: boolean };

// Display the reported category only; never derive Clear/Cloudy from NTU.
export function getTurbidityDisplay(
  validity: TelemetryValidity | null | undefined,
  hasLiveTelemetry: boolean,
  state: unknown
): SensorDisplay {
  if (hasLiveTelemetry) {
    const category = state === 'Clear' || state === 'Cloudy' ? state : null;
    if (category) {
      return { value: category, status: 'Live telemetry', isError: false };
    }
  }
  return getSensorDisplay(validity, 'turbidity', hasLiveTelemetry, () => '--');
}

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
  if (sensor === 'tds' && entry.status === 'invalid' && entry.reason === 'tdsReadingValid is false') {
    return { value: 'Unavailable', status: 'TDS input invalid/clipped or not calibrated', isError: true };
  }
  if (entry.status === 'invalid') {
    return { value: 'Sensor error', status: entry.reason ? `Sensor error: ${entry.reason}` : 'Sensor error', isError: true };
  }
  if (entry.status === 'missing') {
    return { value: '--', status: 'Not reported by device', isError: false };
  }
  return { value: formatValue(), status: 'Live telemetry', isError: false };
}
