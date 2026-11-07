// scripts/cleanup-test-data.ts on a fixture shaped like contract §7 (emulator only).
// Run: npm run test:cleanup
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { after, before } from 'node:test';

const root = process.cwd();
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp, deleteApp } = requireFromFunctions('firebase-admin/app');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const PROJECT_ID = 'demo-smartaqua-cleanup';
const BACKUPS = path.join(root, 'backups', PROJECT_ID);
const LIVE = 'TtNtMT5Ba100fS66GZHc';
const BOYTO = 'boytoTankId';
const HALWAN = 'halwanTankId';
let app;
let firestore;
let database;

const run = (...flags) => execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/cleanup-test-data.ts', '--backup-dir', BACKUPS, ...flags], {
  cwd: root, env: { ...process.env, GCLOUD_PROJECT: PROJECT_ID }, encoding: 'utf8',
});
const exists = async (docPath) => (await firestore.doc(docPath).get()).exists;

before(async () => {
  rmSync(BACKUPS, { recursive: true, force: true });
  app = initializeApp({ projectId: PROJECT_ID, databaseURL: `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${PROJECT_ID}-default-rtdb` }, 'cleanup-test');
  firestore = getFirestore(app);
  database = getDatabase(app);
  const set = (docPath, data) => firestore.doc(docPath).set(data);
  await set(`aquariums/${LIVE}`, { name: 'Aquarium 1', ownerId: 'live-owner' });
  await set(`aquariums/${BOYTO}`, { name: 'Boyto', ownerId: 'tester' });
  await set(`aquariums/${HALWAN}`, { name: 'Halwan', ownerId: 'tester' });
  await set(`aquarium_directory/${BOYTO}`, { name: 'Boyto' });
  // May zero rows (flat + nested), a good May row, the 1997 row, a good live row.
  await set('sensor_readings/zero-1', { aquariumId: BOYTO, dateKey: '2026-05-20', temperatureC: 0, ph: 0, waterLevelPercent: 0 });
  await set('sensor_readings/zero-2', { aquariumId: BOYTO, dateKey: '2026-05-29', temperatureC: 24.5, ph: 0 });
  await set('sensor_readings/may-good', { aquariumId: BOYTO, dateKey: '2026-05-20', temperatureC: 24.5, ph: 7.1 });
  await set('sensor_readings/june-zero', { aquariumId: BOYTO, dateKey: '2026-06-02', temperatureC: 0, ph: 0 });
  await set('sensor_readings/epoch-1997', { aquariumId: BOYTO, dateKey: '2026-05-16', recordedAt: '2026-05-16T22:23:36', recordedAtEpoch: 853755456, temperatureC: 25, ph: 7 });
  await set(`sensor_readings/${LIVE}_2026-11-07_1`, { aquariumId: LIVE, dateKey: '2026-11-07', recordedAtEpoch: 1794022800000, temperatureC: 26.5, ph: 7.2 });
  await set(`aquariums/${BOYTO}/sensor_readings/2026-05-20`, { aquariumId: BOYTO, dateKey: '2026-05-20' });
  await set(`aquariums/${BOYTO}/sensor_readings/2026-05-20/readings/10-00-00`, { temperatureC: 0, ph: 0 });
  await set(`aquariums/${BOYTO}/sensor_readings/2026-05-20/readings/10-05-00`, { temperatureC: 24, ph: 7, recordedAtEpoch: 1779242700000 });
  await set(`aquariums/${BOYTO}/sensor_readings/2026-05-16/readings/22-23-36`, { temperatureC: 25, ph: 7, recordedAtEpoch: 853755456 });
  await set('alert_records/legacy-1', { aquarium_id: BOYTO, type: 'No Live Data', severity: 'warning', triggered_at: 1 });
  await set('alert_records/current-1', { aquarium_id: LIVE, type: 'No Live Data', dedupKey: `${LIVE}:device`, severity: 'warning' });
  await set('recommendations/boyto-rec', { aquariumId: BOYTO, status: 'pending' });
  await database.ref().set({
    devices: { [BOYTO]: { telemetry: { ph: 0, updatedAt: 1780000000000 } }, [LIVE]: { telemetry: { ph: 7.2, updatedAt: 1794022800000 } } },
    authorization: { aquariums: { [BOYTO]: { ownerUid: 'tester', state: 'active' }, [LIVE]: { ownerUid: 'live-owner', state: 'active' } } },
  });
});

after(async () => {
  rmSync(BACKUPS, { recursive: true, force: true });
  await deleteApp(app);
});

test('CLEANUP-01 dry run by default: plan only, candidates listed but not targeted, nothing deleted', async () => {
  const output = run();
  assert.match(output, /\? candidate test tank "Boyto" \(boytoTankId\): NOT deleted/);
  assert.match(output, /\? candidate test tank "Halwan" \(halwanTankId\): NOT deleted/);
  assert.match(output, /Cleanup plan: 5 item\(s\)/);
  assert.match(output, /2 x May 2026 zero-value reading\n/);
  assert.match(output, /1 x May 2026 zero-value reading \(nested\)/);
  assert.match(output, /Dry run \(default\): nothing was deleted/);
  assert.ok(await exists('sensor_readings/zero-1'));
});

test('CLEANUP-02 --apply deletes only the §7 rows, after a complete JSON backup; tanks stay without confirmation', async () => {
  const output = run('--apply');
  assert.match(output, /Deleted 5 item\(s\)/);
  for (const gone of ['sensor_readings/zero-1', 'sensor_readings/zero-2', 'sensor_readings/epoch-1997', `aquariums/${BOYTO}/sensor_readings/2026-05-20/readings/10-00-00`, `aquariums/${BOYTO}/sensor_readings/2026-05-16/readings/22-23-36`]) {
    assert.equal(await exists(gone), false, `${gone} deleted`);
  }
  for (const kept of ['sensor_readings/may-good', 'sensor_readings/june-zero', `sensor_readings/${LIVE}_2026-11-07_1`, `aquariums/${BOYTO}/sensor_readings/2026-05-20/readings/10-05-00`, `aquariums/${BOYTO}`, `aquariums/${HALWAN}`, 'alert_records/legacy-1']) {
    assert.equal(await exists(kept), true, `${kept} kept`);
  }
  const [file] = readdirSync(BACKUPS);
  const backup = JSON.parse(readFileSync(path.join(BACKUPS, file), 'utf8'));
  assert.equal(backup.items.length, 5);
  assert.deepEqual(backup.items.find((item) => item.path === 'sensor_readings/epoch-1997').data.recordedAtEpoch, 853755456);
  assert.match(run('--apply'), /Nothing to delete/, 'idempotent');
});

test('CLEANUP-03 a confirmed test tank goes completely (docs, subcollections, RTDB); legacy alerts only when asked; the live tank is untouched', async () => {
  const output = run('--apply', '--confirmed-test-tank', BOYTO, '--include-legacy-alerts');
  assert.match(output, /\* candidate test tank "Boyto" \(boytoTankId\): confirmed, will be deleted/);
  for (const gone of [`aquariums/${BOYTO}`, `aquariums/${BOYTO}/sensor_readings/2026-05-20`, `aquariums/${BOYTO}/sensor_readings/2026-05-20/readings/10-05-00`, `aquarium_directory/${BOYTO}`, 'sensor_readings/may-good', 'sensor_readings/june-zero', 'alert_records/legacy-1', 'recommendations/boyto-rec']) {
    assert.equal(await exists(gone), false, `${gone} deleted`);
  }
  assert.equal((await database.ref(`devices/${BOYTO}`).get()).val(), null);
  assert.equal((await database.ref(`authorization/aquariums/${BOYTO}`).get()).val(), null);
  assert.equal(await exists(`aquariums/${HALWAN}`), true, 'Halwan not confirmed: kept');
  assert.equal(await exists(`aquariums/${LIVE}`), true);
  assert.equal(await exists(`sensor_readings/${LIVE}_2026-11-07_1`), true);
  assert.equal(await exists('alert_records/current-1'), true, 'a current (deduped) offline alert is not legacy');
  assert.equal((await database.ref(`devices/${LIVE}/telemetry/ph`).get()).val(), 7.2);
  assert.equal(readdirSync(BACKUPS).length, 2, 'each apply writes its own backup');
});

test('CLEANUP-04 an unknown --confirmed-test-tank id stops before deleting anything', async () => {
  assert.throws(() => run('--apply', '--confirmed-test-tank', 'no-such-tank'), /no such aquarium/);
  assert.equal(await exists(`aquariums/${HALWAN}`), true);
});
