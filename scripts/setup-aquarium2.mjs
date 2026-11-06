// Operator-only Aquarium 2 registration. Credentials are written only privately.
import { readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes, randomInt } from 'node:crypto';
import { execFile } from 'node:child_process';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { parseEnv } from 'node:util';

const projectId = 'practice-smartaqua';
const privateRoot = 'C:/Users/marin/firebase-private';
const loginPath = `${privateRoot}/aquarium2-device-login.json`;
const manifestPath = `${privateRoot}/aquarium2-registration.json`;
const headerPath = `${privateRoot}/aquarium2-firmware-secrets.h`;
const identityPath = new URL('../firmware/Aquarium2Device/DeviceIdentity.h', import.meta.url);
const databaseURL = 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app';
let app;
async function exists(path) {
  try { await access(path); return true; } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}
function headerValue(header, name) {
  const match = header.match(new RegExp(`constexpr char ${name}\\[\\]\\s*=\\s*("(?:\\\\.|[^"\\\\])*")\\s*;`));
  if (!match) throw new Error('SOURCE_HEADER_INVALID');
  return JSON.parse(match[1]);
}
try {
  if (!process.argv.includes('--apply-practice-smartaqua')) throw new Error('EXPLICIT_PROJECT_REQUIRED');
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST'])
    if (process.env[name]) throw new Error('EMULATOR_ENV_PRESENT');
  const key = JSON.parse(await readFile(`${privateRoot}/aquarium-setup-key.json`, 'utf8'));
  if (key.project_id !== projectId) throw new Error('WRONG_PROJECT');
  const env = parseEnv(await readFile('.env.local', 'utf8'));
  if (env.FIREBASE_ADMIN_PROJECT_ID !== projectId || env.SMARTAQUA_DEVICE_CLAIMING_ENABLED !== 'true')
    throw new Error('CLAIMING_NOT_READY');
  const sourceHeader = await readFile(`${privateRoot}/aquarium1-firmware-secrets.h`, 'utf8');
  const wifi = { WIFI_SSID: headerValue(sourceHeader, 'WIFI_SSID'),
    WIFI_PASSWORD: headerValue(sourceHeader, 'WIFI_PASSWORD') };
  const apiKey = headerValue(sourceHeader, 'FIREBASE_API_KEY');
  if (!wifi.WIFI_SSID || !apiKey) throw new Error('SOURCE_SETTINGS_MISSING');
  app = initializeApp({ projectId, credential: cert(key), databaseURL });
  const auth = getAuth(app);
  const db = getFirestore(app);
  let login;
  if (await exists(loginPath)) {
    login = JSON.parse(await readFile(loginPath, 'utf8'));
  } else {
    if (await exists(manifestPath) || await exists(headerPath)) throw new Error('PARTIAL_FILES_NEED_REVIEW');
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const part = () => Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
    const deviceId = `SAQ-${part()}-${part()}`;
    const deviceUid = `esp32-${deviceId}`;
    if ((await db.doc(`device_registry/${deviceId}`).get()).exists) throw new Error('ID_COLLISION_RETRY');
    login = { projectId, deviceId, deviceUid,
      email: `${deviceUid.toLowerCase()}@devices.smartaqua.invalid`,
      password: randomBytes(32).toString('base64url') };
    await writeFile(loginPath, JSON.stringify(login, null, 2), { flag: 'wx', mode: 0o600 });
  }
  if (login.projectId !== projectId || !/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(login.deviceId) ||
      login.deviceUid !== `esp32-${login.deviceId}` || login.deviceId === 'SAQ-7K3M-9R2X' ||
      !login.email || !login.password) throw new Error('IDENTITY_FILE_MISMATCH');
  let device;
  try { device = await auth.getUser(login.deviceUid); }
  catch (error) {
    if (error.code !== 'auth/user-not-found') throw error;
    device = await auth.createUser({ uid: login.deviceUid, email: login.email,
      password: login.password, disabled: false, emailVerified: false });
  }
  if (device.disabled || device.email !== login.email) throw new Error('AUTH_IDENTITY_MISMATCH');
  // Prove saved password matches before resuming a partial creation/role step.
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: login.email, password: login.password, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000),
  });
  const signedIn = await response.json();
  if (!response.ok || signedIn.localId !== login.deviceUid) throw new Error('DEVICE_SIGN_IN_FAILED');
  if (device.customClaims?.principalType && device.customClaims.principalType !== 'device')
    throw new Error('UNEXPECTED_ROLE');
  if (device.customClaims?.principalType !== 'device')
    await auth.setCustomUserClaims(login.deviceUid, { ...device.customClaims, principalType: 'device' });

  if (!await exists(manifestPath)) {
    await new Promise((resolve, reject) => execFile(process.execPath, ['scripts/provision-device.mjs',
      '--project', projectId, '--device-id', login.deviceId, '--device-uid', login.deviceUid,
      '--apply', '--confirm-project', projectId, '--out', manifestPath],
    { env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: `${privateRoot}/aquarium-setup-key.json` },
      windowsHide: true, maxBuffer: 1024 * 1024 }, error => error ? reject(new Error('REGISTRY_PROVISION_FAILED')) : resolve()));
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.projectId !== projectId || manifest.deviceId !== login.deviceId || manifest.deviceUid !== login.deviceUid ||
      !/^[A-Za-z0-9_-]+$/.test(manifest.aquariumId || '')) throw new Error('MANIFEST_MISMATCH');
  const [registry, binding] = await db.getAll(db.doc(`device_registry/${login.deviceId}`),
    db.doc(`device_uid_registry/${login.deviceUid}`));
  if (!registry.exists || registry.get('deviceUid') !== login.deviceUid || registry.get('aquariumId') !== manifest.aquariumId ||
      registry.get('state') !== 'unclaimed' || registry.get('ownerUid') || binding.get('deviceId') !== login.deviceId)
    throw new Error('REGISTRATION_REQUIRES_REVIEW');
  if (await exists(headerPath)) {
    const saved = await readFile(headerPath, 'utf8');
    if (headerValue(saved, 'AQUARIUM_ID') !== manifest.aquariumId || headerValue(saved, 'DEVICE_EMAIL') !== login.email ||
        headerValue(saved, 'DEVICE_PASSWORD') !== login.password) throw new Error('EXISTING_HEADER_MISMATCH');
  } else {
    const values = { ...wifi, FIREBASE_API_KEY: apiKey, DEVICE_EMAIL: login.email,
      DEVICE_PASSWORD: login.password, AQUARIUM_ID: manifest.aquariumId };
    await writeFile(headerPath, '#pragma once\n// PRIVATE Aquarium 2 settings. Never share this file.\n' +
      Object.entries(values).map(([name, value]) => `constexpr char ${name}[] = ${JSON.stringify(value)};`).join('\n') + '\n',
    { flag: 'wx', mode: 0o600 });
  }
  const identityHeader = '#pragma once\n// Local device identity; never publish unclaimed IDs.\n' +
    `constexpr char DEVICE_UID[] = ${JSON.stringify(login.deviceUid)};\n` +
    `constexpr char ENCLOSURE_ID[] = ${JSON.stringify(login.deviceId)};\n`;
  if (await exists(identityPath)) {
    const savedIdentity = await readFile(identityPath, 'utf8');
    if (headerValue(savedIdentity, 'DEVICE_UID') !== login.deviceUid ||
        headerValue(savedIdentity, 'ENCLOSURE_ID') !== login.deviceId) throw new Error('IDENTITY_HEADER_MISMATCH');
  } else await writeFile(identityPath, identityHeader, { flag: 'wx', mode: 0o600 });
  const refreshedResponse = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: signedIn.refreshToken }),
    signal: AbortSignal.timeout(20000),
  });
  const refreshed = await refreshedResponse.json();
  if (!refreshedResponse.ok) throw new Error('REFRESH_FAILED');
  const decoded = await auth.verifyIdToken(refreshed.id_token, true);
  if (decoded.uid !== login.deviceUid || decoded.principalType !== 'device') throw new Error('ROLE_VERIFICATION_FAILED');
  console.log(JSON.stringify({ projectId, deviceId: login.deviceId, deviceUid: login.deviceUid,
    registrationState: 'unclaimed', ownerAssigned: false, deviceSignInVerified: true,
    deviceRoleVerified: true, privateHeaderCreated: true, wifiCopiedFromAquarium1: true }, null, 2));
  console.log('Aquarium 2 is ready for the intended User account to claim. Aquarium 1 unchanged.');
} catch (error) {
  console.error('Aquarium 2 setup stopped:', /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'SETUP_FAILED');
  console.error('Keep private files for recovery; no credentials were printed.');
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
