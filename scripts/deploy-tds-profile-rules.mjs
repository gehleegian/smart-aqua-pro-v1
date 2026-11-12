// Focused rollout: exports the live source, adds only TDS validation, and
// refuses to deploy if either the reviewed candidate or live release changes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getSecurityRules } from 'firebase-admin/security-rules';
import { addTdsProfileValidation } from './lib/tdsRulesPatch.mjs';

const projectId = 'practice-smartaqua';
const hash = text => createHash('sha256').update(text).digest('hex');
let app;
try {
  const apply = process.argv.includes('--apply-practice-smartaqua');
  if (!apply && process.argv[2] !== '--prepare') throw new Error('EXPLICIT_MODE_REQUIRED');
  for (const name of ['FIRESTORE_EMULATOR_HOST', 'FIREBASE_AUTH_EMULATOR_HOST', 'FIREBASE_DATABASE_EMULATOR_HOST'])
    if (process.env[name]) throw new Error('EMULATOR_ENV_PRESENT');
  const key = JSON.parse(await readFile('C:/Users/marin/firebase-private/aquarium-setup-key.json', 'utf8'));
  if (key.project_id !== projectId) throw new Error('WRONG_PROJECT');
  app = initializeApp({ projectId, credential: cert(key) });
  const rules = getSecurityRules(app);
  const live = await rules.getFirestoreRuleset();
  if (live.source.length !== 1) throw new Error('UNEXPECTED_MULTI_FILE_RULESET');
  const before = live.source[0].content;
  if (!apply) {
    const candidate = addTdsProfileValidation(before);
    const folder = `backups/tds-profile-rules-${Date.now()}`;
    await mkdir(folder, { recursive: true });
    await writeFile(`${folder}/before.rules`, before, { flag: 'wx' });
    await writeFile(`${folder}/candidate.rules`, candidate, { flag: 'wx' });
    await writeFile(`${folder}/review.json`, JSON.stringify({ projectId, previousRuleset: live.name,
      beforeSha256: hash(before), candidateSha256: hash(candidate), preparedAt: new Date().toISOString(),
      onlyChange: 'owner-editable minTdsPpm/maxTdsPpm with finite ordered nonnegative validation' }, null, 2), { flag: 'wx' });
    console.log('Prepared focused candidate; no live writes. Backup:', folder);
  } else {
    const folder = resolve(process.argv[3] || '');
    const within = relative(resolve('backups'), folder);
    if (!within || within.startsWith('..') || isAbsolute(within)) throw new Error('INVALID_BACKUP_PATH');
    const review = JSON.parse(await readFile(`${folder}/review.json`, 'utf8'));
    const savedBefore = await readFile(`${folder}/before.rules`, 'utf8');
    const candidate = await readFile(`${folder}/candidate.rules`, 'utf8');
    if (review.projectId !== projectId || review.previousRuleset !== live.name || savedBefore !== before ||
        hash(before) !== review.beforeSha256) throw new Error('LIVE_RULES_CHANGED_REVIEW_REQUIRED');
    if (hash(candidate) !== review.candidateSha256 || candidate !== addTdsProfileValidation(before))
      throw new Error('CANDIDATE_CHANGED_REVIEW_REQUIRED');
    const released = await rules.releaseFirestoreRulesetFromSource(candidate);
    const verified = await rules.getFirestoreRuleset();
    if (verified.source.length !== 1 || verified.source[0].content !== candidate)
      throw new Error('DEPLOYMENT_READBACK_MISMATCH');
    await writeFile(`${folder}/deployment.json`, JSON.stringify({ ...review, deployedRuleset: released.name,
      deployedAt: new Date().toISOString(), verifiedSha256: hash(verified.source[0].content),
      aquariumDataChanged: false, functionsChanged: false, rtdbChanged: false }, null, 2), { flag: 'wx' });
    console.log('Focused TDS profile rules deployed and exact read-back verified. Backup:', folder);
    console.log('Aquarium data, owner checks, other rules, Functions and RTDB unchanged.');
  }
} catch (error) {
  console.error('TDS rules rollout stopped:', /^[A-Z0-9_]+$/.test(error.message || '')
    ? error.message : error.code || 'RULES_OPERATION_FAILED');
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
