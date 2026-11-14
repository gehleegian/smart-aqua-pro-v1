import { evaluateTelemetryValidity, getTelemetryFreshness, TELEMETRY_EPOCH_FLOOR } from './monitoringAssessmentCore.ts';
import { CONFIRMED_DEVICE_HARDWARE } from '../config/deviceHardware.ts';
import { EQUIPMENT_OPTIONS } from './hardwareInventory.ts';

export const INVENTORY_SENSOR_TYPES = {
  temperature: 'Temperature', ph: 'pH', tds: 'TDS', turbidity: 'Turbidity',
  waterLevel: 'Water level', ammonia: 'Ammonia',
} as const;
type SensorType = keyof typeof INVENTORY_SENSOR_TYPES;
export type InventoryDevice = {
  id: string; aquariumId: string; ownerId: string; registration: string;
  sensors: { type: SensorType; count: number }[] | null;
  sensorSource: 'registry' | 'owner-confirmed' | null;
  equipment: string[] | null;
};
export type InventoryTelemetry = {
  updatedAt?: number; online?: boolean; sensorTypes: SensorType[];
  sensors: Partial<Record<SensorType, SensorSignal>>;
};
export type SensorSignal = { status: 'Reporting' | 'Fault' | 'Unknown'; reason: string };
export type InventoryDeviceStatus = 'Unassigned' | 'Unavailable' | 'Not reporting' | 'Online' | 'Offline';
export type InventoryRow = InventoryDevice & {
  aquariumName: string; ownerName: string; ownerEmail: string;
};
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Whitelist only inventory metadata; never retain claim hashes or credentials. */
export function inventoryDevice(id: string, raw: Record<string, unknown>): InventoryDevice {
  const registration = text(raw.status) || text(raw.state) || 'unknown';
  let sensors: InventoryDevice['sensors'] = null;
  if (Array.isArray(raw.sensorInventory) && raw.sensorInventory.length > 0) {
    const parsed = raw.sensorInventory.map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      const { type, count } = entry;
      return Object.hasOwn(INVENTORY_SENSOR_TYPES, type) && Number.isSafeInteger(count) && count > 0
        ? { type: type as SensorType, count: count as number } : null;
    });
    // Incomplete/duplicate metadata must not masquerade as a complete physical count.
    if (parsed.every(entry => entry !== null) && new Set(parsed.map(entry => entry.type)).size === parsed.length) {
      sensors = parsed;
    }
  }
  const hardware = Object.hasOwn(CONFIRMED_DEVICE_HARDWARE, id)
    ? CONFIRMED_DEVICE_HARDWARE[id as keyof typeof CONFIRMED_DEVICE_HARDWARE] : null;
  const sensorSource = sensors ? 'registry' : hardware ? 'owner-confirmed' : null;
  return { id, aquariumId: text(raw.aquariumId),
    ownerId: text(raw.ownerUid) || text(raw.claimedBy), registration,
    sensors: sensors || (hardware ? hardware.sensors.map(sensor => ({ ...sensor })) : null),
    sensorSource, equipment: Array.isArray(raw.equipmentInventory) && raw.equipmentInventory.every(type => EQUIPMENT_OPTIONS.some(option => option.type === type))
      ? EQUIPMENT_OPTIONS.filter(option => (raw.equipmentInventory as unknown[]).includes(option.type)).map(option => option.label)
      : hardware ? [...hardware.equipment] : null };
}

/** Heartbeat is independent of water-reading validity. No reading values retained. */
export function inventoryTelemetry(value: unknown): InventoryTelemetry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const fields: Record<SensorType, string[]> = {
    temperature: ['temperatureC', 'temperatureReadingValid'], ph: ['ph', 'phReadingValid'],
    tds: ['tdsPpm', 'tdsPercent', 'tdsReadingValid'],
    turbidity: ['turbidity', 'turbidityState', 'turbidityReadingValid'],
    waterLevel: ['waterLevelPercent', 'waterLevelReadingValid'], ammonia: ['ammoniaPpm'],
  };
  const flags: Partial<Record<SensorType, string>> = {
    temperature: 'temperatureReadingValid', ph: 'phReadingValid', tds: 'tdsReadingValid',
    turbidity: 'turbidityReadingValid', waterLevel: 'waterLevelReadingValid',
  };
  const validity = evaluateTelemetryValidity(raw, { requireFlags: true });
  const sensorTypes = (Object.keys(fields) as SensorType[]).filter(type => fields[type].some(key => Object.hasOwn(raw, key)));
  const sensors: InventoryTelemetry['sensors'] = {};
  for (const type of sensorTypes) {
    const flag = flags[type];
    sensors[type] = flag && raw[flag] === false
      ? { status: 'Fault', reason: 'The device explicitly marked this sensor sample invalid.' }
      : flag && raw[flag] === true && type !== 'ammonia' && validity[type].status === 'valid'
        ? { status: 'Reporting', reason: 'The latest device sample is flagged valid. This does not verify accuracy or electrical power.' }
        : { status: 'Unknown', reason: 'A complete, valid sensor diagnostic was not reported.' };
  }
  return {
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) && raw.updatedAt >= TELEMETRY_EPOCH_FLOOR && raw.updatedAt <= 8.64e15
      ? raw.updatedAt : undefined,
    online: typeof raw.online === 'boolean' ? raw.online : undefined,
    sensorTypes, sensors,
  };
}

/** Stale/disconnected data never leaves a sensor looking live or currently faulty. */
export function inventorySensorStatuses(device: InventoryDevice, telemetry: InventoryTelemetry | null | undefined,
  connected: boolean, now: number, error?: string) {
  const live = inventoryStatus(device, telemetry, connected, now, error) === 'Online';
  const installed = device.sensors || (telemetry?.sensorTypes || []).map(type => ({ type, count: null }));
  return installed.map(sensor => ({ ...sensor, label: INVENTORY_SENSOR_TYPES[sensor.type],
    ...(live ? telemetry?.sensors?.[sensor.type] || { status: 'Unknown' as const, reason: 'No diagnostic for this installed sensor was reported.' }
      : { status: 'Unknown' as const, reason: 'A fresh device connection is required to determine sensor status.' }),
  }));
}

export function inventoryStatus(device: InventoryDevice, telemetry: InventoryTelemetry | null | undefined,
  connected: boolean, now: number, error?: string): InventoryDeviceStatus {
  if (device.registration !== 'claimed' || !device.aquariumId) return 'Unassigned';
  if (!connected || error) return 'Unavailable';
  if (typeof telemetry?.online !== 'boolean') return 'Not reporting';
  const freshness = getTelemetryFreshness(telemetry, now, { allowClockSkew: true });
  return freshness === 'live' ? 'Online' : freshness === 'offline' ? 'Offline' : 'Not reporting';
}

export function joinInventory(devices: InventoryDevice[], aquariums: {
  id: string; name: string; ownerId: string; ownerName: string;
}[], users: { id: string; name: string; email: string }[]): InventoryRow[] {
  const tanks = new Map(aquariums.map(tank => [tank.id, tank]));
  const owners = new Map(users.map(user => [user.id, user]));
  return devices.map(device => {
    const tank = device.registration === 'claimed' ? tanks.get(device.aquariumId) : undefined;
    const ownerId = tank?.ownerId || (device.registration === 'claimed' ? device.ownerId : '');
    const owner = owners.get(ownerId);
    return { ...device, ownerId, aquariumName: tank?.name || '',
      ownerName: owner?.name || tank?.ownerName || (ownerId ? 'Owner record unavailable' : 'Unassigned'),
      ownerEmail: owner?.email || '' };
  }).sort((a, b) => a.id.localeCompare(b.id));
}
