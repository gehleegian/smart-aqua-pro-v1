// Removes ONLY the test data listed in docs/device-contract.md §7. Reviewed
// step; never part of a deploy. DO NOT run against the live project without
// the team's sign-off.
//
//   node --experimental-strip-types scripts/cleanup-test-data.ts                    # emulator, dry run (default)
//   node --experimental-strip-types scripts/cleanup-test-data.ts --apply            # emulator, delete after a JSON backup
//   ... --confirmed-test-tank <aquariumId>   (repeatable) also delete that whole tank (Boyto / Halwan once confirmed)
//   ... --include-legacy-alerts              also delete the legacy "No Live Data" alert_records
//   ... --project <id> --database-url <url>  a REAL project: asks you to type the id before --apply deletes
//
// Targets (§7):
//   1. sensor_readings rows dated 2026-05-16..2026-05-29 with temperatureC == 0 or ph == 0,
//      flat and nested (aquariums/{id}/sensor_readings/{day}/readings/*);
//   2. rows with recordedAtEpoch < 946684800000 (the 1997 / millis() timestamp), flat and nested;
//   3. --confirmed-test-tank: the aquarium doc and its subcollections, aquarium_directory,
//      its flat sensor_readings, alert_records, recommendations, maintenance_actions,
//      command_logs, monitoring_reports, RTDB devices/{id} and authorization/aquariums/{id};
//   4. --include-legacy-alerts: alert_records with type/message "No Live Data" and no
//      dedupKey (the pre-Cloud-Function snake_case alerts).
// Aquariums named Boyto or Halwan are listed as candidates but are never deleted
// unless their id is passed with --confirmed-test-tank.
//
// Before anything is deleted, every document and RTDB node about to go is
// written to backups/cleanup-<project>-<time>.json (gitignored). If the backup
// cannot be written, nothing is deleted.
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const DEFAULT_EMULATOR_PROJECT = 'demo-smartaqua';
const EPOCH_FLOOR = 946684800000;
const ZERO_FROM = '2026-05-16';
const ZERO_TO = '2026-05-29';
const CANDIDATE_NAMES = ['boyto', 'halwan'];
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const flags = (name: string) => args.flatMap((value, index) => (args[index - 1] === name ? [value] : []));
const project = flag('--project');
const databaseUrlFlag = flag('--database-url');
const apply = args.includes('--apply');
const includeLegacyAlerts = args.includes('--include-legacy-alerts');
const confirmedTanks = flags('--confirmed-test-tank');
const backupDir = path.resolve(root, flag('--backup-dir') ?? 'backups');

type Data = Record<string, unknown>;
type DocTarget = { kind: 'doc'; path: string; reason: string; data: Data };
type NodeTarget = { kind: 'rtdb'; path: string; reason: string; data: unknown };
type Target = DocTarget | NodeTarget;

async function connect() {
  let projectId: string;
  let databaseURL: string;
  if (project) {
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
      console.error('Emulator host variables are set; unset them to target a real project.');
      process.exit(1);
    }
    if (!databaseUrlFlag) {
      console.error('--project needs --database-url.');
      process.exit(1);
    }
    projectId = project;
    databaseURL = databaseUrlFlag;
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
    projectId = process.env.GCLOUD_PROJECT || DEFAULT_EMULATOR_PROJECT;
    databaseURL = databaseUrlFlag ?? `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${projectId}-default-rtdb`;
    console.log(`Emulators, project "${projectId}".`);
  }
  const app = initializeApp({ projectId, databaseURL }, 'cleanup-test-data');
  return { projectId, firestore: getFirestore(app), database: getDatabase(app) };
}

const isZeroRow = (data: Data) => {
  const day = typeof data.dateKey === 'string' ? data.dateKey : '';
  return day >= ZERO_FROM && day <= ZERO_TO && (data.temperatureC === 0 || data.ph === 0);
};
const isEpochRow = (data: Data) => typeof data.recordedAtEpoch === 'number' && data.recordedAtEpoch < EPOCH_FLOOR;
const isNestedReading = (docPath: string) => /^aquariums\/[^/]+\/sensor_readings\/[^/]+\/readings\/[^/]+$/.test(docPath);

async function collectTargets(services: Awaited<ReturnType<typeof connect>>) {
  const { firestore, database } = services;
  const targets = new Map<string, Target>();
  const addDoc = (docPath: string, data: Data, reason: string) => {
    if (!targets.has(`doc:${docPath}`)) targets.set(`doc:${docPath}`, { kind: 'doc', path: docPath, reason, data });
  };

  // 1 + 2: readings, flat and nested.
  const flatZero = await firestore.collection('sensor_readings').where('dateKey', '>=', ZERO_FROM).where('dateKey', '<=', ZERO_TO).get();
  for (const doc of flatZero.docs) if (isZeroRow(doc.data())) addDoc(doc.ref.path, doc.data(), 'May 2026 zero-value reading');
  const flatEpoch = await firestore.collection('sensor_readings').where('recordedAtEpoch', '<', EPOCH_FLOOR).get();
  for (const doc of flatEpoch.docs) addDoc(doc.ref.path, doc.data(), 'recordedAtEpoch before 2000 (millis() sent as time)');
  const nested = await firestore.collectionGroup('readings').get();
  for (const doc of nested.docs) {
    if (!isNestedReading(doc.ref.path)) continue;
    const data = doc.data() as Data;
    const dateKey = doc.ref.parent.parent?.id ?? '';
    if (isZeroRow({ ...data, dateKey: data.dateKey ?? dateKey })) addDoc(doc.ref.path, data, 'May 2026 zero-value reading (nested)');
    else if (isEpochRow(data)) addDoc(doc.ref.path, data, 'recordedAtEpoch before 2000 (nested)');
  }

  // 3: candidate tanks, deleted only when confirmed by id.
  const aquariums = await firestore.collection('aquariums').get();
  const candidates = aquariums.docs.filter((doc) => CANDIDATE_NAMES.includes(String(doc.get('name') ?? '').trim().toLowerCase()));
  for (const tankId of confirmedTanks) {
    if (!SAFE_ID.test(tankId)) throw new Error(`--confirmed-test-tank ${tankId} is not a valid aquarium id.`);
    const aquarium = aquariums.docs.find((doc) => doc.id === tankId);
    if (!aquarium) throw new Error(`--confirmed-test-tank ${tankId}: no such aquarium. Nothing was deleted.`);
    const reason = `confirmed test tank "${String(aquarium.get('name') ?? tankId)}"`;
    const walk = async (ref: ReturnType<typeof firestore.doc>) => {
      const snap = await ref.get();
      if (snap.exists) addDoc(ref.path, snap.data() as Data, reason);
      for (const sub of await ref.listCollections()) for (const child of await sub.listDocuments()) await walk(child);
    };
    await walk(aquarium.ref);
    const directory = await firestore.doc(`aquarium_directory/${tankId}`).get();
    if (directory.exists) addDoc(directory.ref.path, directory.data() as Data, reason);
    for (const [collection, field] of [['sensor_readings', 'aquariumId'], ['alert_records', 'aquarium_id'], ['recommendations', 'aquariumId'], ['maintenance_actions', 'aquariumId'], ['command_logs', 'aquariumId'], ['monitoring_reports', 'aquarium_id']] as const) {
      for (const doc of (await firestore.collection(collection).where(field, '==', tankId).get()).docs) addDoc(doc.ref.path, doc.data(), reason);
    }
    for (const node of [`devices/${tankId}`, `authorization/aquariums/${tankId}`]) {
      const value = (await database.ref(node).get()).val();
      if (value !== null) targets.set(`rtdb:${node}`, { kind: 'rtdb', path: node, reason, data: value });
    }
  }

  // 4: legacy "No Live Data" alerts (opt-in).
  if (includeLegacyAlerts) {
    for (const doc of (await firestore.collection('alert_records').get()).docs) {
      const data = doc.data();
      const label = `${String(data.type ?? '')} ${String(data.message ?? '')}`;
      if (data.dedupKey === undefined && /no live data/i.test(label)) addDoc(doc.ref.path, data, 'legacy "No Live Data" alert');
    }
  }
  return { targets: [...targets.values()], candidates: candidates.map((doc) => ({ id: doc.id, name: String(doc.get('name')) })) };
}

async function main() {
  const services = await connect();
  const { targets, candidates } = await collectTargets(services);
  for (const candidate of candidates) {
    const confirmed = confirmedTanks.includes(candidate.id);
    console.log(`  ${confirmed ? '*' : '?'} candidate test tank "${candidate.name}" (${candidate.id})${confirmed ? ': confirmed, will be deleted' : ': NOT deleted; pass --confirmed-test-tank ' + candidate.id + ' once the team confirms it is a test tank'}`);
  }
  const byReason = new Map<string, number>();
  for (const target of targets) byReason.set(target.reason, (byReason.get(target.reason) ?? 0) + 1);
  console.log(`Cleanup plan: ${targets.length} item(s).`);
  for (const [reason, count] of byReason) console.log(`  - ${count} x ${reason}`);
  if (!apply) {
    console.log('Dry run (default): nothing was deleted. Add --apply to delete after a JSON backup.');
    return;
  }
  if (targets.length === 0) {
    console.log('Nothing to delete.');
    return;
  }
  if (project) {
    console.log(`About to DELETE ${targets.length} item(s) from the REAL project "${services.projectId}".`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the project id (${services.projectId}) to confirm: `);
    rl.close();
    if (answer.trim() !== services.projectId) {
      console.log('Not confirmed. Nothing was deleted.');
      process.exit(1);
    }
  }
  mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `cleanup-${services.projectId}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  // Firestore Timestamps serialize as {_seconds,_nanoseconds}; enough to restore by hand.
  writeFileSync(backupFile, `${JSON.stringify({ projectId: services.projectId, createdAt: new Date().toISOString(), items: targets }, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  console.log(`Backup written: ${path.relative(root, backupFile)}`);
  const docs = targets.filter((target): target is DocTarget => target.kind === 'doc').sort((a, b) => b.path.split('/').length - a.path.split('/').length);
  for (let index = 0; index < docs.length; index += 400) {
    const batch = services.firestore.batch();
    for (const target of docs.slice(index, index + 400)) batch.delete(services.firestore.doc(target.path));
    await batch.commit();
  }
  for (const target of targets) if (target.kind === 'rtdb') await services.database.ref(target.path).remove();
  console.log(`Deleted ${targets.length} item(s).`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
