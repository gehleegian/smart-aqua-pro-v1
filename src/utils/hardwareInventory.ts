// Identical contract on web, mobile and Functions; parity-tested.
export const SENSOR_OPTIONS = [
  { type: 'ph', label: 'pH sensor' }, { type: 'tds', label: 'TDS sensor' },
  { type: 'waterLevel', label: 'Ultrasonic water-level sensor' },
  { type: 'turbidity', label: 'Turbidity sensor' },
  { type: 'temperature', label: 'Temperature sensor' },
  { type: 'ammonia', label: 'Ammonia sensor (only if physically installed)' },
] as const;
export const EQUIPMENT_OPTIONS = [
  { type: 'lights', label: 'Lighting' }, { type: 'filter', label: 'Filtration' },
  { type: 'feeder', label: 'Feeder' },
] as const;
export type SensorType = typeof SENSOR_OPTIONS[number]['type'];
export type EquipmentType = typeof EQUIPMENT_OPTIONS[number]['type'];
export type HardwareInventory = {
  sensors: { type: SensorType; count: number }[];
  equipment: EquipmentType[];
};

// Owner-confirmed on 14 November 2026. These are enclosure IDs, not tank names.
// Counts describe installed hardware, not health or accuracy. No default for future devices.
export const CONFIRMED_DEVICE_IDS = ['SAQ-7K3M-9R2X', 'SAQ-HGCA-SJRS'] as const;
export function confirmedHardware(deviceId: unknown): HardwareInventory | null {
  if (!CONFIRMED_DEVICE_IDS.some(id => id === deviceId)) return null;
  return {
    sensors: [
      { type: 'ph', count: 1 }, { type: 'tds', count: 1 }, { type: 'waterLevel', count: 1 },
      { type: 'turbidity', count: 1 }, { type: 'temperature', count: 2 },
    ],
    equipment: ['lights', 'filter'],
  };
}

export function needsHardwareConfirmation(deviceId: unknown, status: unknown, confirmed = false) {
  return status === 'setup' && !confirmed && confirmedHardware(deviceId) === null;
}

/** Administrative input bounds, not water-quality thresholds. No telemetry detection. */
export function parseHardwareInventory(value: unknown): HardwareInventory {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Hardware inventory is required.');
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some(key => key !== 'sensors' && key !== 'equipment')) throw new Error('Unexpected inventory fields.');
  if (!Array.isArray(data.sensors) || data.sensors.length < 1 || data.sensors.length > SENSOR_OPTIONS.length) {
    throw new Error('Select at least one installed sensor.');
  }
  const sensors = data.sensors.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Invalid sensor entry.');
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).some(key => key !== 'type' && key !== 'count') ||
      !SENSOR_OPTIONS.some(option => option.type === item.type) ||
      typeof item.count !== 'number' || !Number.isSafeInteger(item.count) || item.count < 1 || item.count > 100) {
      throw new Error('Sensor quantities must be whole numbers from 1 to 100.');
    }
    return { type: item.type as SensorType, count: item.count };
  });
  if (new Set(sensors.map(sensor => sensor.type)).size !== sensors.length) throw new Error('Duplicate sensor types are not allowed.');
  if (!Array.isArray(data.equipment) || data.equipment.length > EQUIPMENT_OPTIONS.length ||
    !data.equipment.every(type => EQUIPMENT_OPTIONS.some(option => option.type === type)) ||
    new Set(data.equipment).size !== data.equipment.length) throw new Error('Select supported equipment without duplicates.');
  // Stable order makes retries idempotent regardless of checkbox click order.
  return {
    sensors: SENSOR_OPTIONS.flatMap(option => sensors.filter(sensor => sensor.type === option.type)),
    equipment: EQUIPMENT_OPTIONS.filter(option => (data.equipment as unknown[]).includes(option.type)).map(option => option.type),
  };
}

export type HardwareSetupState = {
  deviceId: string; inventory: HardwareInventory | null; confirmed: boolean;
  source: 'registry' | 'owner-confirmed' | null;
};
