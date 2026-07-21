import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const DEFAULT_AQUARIUM_ID = 'alM2myUEMcNgWj9CkZ6T';
const FIRESTORE_BASE_URL = 'https://firestore.googleapis.com/v1';
const OAUTH_TOKEN_URL = 'https://oauth2.googleapis.com/token';

function getEnv(name) {
  const value = process.env[name];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function requireEnv(...names) {
  for (const name of names) {
    const value = getEnv(name);
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable. Set one of: ${names.join(', ')}`);
}

function toBase64Url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

function encodeJwtSegment(value) {
  return toBase64Url(Buffer.from(JSON.stringify(value)));
}

function getNumericField(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  return Number.isInteger(value)
    ? { integerValue: String(value) }
    : { doubleValue: value };
}

function toFirestoreValue(value) {
  if (value === null) {
    return { nullValue: null };
  }

  if (typeof value === 'string') {
    return { stringValue: value };
  }

  if (typeof value === 'boolean') {
    return { booleanValue: value };
  }

  if (typeof value === 'number') {
    const numericValue = getNumericField(value);
    return numericValue || { nullValue: null };
  }

  if (Array.isArray(value)) {
    return {
      arrayValue: {
        values: value.map((item) => toFirestoreValue(item)),
      },
    };
  }

  if (typeof value === 'object') {
    const fields = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      if (nestedValue === undefined) {
        continue;
      }

      fields[key] = toFirestoreValue(nestedValue);
    }

    return { mapValue: { fields } };
  }

  return { nullValue: null };
}

function fromFirestoreDocument(document) {
  const fields = document?.fields || {};
  const ownerId = fields.ownerId?.stringValue || '';
  const ownerName = fields.ownerName?.stringValue || '';

  return { ownerId, ownerName };
}

function fromRtdbReading(reading) {
  if (!reading || typeof reading !== 'object' || Array.isArray(reading)) {
    return null;
  }

  const entry = reading;
  const recordedAtEpoch = Number(entry.recordedAtEpoch);
  const temperatureC = Number(entry.temperatureC);
  const waterLevelPercent = Number(entry.waterLevelPercent);

  if (
    !Number.isFinite(recordedAtEpoch) ||
    !Number.isFinite(temperatureC) ||
    !Number.isFinite(waterLevelPercent)
  ) {
    return null;
  }

  return {
    recordedAtEpoch,
    recordedAt:
      typeof entry.recordedAt === 'string' && entry.recordedAt.trim()
        ? entry.recordedAt
        : new Date(recordedAtEpoch).toISOString().replace('Z', ''),
    temperatureC,
    temperatureReadingValid:
      typeof entry.temperatureReadingValid === 'boolean' ? entry.temperatureReadingValid : true,
    waterLevelPercent,
    waterPresent: typeof entry.waterPresent === 'boolean' ? entry.waterPresent : true,
    tdsPpm: Number.isFinite(Number(entry.tdsPpm)) ? Number(entry.tdsPpm) : undefined,
    tdsPercent: Number.isFinite(Number(entry.tdsPercent ?? entry.waterQualityPercent))
      ? Number(entry.tdsPercent ?? entry.waterQualityPercent)
      : undefined,
    tdsReadingValid:
      typeof entry.tdsReadingValid === 'boolean'
        ? entry.tdsReadingValid
        : Number.isFinite(Number(entry.tdsPercent ?? entry.waterQualityPercent)),
    turbidity: Number.isFinite(Number(entry.turbidity)) ? Number(entry.turbidity) : undefined,
    ammoniaPpm: Number.isFinite(Number(entry.ammoniaPpm)) ? Number(entry.ammoniaPpm) : undefined,
    filterState:
      entry.filterState === 'Active' || entry.filterState === 'Inactive'
        ? entry.filterState
        : undefined,
    ph: Number.isFinite(Number(entry.ph)) ? Number(entry.ph) : undefined,
    online: typeof entry.online === 'boolean' ? entry.online : true,
  };
}

function buildDocId(aquariumId, dateKey, recordedAtEpoch) {
  return `${aquariumId}_${dateKey}_${recordedAtEpoch}`;
}

function buildReadingTimeKey(recordedAtEpoch) {
  const date = new Date(recordedAtEpoch);
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  const second = String(date.getSeconds()).padStart(2, '0');
  return `${hour}-${minute}-${second}`;
}

function formatDateKey(epochMillis) {
  const date = new Date(epochMillis);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

async function getAccessToken(serviceAccountPath) {
  const raw = await readFile(serviceAccountPath, 'utf8');
  const serviceAccount = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);

  const header = encodeJwtSegment({ alg: 'RS256', typ: 'JWT' });
  const payload = encodeJwtSegment({
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/datastore',
    aud: OAUTH_TOKEN_URL,
    iat: now,
    exp: now + 3600,
  });

  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();

  const signature = signer.sign(serviceAccount.private_key);
  const assertion = `${header}.${payload}.${toBase64Url(signature)}`;
  const response = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });

  if (!response.ok) {
    throw new Error(`OAuth token request failed: ${response.status} ${await response.text()}`);
  }

  const tokenBody = await response.json();
  return {
    accessToken: tokenBody.access_token,
    projectId: serviceAccount.project_id || '',
  };
}

async function fetchJson(url, accessToken, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text()}`);
  }

  return response.json();
}

async function main() {
  const aquariumId = process.argv[2] || DEFAULT_AQUARIUM_ID;
  const databaseUrl = requireEnv('FIREBASE_DATABASE_URL', 'VITE_FIREBASE_DATABASE_URL');
  const serviceAccountPath = requireEnv('GOOGLE_APPLICATION_CREDENTIALS');

  const { accessToken, projectId: serviceAccountProjectId } =
    await getAccessToken(serviceAccountPath);
  const projectId =
    getEnv('FIREBASE_PROJECT_ID') ||
    getEnv('VITE_FIREBASE_PROJECT_ID') ||
    serviceAccountProjectId;

  if (!projectId) {
    throw new Error('Missing Firebase project ID.');
  }

  const aquariumDocUrl = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/aquariums/${aquariumId}`;
  const aquariumDocument = await fetchJson(aquariumDocUrl, accessToken);
  const { ownerId, ownerName } = fromFirestoreDocument(aquariumDocument);

  if (!ownerId || !ownerName) {
    throw new Error(`Aquarium ${aquariumId} is missing ownerId or ownerName.`);
  }

  const rtdbHistoryUrl = `${databaseUrl.replace(/\/$/, '')}/devices/${aquariumId}/history.json`;
  const history = await fetchJson(
    `${rtdbHistoryUrl}?auth=${encodeURIComponent(accessToken)}`,
    accessToken,
    {
      headers: {},
    }
  );

  if (!history || typeof history !== 'object' || Array.isArray(history)) {
    console.log(`No RTDB history found for ${aquariumId}.`);
    return;
  }

  let written = 0;

  for (const [dateKey, dayValue] of Object.entries(history)) {
    if (!dayValue || typeof dayValue !== 'object' || Array.isArray(dayValue)) {
      continue;
    }

    for (const [entryKey, rawEntry] of Object.entries(dayValue)) {
      const entry = fromRtdbReading(rawEntry);

      if (!entry) {
        continue;
      }

      const docId = buildDocId(aquariumId, dateKey, entry.recordedAtEpoch);
      const rootDocUrl = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/sensor_readings/${docId}`;
      const dateDocUrl = `${FIRESTORE_BASE_URL}/projects/${projectId}/databases/(default)/documents/aquariums/${aquariumId}/sensor_readings/${dateKey}`;
      const nestedDocUrl = `${dateDocUrl}/readings/${buildReadingTimeKey(entry.recordedAtEpoch)}`;

      const readingPayload = {
        fields: {
          reading_id: { stringValue: docId },
          aquarium_id: { stringValue: aquariumId },
          device_id: { stringValue: aquariumId },
          aquariumId: { stringValue: aquariumId },
          ownerId: { stringValue: ownerId },
          ownerName: { stringValue: ownerName },
          source: { stringValue: 'sync' },
          dateKey: { stringValue: dateKey },
          recordedAt: { timestampValue: new Date(entry.recordedAtEpoch).toISOString() },
          recordedAtEpoch: { integerValue: String(entry.recordedAtEpoch) },
          ingestedAtEpoch: { integerValue: String(Date.now()) },
          temperatureC: { doubleValue: entry.temperatureC },
          temperatureReadingValid: { booleanValue: entry.temperatureReadingValid },
          waterLevelPercent: { doubleValue: entry.waterLevelPercent },
          waterPresent: { booleanValue: entry.waterPresent },
          tdsReadingValid: { booleanValue: entry.tdsReadingValid },
          online: { booleanValue: entry.online },
          ...(entry.tdsPpm === undefined ? {} : { tdsPpm: getNumericField(entry.tdsPpm) }),
          ...(entry.tdsPercent === undefined ? {} : { tdsPercent: getNumericField(entry.tdsPercent) }),
          ...(entry.tdsPercent === undefined
            ? {}
            : { waterQualityPercent: getNumericField(entry.tdsPercent) }),
          ...(entry.turbidity === undefined ? {} : { turbidity: getNumericField(entry.turbidity) }),
          ...(entry.ammoniaPpm === undefined ? {} : { ammoniaPpm: getNumericField(entry.ammoniaPpm) }),
          ...(entry.filterState === undefined ? {} : { filterState: { stringValue: entry.filterState } }),
          ...(entry.ph === undefined ? {} : { ph: getNumericField(entry.ph) }),
        },
      };
      const datePayload = {
        fields: {
          aquarium_id: { stringValue: aquariumId },
          device_id: { stringValue: aquariumId },
          aquariumId: { stringValue: aquariumId },
          ownerId: { stringValue: ownerId },
          ownerName: { stringValue: ownerName },
          dateKey: { stringValue: dateKey },
          lastRecordedAtEpoch: { integerValue: String(entry.recordedAtEpoch) },
          updatedAtEpoch: { integerValue: String(Date.now()) },
        },
      };

      for (const [url, payload] of [
        [rootDocUrl, readingPayload],
        [dateDocUrl, datePayload],
        [nestedDocUrl, readingPayload],
      ]) {
        await fetch(url, {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        }).then(async (response) => {
          if (!response.ok) {
            throw new Error(`${response.status} ${await response.text()}`);
          }
        });
      }

      written += 1;
    }
  }

  console.log(`Backfilled ${written} sensor reading(s) for aquarium ${aquariumId}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
