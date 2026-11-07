// Performance check (docs/testing-plan.md §4): reading -> dashboard <= 5 s,
// alert -> notification <= 10 s.
//
//   npm run demo                                                   # in another terminal (emulators + functions)
//   node --experimental-strip-types scripts/measure-latency.ts     # emulator (default): writes probe readings
//   node --experimental-strip-types scripts/measure-latency.ts --samples 20 --aquarium <id>
//
//   Live project, READ-ONLY (default): observes real telemetry and alerts for N minutes
//   node --experimental-strip-types scripts/measure-latency.ts --project <id> --database-url <url> --aquarium <id> --observe 10
//
//   Live project, WRITES TEST TELEMETRY to a demo device (fish-free Tank B only):
//   ... --project <id> --database-url <url> --aquarium <id> --write-telemetry
//   asks you to type the project id AND the aquarium id. The abnormal probe raises a
//   real alert, a recommendation and a push to that tank's owners and caretakers.
//
// What is measured (honestly, and nothing more):
//   reading -> dashboard: the time from a telemetry write until a client
//     subscribed to devices/{id}/telemetry (the dashboard's data path) receives it.
//     It does not include React rendering (a few ms) or the device's own send time.
//   alert -> notification: the time from the abnormal reading's write until the
//     notifyAlertRecord function hands the message to FCM (alert_records.notifiedAt).
//     Delivery to a phone after that cannot be timed by a script; time it by hand
//     with a stopwatch (docs/testing-plan.md §4.3).
// Probe readings carry no marker field (the RTDB rules allow none); each one has a
// unique updatedAt, and the probe restores the tank's previous telemetry at the end.
import { createRequire } from 'node:module';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

export const READING_TARGET_MS = 5_000;
export const ALERT_TARGET_MS = 10_000;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const project = flag('--project');
const databaseUrlFlag = flag('--database-url');
const samples = Number(flag('--samples') ?? 10);
const observeMinutes = flag('--observe') ? Number(flag('--observe')) : null;
const writeTelemetry = !project || args.includes('--write-telemetry');
const aquariumFlag = flag('--aquarium');

type Data = Record<string, unknown>;

export function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.ceil(q * sorted.length) - 1)];
  return sorted.length === 0
    ? null
    : { n: sorted.length, min: sorted[0], median: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] };
}

function report(label: string, values: number[], target: number) {
  const result = stats(values);
  if (!result) {
    console.log(`${label}: no samples`);
    return false;
  }
  const pass = result.p95 <= target;
  console.log(`${label}: n=${result.n} min=${result.min} ms median=${result.median} ms p95=${result.p95} ms max=${result.max} ms  target <= ${target} ms (p95): ${pass ? 'PASS' : 'FAIL'}`);
  return pass;
}

async function confirm(question: string, expected: string) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  if (answer.trim() !== expected) {
    console.log('Not confirmed. Nothing was written.');
    process.exit(1);
  }
}

async function connect() {
  if (project) {
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST) {
      console.error('Emulator host variables are set; unset them to target a real project.');
      process.exit(1);
    }
    if (!databaseUrlFlag || !aquariumFlag) {
      console.error('--project needs --database-url and --aquarium.');
      process.exit(1);
    }
    if (writeTelemetry) {
      console.log(`About to WRITE test telemetry to aquarium ${aquariumFlag} in the REAL project "${project}".`);
      console.log('Use this only on the fish-free demo tank: the abnormal probe raises a real alert, a recommendation and a push notification.');
      await confirm(`Type the project id (${project}) to confirm: `, project);
      await confirm(`Type the aquarium id (${aquariumFlag}) to confirm: `, aquariumFlag);
    } else {
      console.log(`Read-only: observing ${aquariumFlag} in "${project}" for ${observeMinutes ?? 10} minute(s).`);
    }
    const app = initializeApp({ projectId: project, databaseURL: databaseUrlFlag }, 'measure-latency');
    const listener = initializeApp({ projectId: project, databaseURL: databaseUrlFlag }, 'measure-latency-listener');
    return { firestore: getFirestore(app), database: getDatabase(app), listenerDatabase: getDatabase(listener) };
  }
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
  const projectId = process.env.GCLOUD_PROJECT || 'demo-smartaqua';
  if (!projectId.startsWith('demo-')) {
    console.error('Emulator mode only uses demo-* projects.');
    process.exit(1);
  }
  console.log(`Emulators, project "${projectId}". Start them with npm run demo (functions must be running).`);
  const databaseURL = `https://${projectId}-default-rtdb.firebaseio.com`;
  const app = initializeApp({ projectId, databaseURL }, 'measure-latency');
  // A second app = a second connection, standing in for the dashboard. With one
  // connection the SDK fires the listener locally before the server has the write.
  const listener = initializeApp({ projectId, databaseURL }, 'measure-latency-listener');
  return { firestore: getFirestore(app), database: getDatabase(app), listenerDatabase: getDatabase(listener) };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function pickAquarium(firestore: Awaited<ReturnType<typeof connect>>['firestore']) {
  if (aquariumFlag) return aquariumFlag;
  const tanks = await firestore.collection('aquariums').where('orgId', '!=', null).get();
  if (tanks.empty) throw new Error('No aquarium found: run npm run demo first, or pass --aquarium.');
  // An already-open temperature alert would be deduplicated: prefer a tank without one.
  const open = await firestore.collection('alert_records').where('parameter', '==', 'temperatureC').where('status', '==', 'active').get();
  const busy = new Set(open.docs.map((doc: { get: (field: string) => unknown }) => doc.get('aquarium_id')));
  return (tanks.docs.find((doc: { id: string }) => !busy.has(doc.id)) ?? tanks.docs[0]).id as string;
}

/** Waits for a value on a ref that satisfies a predicate; resolves with the local receive time. */
type Snapshot = { val: () => Data | null };
type ValueRef = { on: (event: 'value', listener: (snapshot: Snapshot) => void) => unknown; off: (event: 'value', listener: (snapshot: Snapshot) => void) => void };

function waitFor(ref: ValueRef, predicate: (value: Data | null) => boolean, timeoutMs: number) {
  return new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => { ref.off('value', listener); resolve(null); }, timeoutMs);
    const listener = (snapshot: Snapshot) => {
      if (predicate(snapshot.val())) {
        clearTimeout(timer);
        ref.off('value', listener);
        resolve(Date.now());
      }
    };
    ref.on('value', listener);
  });
}

async function probe(services: Awaited<ReturnType<typeof connect>>, aquariumId: string) {
  const { database, firestore, listenerDatabase } = services;
  const telemetryRef = database.ref(`devices/${aquariumId}/telemetry`);
  const listenRef = listenerDatabase.ref(`devices/${aquariumId}/telemetry`);
  await listenRef.get(); // connect the listener before timing
  const previous = (await telemetryRef.get()).val() as Data | null;
  if (!previous || typeof previous.temperatureC !== 'number') throw new Error(`devices/${aquariumId}/telemetry has no reading to base the probe on.`);
  const aquarium = (await firestore.doc(`aquariums/${aquariumId}`).get()).data() ?? {};
  const species = (await firestore.doc('species/goldfish').get()).data();
  const maxTemp = typeof aquarium.maxTemp === 'number' ? aquarium.maxTemp
    : typeof species?.ranges?.temperatureC?.max === 'number' ? species.ranges.temperatureC.max : 24;

  // 1. reading -> dashboard: the current values again, each with a fresh updatedAt.
  const readingLatencies: number[] = [];
  for (let index = 0; index < samples; index += 1) {
    const at = Date.now();
    const received = waitFor(listenRef, (value) => value?.updatedAt === at, 15_000);
    await telemetryRef.set({ ...previous, updatedAt: at });
    const receivedAt = await received;
    if (receivedAt !== null) readingLatencies.push(receivedAt - at);
    await sleep(1_000);
  }

  // 2. alert -> notification hand-off: one abnormal temperature reading.
  const alertLatencies: number[] = [];
  const abnormalAt = Date.now();
  const notified = new Promise<number | null>((resolve) => {
    const timer = setTimeout(() => { unsubscribe(); resolve(null); }, 30_000);
    const unsubscribe = firestore.collection('alert_records').where('aquarium_id', '==', aquariumId).onSnapshot((snapshot: { docs: { get: (field: string) => unknown }[] }) => {
      for (const doc of snapshot.docs) {
        const notifiedAt = doc.get('notifiedAt');
        const requested = doc.get('notifyRequestedAt');
        if (typeof requested === 'number' && requested >= abnormalAt - 1_000 && typeof doc.get('notifySkipped') === 'string') {
          console.log(`The notification was skipped: ${String(doc.get('notifySkipped'))}.`);
          clearTimeout(timer);
          unsubscribe();
          resolve(null);
          return;
        }
        if (typeof notifiedAt === 'number' && typeof requested === 'number' && requested >= abnormalAt - 1_000) {
          clearTimeout(timer);
          unsubscribe();
          resolve(notifiedAt);
          return;
        }
      }
    });
  });
  await telemetryRef.set({ ...previous, temperatureC: Number((maxTemp + 6).toFixed(2)), temperatureReadingValid: true, updatedAt: abnormalAt });
  const notifiedAt = await notified;
  if (notifiedAt !== null) alertLatencies.push(notifiedAt - abnormalAt);
  else console.log('No new alert notification within 30 s. An alert for this parameter may already be open (dedup/cooldown): resolve it and run again.');

  // Restore the tank's previous values (fresh timestamp so they count as current).
  await telemetryRef.set({ ...previous, updatedAt: Date.now() });
  return { readingLatencies, alertLatencies };
}

async function observe(services: Awaited<ReturnType<typeof connect>>, aquariumId: string, minutes: number) {
  const { listenerDatabase, firestore } = services;
  const readingLatencies: number[] = [];
  const alertLatencies: number[] = [];
  const telemetryRef = listenerDatabase.ref(`devices/${aquariumId}/telemetry`);
  let first = true;
  const onTelemetry = (snapshot: { val: () => Data | null }) => {
    const value = snapshot.val();
    if (first) { first = false; return; } // the current value, not a new reading
    if (typeof value?.updatedAt === 'number') readingLatencies.push(Date.now() - value.updatedAt);
  };
  telemetryRef.on('value', onTelemetry);
  const seen = new Set<string>();
  const start = Date.now();
  const unsubscribe = firestore.collection('alert_records').where('aquarium_id', '==', aquariumId).onSnapshot(async (snapshot: { docs: { id: string; get: (field: string) => unknown }[] }) => {
    for (const doc of snapshot.docs) {
      const notifiedAt = doc.get('notifiedAt');
      if (typeof notifiedAt !== 'number' || notifiedAt < start || seen.has(`${doc.id}:${notifiedAt}`)) continue;
      seen.add(`${doc.id}:${notifiedAt}`);
      const recommendationId = doc.get('recommendationId');
      const recommendation = typeof recommendationId === 'string' ? (await firestore.doc(`recommendations/${recommendationId}`).get()).data() : null;
      const readingAt = recommendation?.readingSnapshot?.updatedAt;
      if (typeof readingAt === 'number') alertLatencies.push(notifiedAt - readingAt);
    }
  });
  await sleep(minutes * 60_000);
  telemetryRef.off('value', onTelemetry);
  unsubscribe();
  console.log('Observed latencies use the device clock (updatedAt). Firmware stage 3a sets updatedAt to the server time; before that, clock skew is included.');
  return { readingLatencies, alertLatencies };
}

async function main() {
  const services = await connect();
  const aquariumId = await pickAquarium(services.firestore);
  console.log(`Aquarium ${aquariumId}.`);
  const result = observeMinutes !== null || !writeTelemetry
    ? await observe(services, aquariumId, observeMinutes ?? 10)
    : await probe(services, aquariumId);
  const readingOk = report('reading -> dashboard', result.readingLatencies, READING_TARGET_MS);
  const alertOk = report('alert -> notification hand-off (server)', result.alertLatencies, ALERT_TARGET_MS);
  console.log('Phone delivery after the hand-off: time it by hand (docs/testing-plan.md §4.3).');
  process.exitCode = readingOk && alertOk ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    () => process.exit(process.exitCode ?? 0),
    (error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
