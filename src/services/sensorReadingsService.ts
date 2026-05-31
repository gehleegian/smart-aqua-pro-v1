import {
  addDoc,
  collection,
  doc,
  writeBatch,
  getDocs,
  orderBy,
  setDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { DeviceTelemetry, DeviceTelemetryLogEntry } from '../types/device';
import type { SensorReadingDocument, SensorReadingSource } from '../types/sensorReading';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function formatDateKeyFromEpoch(epochMillis: number) {
  const date = new Date(epochMillis);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatRecordedAtLabel(epochMillis: number) {
  const date = new Date(epochMillis);
  return `${formatDateKeyFromEpoch(epochMillis)}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}:${pad(date.getSeconds())}`;
}

export function buildReadingTimeKey(recordedAtEpoch: number) {
  const date = new Date(recordedAtEpoch);
  return `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

export function buildSensorReadingDocId(
  aquariumId: string,
  dateKey: string,
  recordedAtEpoch: number
) {
  return `${aquariumId}_${dateKey}_${recordedAtEpoch}`;
}

function stripUndefinedValues<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  ) as Record<string, unknown>;
}

function readBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback;
}

function readNumber(value: unknown, fallback?: number) {
  const numberValue = Number(value);

  if (Number.isFinite(numberValue)) {
    return numberValue;
  }

  return fallback;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function readRecordedAtLabel(value: unknown, recordedAtEpoch: number) {
  if (typeof value === 'string' && value.trim()) {
    return value;
  }

  if (value instanceof Date) {
    return formatRecordedAtLabel(value.getTime());
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    const date = value.toDate() as Date;
    return formatRecordedAtLabel(date.getTime());
  }

  return formatRecordedAtLabel(recordedAtEpoch);
}

function mapSensorReadingDocument(value: unknown): DeviceTelemetryLogEntry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const reading = value as Record<string, unknown>;
  const recordedAtEpoch = readNumber(reading.recordedAtEpoch);
  const temperatureC = readNumber(reading.temperatureC);
  const waterLevelPercent = readNumber(reading.waterLevelPercent);
  const tdsPpm = readNumber(reading.tdsPpm);
  const tdsPercent = readNumber(reading.tdsPercent ?? reading.waterQualityPercent);
  const turbidity = readNumber(reading.turbidity);
  const ammoniaPpm = readNumber(reading.ammoniaPpm);
  const hasTdsPpm = typeof tdsPpm === 'number';
  const hasTdsPercent = typeof tdsPercent === 'number';

  if (
    typeof recordedAtEpoch !== 'number' ||
    typeof temperatureC !== 'number' ||
    typeof waterLevelPercent !== 'number'
  ) {
    return null;
  }

  return {
    temperatureC,
    temperatureReadingValid: readBoolean(reading.temperatureReadingValid, true),
    waterLevelPercent,
    waterPresent: readBoolean(reading.waterPresent, true),
    tdsPpm: hasTdsPpm ? tdsPpm : undefined,
    tdsPercent: hasTdsPercent ? tdsPercent : undefined,
    tdsReadingValid: readBoolean(reading.tdsReadingValid, hasTdsPercent),
    turbidity,
    ammoniaPpm,
    filterState:
      reading.filterState === 'Active' || reading.filterState === 'Inactive'
        ? reading.filterState
        : undefined,
    ph: readNumber(reading.ph),
    online: readBoolean(reading.online, true),
    recordedAt: readRecordedAtLabel(reading.recordedAt, recordedAtEpoch),
    recordedAtEpoch,
  };
}

export function buildSensorReadingDocument(options: {
  aquariumId: string;
  ownerId: string;
  ownerName: string;
  telemetry: DeviceTelemetry;
  source?: SensorReadingSource;
}): SensorReadingDocument {
  const recordedAtEpoch = Number.isFinite(options.telemetry.updatedAt)
    ? options.telemetry.updatedAt
    : Date.now();

  return {
    aquarium_id: options.aquariumId,
    device_id: options.aquariumId,
    aquariumId: options.aquariumId,
    ownerId: options.ownerId,
    ownerName: options.ownerName,
    source: options.source ?? 'device',
    dateKey: formatDateKeyFromEpoch(recordedAtEpoch),
    recordedAt: new Date(recordedAtEpoch),
    recordedAtEpoch,
    ingestedAtEpoch: Date.now(),
    temperatureC: options.telemetry.temperatureC,
    temperatureReadingValid: options.telemetry.temperatureReadingValid,
    waterLevelPercent: options.telemetry.waterLevelPercent,
    waterPresent: options.telemetry.waterPresent,
    tdsPpm: options.telemetry.tdsPpm,
    tdsPercent: options.telemetry.tdsPercent,
    waterQualityPercent: options.telemetry.tdsPercent,
    tdsReadingValid: options.telemetry.tdsReadingValid,
    turbidity: options.telemetry.turbidity,
    ammoniaPpm: options.telemetry.ammoniaPpm,
    filterState: options.telemetry.filterState,
    ph: options.telemetry.ph,
    online: options.telemetry.online,
  };
}

export function buildSensorReadingDocumentFromHistoryEntry(options: {
  aquariumId: string;
  ownerId: string;
  ownerName: string;
  entry: DeviceTelemetryLogEntry;
  source?: SensorReadingSource;
}): SensorReadingDocument {
  return {
    aquarium_id: options.aquariumId,
    device_id: options.aquariumId,
    aquariumId: options.aquariumId,
    ownerId: options.ownerId,
    ownerName: options.ownerName,
    source: options.source ?? 'sync',
    dateKey: formatDateKeyFromEpoch(options.entry.recordedAtEpoch),
    recordedAt: new Date(options.entry.recordedAtEpoch),
    recordedAtEpoch: options.entry.recordedAtEpoch,
    ingestedAtEpoch: Date.now(),
    temperatureC: options.entry.temperatureC,
    temperatureReadingValid: options.entry.temperatureReadingValid,
    waterLevelPercent: options.entry.waterLevelPercent,
    waterPresent: options.entry.waterPresent,
    tdsPpm: options.entry.tdsPpm,
    tdsPercent: options.entry.tdsPercent,
    waterQualityPercent: options.entry.tdsPercent,
    tdsReadingValid: options.entry.tdsReadingValid,
    turbidity: options.entry.turbidity,
    ammoniaPpm: options.entry.ammoniaPpm,
    filterState: options.entry.filterState,
    ph: options.entry.ph,
    online: options.entry.online ?? true,
  };
}

export async function appendSensorReading(reading: SensorReadingDocument): Promise<void> {
  const readingRef = doc(collection(db, 'sensor_readings'));
  const cleanReading = stripUndefinedValues({
    ...reading,
    reading_id: readingRef.id,
  });
  const dateRef = doc(db, 'aquariums', reading.aquariumId, 'sensor_readings', reading.dateKey);
  const nestedReadingRef = doc(
    dateRef,
    'readings',
    buildReadingTimeKey(reading.recordedAtEpoch)
  );
  const batch = writeBatch(db);

  batch.set(readingRef, cleanReading);
  batch.set(
    dateRef,
    stripUndefinedValues({
      aquariumId: reading.aquariumId,
      aquarium_id: reading.aquariumId,
      device_id: reading.device_id,
      ownerId: reading.ownerId,
      ownerName: reading.ownerName,
      dateKey: reading.dateKey,
      lastRecordedAtEpoch: reading.recordedAtEpoch,
      updatedAtEpoch: Date.now(),
    })
  );
  batch.set(nestedReadingRef, cleanReading);

  await batch.commit();
}

export async function upsertSensorReading(
  docId: string,
  reading: SensorReadingDocument
): Promise<void> {
  const cleanReading = stripUndefinedValues({
    ...reading,
    reading_id: docId,
  });
  const dateRef = doc(db, 'aquariums', reading.aquariumId, 'sensor_readings', reading.dateKey);
  const nestedReadingRef = doc(
    dateRef,
    'readings',
    buildReadingTimeKey(reading.recordedAtEpoch)
  );
  const batch = writeBatch(db);

  batch.set(doc(db, 'sensor_readings', docId), cleanReading);
  batch.set(
    dateRef,
    stripUndefinedValues({
      aquariumId: reading.aquariumId,
      aquarium_id: reading.aquariumId,
      device_id: reading.device_id,
      ownerId: reading.ownerId,
      ownerName: reading.ownerName,
      dateKey: reading.dateKey,
      lastRecordedAtEpoch: reading.recordedAtEpoch,
      updatedAtEpoch: Date.now(),
    })
  );
  batch.set(nestedReadingRef, cleanReading);

  await batch.commit();
}

export async function getSensorReadingsForDateKey(
  aquariumId: string,
  dateKey: string
): Promise<DeviceTelemetryLogEntry[]> {
  const snapshot = await getDocs(
    query(
      collection(db, 'sensor_readings'),
      where('aquariumId', '==', aquariumId),
      where('dateKey', '==', dateKey),
      orderBy('recordedAtEpoch', 'asc')
    )
  );

  return snapshot.docs
    .map((docSnap) => mapSensorReadingDocument(docSnap.data()))
    .filter((entry): entry is DeviceTelemetryLogEntry => Boolean(entry));
}
