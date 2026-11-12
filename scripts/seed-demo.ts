// Demo data for the Emulator Suite: EMULATOR ONLY. It refuses a real project.
//
//   npm run demo                      # starts emulators, runs this, starts Next.js (docs/demo.md)
//   node --experimental-strip-types scripts/seed-demo.ts   # emulators already running
//
// It goes through the same paths as production wherever one exists:
//   - rules + species: scripts/seed/goldfish-draft.json (DRAFT values, as seed-rules.ts)
//   - devices: scripts/provision-device.ts (registry, device accounts, labels)
//   - claims, invites, acceptance: the real callables in the Functions emulator
//   - the setup wizard's profile write: a signed-in owner under the Firestore rules
//   - telemetry history: the real ingest pipeline (functions/lib telemetryIngest),
//     run with each reading's own time, so history, alerts and recommendations
//     come from the rules engine, not from hand-written documents.
//
// The telemetry itself is DEMO DATA requested for the Sprint 4 demo (AGENTS.md
// §22): deterministic values, labelled demoSeed in RTDB, never real readings.
// Demo passwords are emulator-only and printed on purpose.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { demoReading } from './demo-readings.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const adminApp = requireFromFunctions('firebase-admin/app');
const adminAuthModule = requireFromFunctions('firebase-admin/auth');
const adminFirestoreModule = requireFromFunctions('firebase-admin/firestore');
const adminDatabaseModule = requireFromFunctions('firebase-admin/database');
const clientApp = requireFromRoot('firebase/app');
const clientAuth = requireFromRoot('firebase/auth');
const clientFirestore = requireFromRoot('firebase/firestore');
const clientFunctions = requireFromRoot('firebase/functions');

const args = process.argv.slice(2);
if (args.includes('--project')) {
  console.error('seed-demo is emulator-only and takes no --project. Nothing was written.');
  process.exit(1);
}
export const PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-smartaqua';
if (!PROJECT_ID.startsWith('demo-')) {
  // demo-* project ids cannot reach any real Firebase resource.
  console.error(`Refusing project "${PROJECT_ID}": the demo seed only runs on a demo-* emulator project.`);
  process.exit(1);
}
process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
// The default RTDB instance, the one the functions' triggers watch (docs/demo.md).
const DATABASE_NS = `${PROJECT_ID}-default-rtdb`;
const DATABASE_URL = `http://127.0.0.1:9000?ns=${DATABASE_NS}`;
const OUT_DIR = path.join(root, 'provisioning-output', PROJECT_ID);
const SUMMARY_FILE = path.join(OUT_DIR, 'demo-accounts.json');
const HISTORY_HOURS = 4;
const HISTORY_STEP_MS = 5 * 60_000;

export const DEMO_PASSWORD = 'SmartAqua-Demo-2026!';
const ACCOUNTS = {
  ownerA: { email: 'owner-a@demo.smartaqua.test', name: 'Ana Owner (Davao Pet Shop)' },
  caretakerX: { email: 'caretaker-x@demo.smartaqua.test', name: 'Xian Caretaker' },
  ownerB: { email: 'owner-b@demo.smartaqua.test', name: 'Ben Owner' },
  admin: { email: 'admin@demo.smartaqua.test', name: 'Platform Admin' },
} as const;

type Account = { email: string; name: string; uid: string; role: string };

function assertEmulatorsUp() {
  return Promise.all(['127.0.0.1:9099', '127.0.0.1:8080', '127.0.0.1:9000', '127.0.0.1:5001'].map(async (host) => {
    try {
      await fetch(`http://${host}/`);
    } catch {
      throw new Error(`No emulator at ${host}. Start them first (npm run demo does this).`);
    }
  }));
}

async function resetEmulators() {
  await fetch(`http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`, { method: 'DELETE' });
  await fetch(`http://127.0.0.1:9000/.json?ns=${DATABASE_NS}`, { method: 'PUT', body: 'null', headers: { Authorization: 'Bearer owner' } });
}

async function waitFor<T>(check: () => Promise<T>, label: string, timeoutMs = 30_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await check();
    if (value) return value;
    if (Date.now() - start > timeoutMs) throw new Error(`Timed out waiting for ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

async function main() {
  await assertEmulatorsUp();
  await resetEmulators();

  const app = adminApp.initializeApp({ projectId: PROJECT_ID, databaseURL: DATABASE_URL }, 'seed-demo');
  const auth = adminAuthModule.getAuth(app);
  const firestore = adminFirestoreModule.getFirestore(app);
  const database = adminDatabaseModule.getDatabase(app);

  // 1. Rules and species (DRAFT seed).
  const seed = JSON.parse(readFileSync(path.join(root, 'scripts/seed/goldfish-draft.json'), 'utf8'));
  const batch = firestore.batch();
  for (const [id, data] of Object.entries(seed.species)) batch.set(firestore.doc(`species/${id}`), data);
  for (const [id, data] of Object.entries(seed.rules)) batch.set(firestore.doc(`rules/${id}`), data);
  // Playwright only (demo.mjs --e2e-fixture-approvals): draft rules never fire,
  // so the recommendation flow needs one approved rule. This is an emulator test
  // fixture, labelled as such; it is not an adviser approval and never reaches
  // the live project (PROJECT_ID must be demo-*).
  const fixtureApprovals = process.env.SMARTAQUA_E2E_FIXTURE_APPROVALS === 'true';
  if (fixtureApprovals) {
    const approval = { status: 'approved', source: 'E2E TEST FIXTURE - not an adviser approval', approvedBy: 'e2e-fixture', approvedAt: Date.now() };
    batch.set(firestore.doc('species/goldfish'), approval, { merge: true });
    for (const id of ['temp_high_critical', 'temp_high_warning']) batch.set(firestore.doc(`rules/${id}`), approval, { merge: true });
  }
  await batch.commit();
  console.log(`Seeded ${Object.keys(seed.species).length} species and ${Object.keys(seed.rules).length} rules (DRAFT${fixtureApprovals ? '; e2e fixture approvals applied' : ''}).`);

  // 2. Devices: 3 to claim below plus 2 spare, unclaimed ones for "Add device".
  mkdirSync(OUT_DIR, { recursive: true });
  const output = execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/provision-device.ts', '--count', '5', '--out', OUT_DIR], {
    cwd: root, env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID }, encoding: 'utf8',
  });
  const deviceIds = [...output.matchAll(/Provisioned (SAQ-[A-Z0-9]{4}-[A-Z0-9]{4})/g)].map((match) => match[1]);
  const claims = deviceIds.map((deviceId) => JSON.parse(readFileSync(path.join(OUT_DIR, deviceId, 'claim.json'), 'utf8')) as { deviceId: string; claimCode: string; uri: string });
  console.log(`Provisioned ${claims.length} devices (labels in provisioning-output/${PROJECT_ID}/).`);

  // 3. Accounts: created verified (stands in for the email link), profile as the sign-up page writes it.
  const accounts = {} as Record<keyof typeof ACCOUNTS, Account>;
  for (const [key, spec] of Object.entries(ACCOUNTS) as Array<[keyof typeof ACCOUNTS, (typeof ACCOUNTS)[keyof typeof ACCOUNTS]]>) {
    const user = await auth.createUser({ email: spec.email, password: DEMO_PASSWORD, emailVerified: true, displayName: spec.name });
    const role = key === 'admin' ? 'Admin' : 'User';
    const now = new Date().toISOString();
    await firestore.doc(`users/${user.uid}`).set({
      full_name: spec.name, name: spec.name, email: spec.email, contact_number: '', role, account_status: 'active',
      created_at: now, updated_at: now, createdAt: now, updatedAt: now,
    });
    if (role === 'Admin') await auth.setCustomUserClaims(user.uid, { platformAdmin: true });
    accounts[key] = { email: spec.email, name: spec.name, uid: user.uid, role: key === 'admin' ? 'Platform Admin' : key === 'caretakerX' ? 'Caretaker' : 'Owner' };
  }
  for (const account of Object.values(accounts)) {
    await waitFor(async () => (await database.ref(`authorization/users/${account.uid}/role`).get()).val(), `user mirror for ${account.email}`);
  }

  // 4. Claims through the callables, the wizard's profile write under the rules.
  const clients: Array<{ app: unknown }> = [];
  const signIn = async (account: Account) => {
    const instance = clientApp.initializeApp({ apiKey: 'demo-key', projectId: PROJECT_ID, authDomain: 'localhost', databaseURL: DATABASE_URL }, `seed-${account.uid}`);
    const authClient = clientAuth.getAuth(instance);
    clientAuth.connectAuthEmulator(authClient, 'http://127.0.0.1:9099', { disableWarnings: true });
    const db = clientFirestore.getFirestore(instance);
    clientFirestore.connectFirestoreEmulator(db, '127.0.0.1', 8080);
    const fns = clientFunctions.getFunctions(instance, 'asia-southeast1');
    clientFunctions.connectFunctionsEmulator(fns, '127.0.0.1', 5001);
    await clientAuth.signInWithEmailAndPassword(authClient, account.email, DEMO_PASSWORD);
    clients.push({ app: instance });
    return {
      db,
      call: async (name: string, data: unknown) => (await clientFunctions.httpsCallable(fns, name)(data)).data as Record<string, unknown>,
    };
  };
  const finishWizard = async (owner: Awaited<ReturnType<typeof signIn>>, aquariumId: string, profile: { name: string; lengthCm: number; widthCm: number; heightCm: number; fishWeightsG: number[] }) => {
    const aquarium = (await firestore.doc(`aquariums/${aquariumId}`).get()).data();
    const tankSizeLiters = Math.round((profile.lengthCm * profile.widthCm * profile.heightCm) / 1000);
    const working = Math.round(tankSizeLiters * 0.85);
    const updatedAt = new Date().toISOString();
    const fields = {
      name: profile.name, species: ['Goldfish'], tankLengthCm: profile.lengthCm, tankWidthCm: profile.widthCm, tankHeightCm: profile.heightCm,
      tankSizeLiters, workingWaterVolumeLiters: working, hasFiltrationSystem: true, filtrationSetup: 'Hang-on-back', filterCapacity: '400',
      fishCount: profile.fishWeightsG.length, fishWeightsG: profile.fishWeightsG, status: 'active', updatedAt, directorySchemaVersion: 3,
    };
    const write = clientFirestore.writeBatch(owner.db);
    write.update(clientFirestore.doc(owner.db, 'aquariums', aquariumId), fields);
    write.set(clientFirestore.doc(owner.db, 'aquarium_directory', aquariumId), {
      name: profile.name, ownerId: aquarium.ownerId, ownerName: aquarium.ownerName, species: ['Goldfish'], fishCount: fields.fishCount,
      tankType: 'Freshwater', tankSizeLiters, tankLengthCm: profile.lengthCm, tankWidthCm: profile.widthCm, tankHeightCm: profile.heightCm,
      workingWaterVolumeLiters: working, hasFiltrationSystem: true, filtrationSetup: 'Hang-on-back', createdAt: aquarium.createdAt, updatedAt, schemaVersion: 3,
    });
    await write.commit();
  };

  const ownerA = await signIn(accounts.ownerA);
  const tank1 = await ownerA.call('claimDevice', { deviceId: claims[0].deviceId, claimCode: claims[0].claimCode, aquariumName: 'Front Counter Tank', orgName: 'Davao Pet Shop' });
  await finishWizard(ownerA, String(tank1.aquariumId), { name: 'Front Counter Tank', lengthCm: 60, widthCm: 30, heightCm: 35, fishWeightsG: [40, 55] });
  const tank2 = await ownerA.call('claimDevice', { deviceId: claims[1].deviceId, claimCode: claims[1].claimCode, aquariumName: 'Display Tank B' });
  await finishWizard(ownerA, String(tank2.aquariumId), { name: 'Display Tank B', lengthCm: 45, widthCm: 25, heightCm: 30, fishWeightsG: [35] });

  const ownerB = await signIn(accounts.ownerB);
  const tankB = await ownerB.call('claimDevice', { deviceId: claims[2].deviceId, claimCode: claims[2].claimCode, aquariumName: 'Home Tank' });
  await finishWizard(ownerB, String(tankB.aquariumId), { name: 'Home Tank', lengthCm: 40, widthCm: 25, heightCm: 30, fishWeightsG: [30] });

  // 5. Caretaker X: invited for tank 1 only, accepts.
  const invite = await ownerA.call('createInvite', { orgId: tank1.orgId, email: accounts.caretakerX.email, aquariumIds: [tank1.aquariumId] });
  const caretaker = await signIn(accounts.caretakerX);
  await caretaker.call('acceptInvite', { token: String(invite.path).slice('/invite/'.length) });
  console.log('Claimed 3 tanks (2 for Davao Pet Shop, 1 for Ben Owner); Caretaker X accepted an invite for tank 1.');

  // 6. Telemetry history through the real ingest pipeline, oldest first.
  const ingestModule = await import(pathToFileURL(path.join(root, 'functions/lib/src/telemetryIngest.js')).href);
  const end = Date.now() - 60_000;
  const start = end - HISTORY_HOURS * 60 * 60_000;
  const tanks: Array<[string, 'normal' | 'abnormal']> = [[String(tank1.aquariumId), 'normal'], [String(tank2.aquariumId), 'abnormal'], [String(tankB.aquariumId), 'normal']];
  let ingested = 0;
  for (const [aquariumId, kind] of tanks) {
    for (let t = start; t <= end; t += HISTORY_STEP_MS) {
      const result = await ingestModule.ingestTelemetry({ firestore, now: () => t + 1_000 }, aquariumId, demoReading(kind, t, end));
      if (result.ingested) ingested += 1;
    }
  }
  console.log(`Ingested ${ingested} demo readings (${HISTORY_HOURS} h, every 5 min) through the rules engine.`);

  // 7. One current reading per tank in RTDB, so the dashboard has a latest value.
  //    It goes stale after 60 s like a real device that stops (device_offline).
  const now = Date.now();
  for (const [aquariumId, kind] of tanks) {
    await database.ref(`devices/${aquariumId}/telemetry`).set({ ...demoReading(kind, now, end), updatedAt: now, demoSeed: true });
  }

  const summary = {
    projectId: PROJECT_ID,
    password: DEMO_PASSWORD,
    accounts,
    orgs: { davaoPetShop: tank1.orgId, ownerB: tankB.orgId },
    tanks: { tank1: tank1.aquariumId, tank2: tank2.aquariumId, tankB: tankB.aquariumId },
    devices: { tank1: claims[0].deviceId, tank2: claims[1].deviceId, tankB: claims[2].deviceId },
    kinds: { tank1: 'normal', tank2: 'abnormal', tankB: 'normal' },
    historyEnd: end,
    spareDevices: claims.slice(3),
  };
  writeFileSync(SUMMARY_FILE, `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });

  console.log('\nDemo accounts (emulator only), password for all:', DEMO_PASSWORD);
  console.table(Object.values(accounts).map(({ email, name, role }) => ({ role, email, name })));
  console.log('Unclaimed devices for "Add device" (ID / claim code):');
  for (const claim of summary.spareDevices) console.log(`  ${claim.deviceId}  ${claim.claimCode}   (QR: provisioning-output/${PROJECT_ID}/${claim.deviceId}/qr.png)`);
  console.log(`Summary: ${path.relative(root, SUMMARY_FILE)}`);

  for (const handle of clients) await clientApp.deleteApp(handle.app);
  await adminApp.deleteApp(app);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
