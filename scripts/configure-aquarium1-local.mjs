// Operator-only credential templating. Outputs secrets ONLY to the private header.
// This does not enable claiming, turn on firmware cloud mode or mutate Firebase.
import { readFile, writeFile, access } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isDeepStrictEqual } from 'node:util';

const projectId = 'practice-smartaqua';
const deviceId = 'SAQ-7K3M-9R2X';
const deviceUid = 'esp32-SAQ-7K3M-9R2X';
const privateRoot = 'C:/Users/marin/firebase-private';
const databaseURL = 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app';
const header = `${privateRoot}/aquarium1-firmware-secrets.h`;
let app;
async function requireAbsent(path) {
  try { await access(path); } catch (error) {
    if (error.code === 'ENOENT') return; throw error;
  }
  throw new Error('OUTPUT_ALREADY_EXISTS');
}
try {
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST ||
      process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('EMULATOR_ENV_PRESENT');
  await requireAbsent('.env.local');
  await requireAbsent(header);
  const env = parseEnv(await readFile('.env', 'utf8'));
  const key = JSON.parse(await readFile(`${privateRoot}/aquarium-setup-key.json`, 'utf8'));
  const login = JSON.parse(await readFile(`${privateRoot}/aquarium1-device-login.json`, 'utf8'));
  const manifest = JSON.parse(await readFile(`${privateRoot}/aquarium1-registration.json`, 'utf8'));
  for (const record of [login, manifest]) {
    if (record.projectId !== projectId || record.deviceId !== deviceId || record.deviceUid !== deviceUid)
      throw new Error('PRIVATE_FILE_IDENTITY_MISMATCH');
  }
  if (key.project_id !== projectId || !/^[A-Za-z0-9_-]+$/.test(manifest.aquariumId || ''))
    throw new Error('INVALID_PROJECT_OR_AQUARIUM_ID');
  const publicEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (name.startsWith('VITE_FIREBASE_')) publicEnv[name.replace('VITE_', 'NEXT_PUBLIC_')] = value;
    if (name.startsWith('NEXT_PUBLIC_FIREBASE_')) publicEnv[name] = value;
  }
  if (publicEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId || !publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY ||
      publicEnv.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.replace(/\/$/, '') !== databaseURL)
    throw new Error('PUBLIC_CONFIG_PROJECT_MISMATCH');
  app = initializeApp({ projectId, credential: cert(key) }, 'aquarium1-config-check');
  const registry = await getFirestore(app).doc(`device_registry/${deviceId}`).get();
  if (!registry.exists || registry.get('deviceUid') !== deviceUid ||
      registry.get('aquariumId') !== manifest.aquariumId || registry.get('state') !== 'unclaimed')
    throw new Error('REGISTRATION_STATE_MISMATCH');

  const privateHeader = `#pragma once\n// PRIVATE: never upload this file to chat or source control.\n` +
    `// Enter your 2.4GHz Wi-Fi settings below on this computer only.\n` +
    `constexpr char WIFI_SSID[] = "";\nconstexpr char WIFI_PASSWORD[] = "";\n` +
    Object.entries({ FIREBASE_API_KEY: publicEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
      DEVICE_EMAIL: login.email, DEVICE_PASSWORD: login.password, AQUARIUM_ID: manifest.aquariumId })
      .map(([name, value]) => `constexpr char ${name}[] = ${JSON.stringify(value)};`).join('\n') + '\n';
  const serverEnv = { ...publicEnv, SMARTAQUA_DEVICE_CLAIMING_ENABLED: 'false',
    FIREBASE_ADMIN_PROJECT_ID: projectId, FIREBASE_ADMIN_DATABASE_URL: databaseURL,
    GOOGLE_APPLICATION_CREDENTIALS: `${privateRoot}/aquarium-setup-key.json` };
  const envText = '# Local configuration; claiming stays disabled until live rules are reviewed.\n' +
    Object.entries(serverEnv).map(([name, value]) => `${name}=${JSON.stringify(value)}`).join('\n') + '\n';
  // Exclusive creation prevents overwriting user edits or existing Wi-Fi secrets.
  await writeFile(header, privateHeader, { flag: 'wx', mode: 0o600 });
  await writeFile('.env.local', envText, { flag: 'wx', mode: 0o600 });
  const reread = parseEnv(await readFile('.env.local', 'utf8'));
  if (!isDeepStrictEqual(reread, serverEnv)) throw new Error('ENV_ROUNDTRIP_MISMATCH');
  console.log('Verified registry matches registration manifest.');
  console.log('Created private firmware header: Firebase API key, device login and reserved aquarium ID configured.');
  console.log('Created ignored .env.local: migrated public Firebase names and configured local Admin credential path.');
  console.log('Wi-Fi values remain blank. Firmware cloud mode and server claiming remain OFF pending remaining setup.');
} catch (error) {
  const safe = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : error.code || 'CONFIG_FAILED';
  console.error('Configuration stopped:', safe);
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
