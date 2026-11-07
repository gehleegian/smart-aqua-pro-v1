// Read-only live setup audit. Never logs credentials, token strings or user data.
import { readFile } from 'node:fs/promises';
import { parseEnv, isDeepStrictEqual } from 'node:util';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
import { getSecurityRules } from 'firebase-admin/security-rules';

const projectId = 'practice-smartaqua';
const deviceId = 'SAQ-7K3M-9R2X';
const deviceUid = 'esp32-SAQ-7K3M-9R2X';
const privateRoot = 'C:/Users/marin/firebase-private';
const databaseURL = 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app';
let app;
try {
  for (const key of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST']) {
    if (process.env[key]) throw new Error('EMULATOR_ENV_PRESENT');
  }
  const key = JSON.parse(await readFile(`${privateRoot}/aquarium-setup-key.json`, 'utf8'));
  if (key.project_id !== projectId) throw new Error('KEY_PROJECT_MISMATCH');
  const env = { ...parseEnv(await readFile('.env', 'utf8')),
    ...parseEnv(await readFile('.env.local', 'utf8').catch(error => {
      if (error.code === 'ENOENT') return ''; throw error;
    })) };
  console.log('Local environment variable names:', Object.keys(env).sort().join(', '));
  for (const name of Object.keys(env)) {
    if (name.startsWith('VITE_FIREBASE_')) {
      const nextName = name.replace('VITE_', 'NEXT_PUBLIC_');
      if (!env[nextName]) env[nextName] = env[name];
    }
  }
  if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== projectId) throw new Error('WEB_PROJECT_MISMATCH');
  const login = JSON.parse(await readFile(`${privateRoot}/aquarium1-device-login.json`, 'utf8'));
  if (login.projectId !== projectId || login.deviceUid !== deviceUid || login.deviceId !== deviceId ||
      typeof login.email !== 'string' || typeof login.password !== 'string') throw new Error('LOGIN_FILE_MISMATCH');
  app = initializeApp({ projectId, databaseURL, credential: cert(key) }, 'aquarium1-setup-audit');
  const auth = getAuth(app);
  const user = await auth.getUser(deviceUid);
  console.log(JSON.stringify({ deviceUid: user.uid, enabled: !user.disabled,
    deviceRole: user.customClaims?.principalType === 'device',
    loginEmailMatches: user.email === login.email,
    passwordProvider: user.providerData.some(provider => provider.providerId === 'password') }));
  if (user.disabled || user.customClaims?.principalType !== 'device' || user.email !== login.email)
    throw new Error('DEVICE_IDENTITY_MISMATCH');
  const firestore = getFirestore(app);
  const [registry, binding] = await firestore.getAll(
    firestore.doc(`device_registry/${deviceId}`), firestore.doc(`device_uid_registry/${deviceUid}`));
  console.log(JSON.stringify({ registryExists: registry.exists, bindingExists: binding.exists,
    registryUidMatches: registry.exists ? registry.get('deviceUid') === deviceUid : null,
    bindingIdMatches: binding.exists ? binding.get('deviceId') === deviceId : null,
    state: registry.exists ? registry.get('state') : null,
    ownerAssigned: registry.exists ? Boolean(registry.get('ownerUid')) : false }));
  try {
    const remote = await getSecurityRules(app).getFirestoreRuleset();
    const local = await readFile('firestore.rules', 'utf8');
    const normalize = text => text.replace(/\r\n/g, '\n').trim();
    console.log(JSON.stringify({ firestoreRulesMatch: remote.source.some(file => normalize(file.content) === normalize(local)),
      firestoreRuleFiles: remote.source.length }));
  } catch (error) { console.log('Firestore rules audit unavailable:', error.code || 'RULES_READ_FAILED'); }
  try {
    const remote = await getDatabase(app).getRulesJSON();
    const local = JSON.parse(await readFile('database.rules.json', 'utf8'));
    console.log(JSON.stringify({ realtimeRulesMatch: isDeepStrictEqual(remote, local) }));
  } catch (error) { console.log('RTDB rules audit unavailable:', error.code || 'RULES_READ_FAILED'); }

  const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error('MISSING_WEB_API_KEY');
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: login.email, password: login.password, returnSecureToken: true }),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  if (!response.ok) {
    console.log(JSON.stringify({ deviceSignInPassed: false, httpStatus: response.status,
      reason: String(result.error?.message || 'AUTH_FAILED').split(' : ')[0].replace(/[^A-Z0-9_]/g, '').slice(0, 80) }));
    throw new Error('DEVICE_SIGN_IN_FAILED');
  }
  const decoded = await auth.verifyIdToken(result.idToken, true);
  if (decoded.uid !== deviceUid || decoded.principalType !== 'device') throw new Error('TOKEN_IDENTITY_MISMATCH');
  console.log('Device email/password sign-in and verified device-role token: PASSED.');
  const refreshResponse = await fetch(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: result.refreshToken }),
    signal: AbortSignal.timeout(20000),
  });
  const refreshed = await refreshResponse.json();
  if (!refreshResponse.ok || refreshed.user_id !== deviceUid) throw new Error('TOKEN_REFRESH_FAILED');
  const checked = await auth.verifyIdToken(refreshed.id_token, true);
  if (checked.uid !== deviceUid || checked.principalType !== 'device') throw new Error('REFRESH_ROLE_MISMATCH');
  console.log('Device token refresh: PASSED. No aquarium assignment or telemetry written.');
} catch (error) {
  // SDK messages may contain credential details; print only bounded error codes.
  const safe = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : error.code || 'AUDIT_FAILED';
  console.error('Audit stopped:', safe);
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
