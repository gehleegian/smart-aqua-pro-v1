// DEMO DATA (emulator only): keeps the 3 seeded demo tanks "live" by writing
// the next deterministic demo reading every 15 s, signed in AS EACH DEVICE with
// the credentials provision-device generated, so the device RTDB rules apply.
// The ingest trigger then runs the real rules engine. Started by npm run demo
// (skip with --no-live). Never point this at a real project.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoReading } from './demo-readings.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { initializeApp } = requireFromRoot('firebase/app');
const { connectAuthEmulator, getAuth, signInWithEmailAndPassword } = requireFromRoot('firebase/auth');
const { connectDatabaseEmulator, getDatabase, ref, serverTimestamp, set } = requireFromRoot('firebase/database');

const summary = JSON.parse(readFileSync(path.join(root, 'provisioning-output', process.env.GCLOUD_PROJECT || 'demo-smartaqua', 'demo-accounts.json'), 'utf8'));
if (!String(summary.projectId).startsWith('demo-')) throw new Error('demo-device only runs on demo-* emulator projects.');
const INTERVAL_MS = 15_000;

const devices = await Promise.all(Object.entries(summary.devices as Record<string, string>).map(async ([tank, deviceId]) => {
  const header = readFileSync(path.join(root, 'firmware/secrets', `${deviceId}.h`), 'utf8');
  const value = (key: string) => new RegExp(`#define ${key} "([^"]+)"`).exec(header)![1];
  const app = initializeApp({ apiKey: 'demo-key', projectId: summary.projectId, databaseURL: `http://127.0.0.1:9000?ns=${summary.projectId}-default-rtdb` }, deviceId);
  const auth = getAuth(app);
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  const db = getDatabase(app);
  connectDatabaseEmulator(db, '127.0.0.1', 9000);
  await signInWithEmailAndPassword(auth, value('SMARTAQUA_DEVICE_EMAIL'), value('SMARTAQUA_DEVICE_PASSWORD'));
  return { tank, deviceId, aquariumId: summary.tanks[tank] as string, kind: summary.kinds[tank] as 'normal' | 'abnormal', db };
}));

async function tick() {
  for (const device of devices) {
    // New-firmware style: the RTDB server timestamp (docs/device-contract.md).
    const reading = { ...demoReading(device.kind, Date.now(), summary.historyEnd), updatedAt: serverTimestamp() };
    await set(ref(device.db, `devices/${device.aquariumId}/telemetry`), reading).catch((error: Error) => console.error(`demo device ${device.deviceId}: ${error.message}`));
  }
}
await tick();
setInterval(() => void tick(), INTERVAL_MS);
console.log(`Demo devices live: ${devices.map((device) => device.deviceId).join(', ')} (a reading every ${INTERVAL_MS / 1000} s).`);
