// Explicit, narrow live rollout. Never deploys the broader firestore.rules file.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { getDatabase } from 'firebase-admin/database';
import { getFirestore } from 'firebase-admin/firestore';
import { isDeepStrictEqual, parseEnv } from 'node:util';
const projectId = 'practice-smartaqua';
const baselinePath = 'backups/aquarium1-rules-1793885457188';
const normalize = text => text.replace(/\r\n/g, '\n').trim();
let app;
try {
  if (!process.argv.includes('--apply-practice-smartaqua')) throw new Error('EXPLICIT_CONFIRMATION_REQUIRED');
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST'])
    if (process.env[name]) throw new Error('EMULATOR_ENV_PRESENT');
  const key = JSON.parse(await readFile('C:/Users/marin/firebase-private/aquarium-setup-key.json', 'utf8'));
  if (key.project_id !== projectId) throw new Error('WRONG_PROJECT');
  const envText = await readFile('.env.local', 'utf8');
  const env = parseEnv(envText);
  if (env.FIREBASE_ADMIN_PROJECT_ID !== projectId || env.SMARTAQUA_DEVICE_CLAIMING_ENABLED !== 'false')
    throw new Error('UNEXPECTED_LOCAL_CONFIG');
  app = initializeApp({ projectId, credential: cert(key), databaseURL: env.FIREBASE_ADMIN_DATABASE_URL });
  const rules = getSecurityRules(app);
  const live = await rules.getFirestoreRuleset();
  const baseline = normalize(await readFile(`${baselinePath}/firestore.rules`, 'utf8'));
  const candidate = normalize(await readFile('firestore.claiming.rules', 'utf8'));
  if (live.source.length !== 1 || normalize(live.source[0].content) !== baseline)
    throw new Error('LIVE_RULES_CHANGED_REVIEW_REQUIRED');
  const remoteRtdb = await getDatabase(app).getRulesJSON();
  if (!isDeepStrictEqual(remoteRtdb, JSON.parse(await readFile('database.rules.json', 'utf8'))))
    throw new Error('RTDB_RULES_CHANGED_REVIEW_REQUIRED');
  const registry = await getFirestore(app).doc('device_registry/SAQ-7K3M-9R2X').get();
  if (registry.get('state') !== 'unclaimed' || registry.get('deviceUid') !== 'esp32-SAQ-7K3M-9R2X')
    throw new Error('DEVICE_STATE_CHANGED');
  const released = await rules.releaseFirestoreRulesetFromSource(candidate);
  const verified = await rules.getFirestoreRuleset();
  if (verified.source.length !== 1 || normalize(verified.source[0].content) !== candidate)
    throw new Error('DEPLOYMENT_VERIFICATION_FAILED');
  const record = { projectId, previousRuleset: live.name, deployedRuleset: released.name,
    sourceFile: 'firestore.claiming.rules', sha256: createHash('sha256').update(candidate).digest('hex'),
    deployedAt: new Date().toISOString(), rtdbChanged: false };
  await writeFile(`${baselinePath}/claiming-deployment.json`, JSON.stringify(record, null, 2), { flag: 'wx' });
  // Only the activation flag changes; public values and secret path are preserved.
  const next = envText.replace(/^SMARTAQUA_DEVICE_CLAIMING_ENABLED=.*$/m, 'SMARTAQUA_DEVICE_CLAIMING_ENABLED="true"');
  if (next === envText) throw new Error('ENABLE_FLAG_NOT_FOUND');
  await writeFile('.env.local', next);
  console.log('Focused Firestore claiming rules deployed and read-back verified. RTDB rules unchanged.');
  console.log('Local website claiming enabled. Device remains unclaimed; no owner or commands changed.');
  console.log('Rollback metadata saved with the original rules backup.');
} catch (error) {
  const safe = /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : error.code || 'ROLLOUT_FAILED';
  console.error('Rollout stopped:', safe);
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
