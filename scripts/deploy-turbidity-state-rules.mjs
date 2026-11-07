// Narrow reviewed extension: no authorization or existing validators may change.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
const projectId = 'practice-smartaqua';
let app;
try {
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST'])
    if (process.env[name]) throw new Error('EMULATOR_ENV_PRESENT');
  const candidate = JSON.parse(await readFile('database.rules.json', 'utf8'));
  const expected = { '.validate': "newData.isString() && (newData.val() == 'Clear' || newData.val() == 'Cloudy' || newData.val() == 'Unknown')" };
  if (!isDeepStrictEqual(candidate.rules.devices.$aquariumId.telemetry.turbidityState, expected))
    throw new Error('UNEXPECTED_TURBIDITY_VALIDATOR');
  const baseline = structuredClone(candidate);
  delete baseline.rules.devices.$aquariumId.telemetry.turbidityState;
  const key = JSON.parse(await readFile('C:/Users/marin/firebase-private/aquarium-setup-key.json', 'utf8'));
  if (key.project_id !== projectId) throw new Error('WRONG_PROJECT');
  app = initializeApp({ projectId, credential: cert(key),
    databaseURL: 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app' });
  const database = getDatabase(app);
  const live = await database.getRulesJSON();
  if (isDeepStrictEqual(live, candidate)) console.log('Turbidity-state rules already match.');
  else {
    if (!isDeepStrictEqual(live, baseline)) throw new Error('LIVE_RULES_DIFFER_REVIEW_REQUIRED');
    console.log('Verified optional turbidityState is the only rules change; authorization unchanged.');
    if (process.argv.includes('--apply-practice-smartaqua')) {
      const folder = `backups/turbidity-state-rtdb-${Date.now()}`;
      await mkdir(folder, { recursive: true });
      await writeFile(`${folder}/before.rules.json`, JSON.stringify(live, null, 2), { flag: 'wx' });
      await writeFile(`${folder}/candidate.rules.json`, JSON.stringify(candidate, null, 2), { flag: 'wx' });
      if (!isDeepStrictEqual(await database.getRulesJSON(), live)) throw new Error('RULES_CHANGED_DURING_PREPARATION');
      await database.setRules(candidate);
      if (!isDeepStrictEqual(await database.getRulesJSON(), candidate)) throw new Error('READBACK_MISMATCH');
      console.log('Turbidity-state rules deployed and verified. Backup:', folder);
    } else console.log('Read-only preflight complete.');
  }
} catch (error) {
  console.error('Turbidity rules rollout stopped:', /^[A-Z0-9_]+$/.test(error.message || '') ? error.message : 'RULES_OPERATION_FAILED');
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
