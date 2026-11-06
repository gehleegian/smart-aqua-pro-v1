// Read-only, narrowly scoped diagnostics. Never print credentials or owner IDs.
import { readFile } from 'node:fs/promises';
import { initializeApp, cert, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getDatabase } from 'firebase-admin/database';
let app;
try {
  const aquariumNumber = process.argv.includes('--aquarium2') ? 2 : 1;
  const manifest = JSON.parse(await readFile(`C:/Users/marin/firebase-private/aquarium${aquariumNumber}-registration.json`, 'utf8'));
  const deviceId = manifest.deviceId;
  const deviceUid = manifest.deviceUid;
  if (manifest.projectId !== 'practice-smartaqua' || !/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(deviceId) ||
      deviceUid !== `esp32-${deviceId}`) throw new Error('MANIFEST_MISMATCH');
  const key = JSON.parse(await readFile('C:/Users/marin/firebase-private/aquarium-setup-key.json', 'utf8'));
  if (key.project_id !== 'practice-smartaqua') throw new Error('PROJECT_MISMATCH');
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('EMULATOR_ENV');
  app = initializeApp({ credential: cert(key), databaseURL: 'https://practice-smartaqua-default-rtdb.asia-southeast1.firebasedatabase.app' });
  const registry = (await getFirestore(app).doc(`device_registry/${deviceId}`).get()).data();
  if (!registry?.aquariumId) throw new Error('NO_REGISTRY');
  const db = getDatabase(app);
  const [grant, control, command, telemetry] = await Promise.all([
    `authorization/aquariums/${registry.aquariumId}`, ...['control','commands/latest','telemetry'].map(p => `devices/${registry.aquariumId}/${p}`),
  ].map(async p => (await db.ref(p).get()).val()));
  const age = value => typeof value === 'number' ? Math.round((Date.now()-value)/1000) : null;
  console.log(JSON.stringify({ deviceId, registryState: registry.state, grantState: grant?.state,
    deviceGranted: grant?.deviceUids?.[deviceUid] === true,
    control: control ? { mode: control.mode, automationEnabled: control.automationEnabled,
      lightOnTime: control.lightOnTime, lightOffTime: control.lightOffTime,
      feedingTimes: control.feedingTimes, filtrationStartTime: control.filtrationStartTime,
      filtrationRuntimeHours: control.filtrationRuntimeHours } : null,
    latestCommand: command ? { type: command.type, state: command.state, ageSeconds: age(command.requestedAt),
      aquariumMatches: command.aquariumId === registry.aquariumId, requesterPresent: !!command.requestedBy } : null,
    telemetry: telemetry ? { ageSeconds: age(telemetry.updatedAt), online: telemetry.online,
      lightState: telemetry.lightState, filterState: telemetry.filterState,
      temperatureC: telemetry.temperatureC, waterLevelPercent: telemetry.waterLevelPercent,
      ph: telemetry.ph, turbidityState: telemetry.turbidityState,
      tdsReadingValid: telemetry.tdsReadingValid, powerStatus: telemetry.powerStatus } : null,
  }, null, 2));
} catch { console.error('Diagnostic unavailable; no credentials printed.'); process.exitCode = 1; }
finally { if (app) await deleteApp(app); }
