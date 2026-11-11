// Isolated SDK metadata reads only: no live project, commands or sensor data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

for (const [name, root] of [
  ['web', new URL('../../', import.meta.url)],
  ['mobile', new URL('../../../smart-aqua-mobile/', import.meta.url)],
]) {
  test(`${name} command clock reads SDK metadata without a server get or hanging offline`, () => {
    // Separate processes exercise each app's installed Firebase SDK version.
    const script = `
      import assert from 'node:assert/strict';
      import { initializeApp, deleteApp } from 'firebase/app';
      import { getDatabase, connectDatabaseEmulator, goOffline } from 'firebase/database';
      import { readServerClockOffset } from './src/utils/firebaseServerClock.ts';
      const app = initializeApp({ projectId: 'demo-command-clock',
        databaseURL: 'https://demo-command-clock-default-rtdb.firebaseio.com' });
      const database = getDatabase(app);
      connectDatabaseEmulator(database, '127.0.0.1', 1);
      goOffline(database);
      try {
        assert.equal(await readServerClockOffset(database), 0);
        // A second one-shot read must also complete after listener cleanup.
        assert.equal(await readServerClockOffset(database), 0);
      } finally { await deleteApp(app); }
    `;
    const result = spawnSync(process.execPath,
      ['--experimental-strip-types', '--input-type=module', '--eval', script],
      { cwd: fileURLToPath(root), encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });
}

test('both command senders use the same metadata helper after authorization', () => {
  const helperPath = '../../src/utils/firebaseServerClock.ts';
  const helper = readFileSync(new URL(helperPath, import.meta.url), 'utf8');
  const mobile = readFileSync(new URL('../../../smart-aqua-mobile/src/utils/firebaseServerClock.ts', import.meta.url), 'utf8');
  assert.equal(helper.replaceAll('\r\n', '\n'), mobile.replaceAll('\r\n', '\n'));
  assert.match(helper, /onValue\(ref\(database, '\.info'\)/);
  assert.match(helper, /onlyOnce: true/);
  assert.match(helper, /Number\.isFinite\(offset\)/);
  for (const path of ['../../src/services/deviceService.ts', '../../../smart-aqua-mobile/src/services/firebase-service.ts']) {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /get\(ref\([^\n]*['"]\.info/);
    assert.match(source, /await (?:assertRealtimeDeviceAccess|requireAquariumAccess)[\s\S]*?const clockOffset = await readServerClockOffset\(/);
    assert.match(source, /requestedAt: Math.round\(Date.now\(\) \+ clockOffset\)|const requestedAt = Math.round\(Date.now\(\) \+ clockOffset\)/);
    assert.match(source, /now: \(\) => Date.now\(\) \+ clockOffset/);
  }
});
