import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Firestore } from 'firebase-admin/firestore';

// The DRAFT goldfish seed used by scripts/seed-rules.ts. Tests run from the
// repository root (npm scripts), so the path is resolved from process.cwd().
export type SeedFile = {
  species: Record<string, Record<string, unknown>>;
  rules: Record<string, Record<string, unknown>>;
};

export function readSeed(): SeedFile {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'scripts/seed/goldfish-draft.json'), 'utf8')) as SeedFile;
}

export function readApprovedTestSeed(): SeedFile {
  const seed = readSeed();
  const approve = (data: Record<string, unknown>) => ({
    ...data,
    status: 'approved',
    source: 'TEST_FIXTURE_ONLY',
    approvedBy: 'automated-test',
    approvedAt: 1,
  });
  return {
    species: Object.fromEntries(Object.entries(seed.species).map(([id, data]) => [id, approve(data)])),
    rules: Object.fromEntries(Object.entries(seed.rules).map(([id, data]) => [id, approve(data)])),
  };
}

export async function seedRules(firestore: Firestore, seed = readApprovedTestSeed()) {
  const batch = firestore.batch();
  for (const [id, data] of Object.entries(seed.species)) batch.set(firestore.doc(`species/${id}`), data);
  for (const [id, data] of Object.entries(seed.rules)) batch.set(firestore.doc(`rules/${id}`), data);
  await batch.commit();
}

export async function clearCollections(firestore: Firestore, paths: string[]) {
  for (const collectionPath of paths) {
    const docs = await firestore.collection(collectionPath).listDocuments();
    for (const document of docs) await firestore.recursiveDelete(document);
  }
}
