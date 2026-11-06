// Export non-secret live security rules for a local diff/rollback copy. No live writes.
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { getSecurityRules } from 'firebase-admin/security-rules';
const key = JSON.parse(await readFile('C:/Users/marin/firebase-private/aquarium-setup-key.json', 'utf8'));
if (key.project_id !== 'practice-smartaqua') throw new Error('Wrong project');
const app = initializeApp({ projectId: key.project_id, credential: cert(key),
  databaseURL: 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app' });
try {
  const folder = `backups/aquarium1-rules-${Date.now()}`;
  await mkdir(folder, { recursive: true });
  const firestore = await getSecurityRules(app).getFirestoreRuleset();
  if (firestore.source.length !== 1) throw new Error('Unexpected multi-file rules');
  const rtdb = await getDatabase(app).getRulesJSON();
  await writeFile(`${folder}/firestore.rules`, firestore.source[0].content, { flag: 'wx' });
  await writeFile(`${folder}/database.rules.json`, JSON.stringify(rtdb, null, 2), { flag: 'wx' });
  await writeFile(`${folder}/metadata.json`, JSON.stringify({ projectId: key.project_id,
    firestoreRuleset: firestore.name, exportedAt: new Date().toISOString() }, null, 2), { flag: 'wx' });
  console.log('Live rules exported for comparison:', folder);
} catch (error) {
  console.error('Rules export failed:', error.code || 'EXPORT_FAILED');
  process.exitCode = 1;
} finally { await deleteApp(app); }
