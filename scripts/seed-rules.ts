// Seed the DRAFT goldfish species thresholds and IF-THEN rules into Firestore.
//
//   node --experimental-strip-types scripts/seed-rules.ts              # emulator (default)
//   node --experimental-strip-types scripts/seed-rules.ts --dry-run    # print what would be written
//   node --experimental-strip-types scripts/seed-rules.ts --project <id>  # a real project: asks to confirm
//
// Data: scripts/seed/goldfish-draft.json. Every document is status "draft",
// source "TBD". To swap in approved values, edit the JSON (status "approved",
// source = citation, approvedBy, approvedAt) and re-run; see docs/rule-engine.md.
// Existing documents are overwritten (set), documents not in the file are left alone.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// firebase-admin is a dependency of functions/, not of the web app.
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const DEFAULT_EMULATOR_PROJECT = 'demo-smartaqua';
const DEFAULT_EMULATOR_HOST = '127.0.0.1:8080';

const args = process.argv.slice(2);
const projectIndex = args.indexOf('--project');
const project = projectIndex >= 0 ? args[projectIndex + 1] : null;
const dryRun = args.includes('--dry-run');
if (projectIndex >= 0 && !project) {
  console.error('--project needs a project id.');
  process.exit(1);
}

const seed = JSON.parse(readFileSync(path.join(root, 'scripts/seed/goldfish-draft.json'), 'utf8')) as {
  species: Record<string, Record<string, unknown>>;
  rules: Record<string, Record<string, unknown>>;
};
const writes = [
  ...Object.entries(seed.species).map(([id, data]) => ({ path: `species/${id}`, data })),
  ...Object.entries(seed.rules).map(([id, data]) => ({ path: `rules/${id}`, data })),
];

async function main() {
  let projectId: string;
  if (project) {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      console.error('FIRESTORE_EMULATOR_HOST is set; unset it to target a real project.');
      process.exit(1);
    }
    projectId = project;
    console.log(`About to write ${writes.length} documents (species + rules, all DRAFT) to the REAL project "${projectId}".`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the project id (${projectId}) to confirm: `);
    rl.close();
    if (answer.trim() !== projectId) {
      console.log('Not confirmed. Nothing was written.');
      process.exit(1);
    }
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ||= DEFAULT_EMULATOR_HOST;
    projectId = process.env.GCLOUD_PROJECT || DEFAULT_EMULATOR_PROJECT;
    console.log(`Emulator ${process.env.FIRESTORE_EMULATOR_HOST}, project "${projectId}".`);
  }

  if (dryRun) {
    for (const write of writes) console.log(`would set ${write.path} (status ${String(write.data.status)})`);
    return;
  }

  const firestore = getFirestore(initializeApp({ projectId }, 'seed-rules'));
  const batch = firestore.batch();
  for (const write of writes) batch.set(firestore.doc(write.path), write.data);
  await batch.commit();
  console.log(`Wrote ${writes.length} documents: ${Object.keys(seed.species).length} species, ${Object.keys(seed.rules).length} rules.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
