import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Firestore and the RTDB of practice-smartaqua are in asia-southeast1, and 2nd-gen
// database triggers must run in their database's region (docs/migration-live.md §2).
const regionModule = new URL('../../functions/src/region.ts', import.meta.url);
const index = readFileSync(new URL('../../functions/src/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function regions(env) {
  const script = `import(${JSON.stringify(regionModule.href)}).then((m) => console.log(JSON.stringify(m)))`;
  const clean = { ...process.env };
  delete clean.FUNCTIONS_EMULATOR;
  return JSON.parse(execFileSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '-e', script], { env: { ...clean, ...env }, encoding: 'utf8' }));
}

test('deployed functions all run in asia-southeast1, RTDB triggers included', () => {
  assert.deepEqual(regions({}), { FUNCTIONS_REGION: 'asia-southeast1', RTDB_TRIGGER_REGION: 'asia-southeast1' });
});

test('only under the emulator do the RTDB triggers use us-central1 (the Database emulator only fires there)', () => {
  assert.deepEqual(regions({ FUNCTIONS_EMULATOR: 'true' }), { FUNCTIONS_REGION: 'asia-southeast1', RTDB_TRIGGER_REGION: 'us-central1' });
});

test('setGlobalOptions sets the region before any function is defined', () => {
  const global = index.indexOf('setGlobalOptions({ region: FUNCTIONS_REGION })');
  assert.ok(global > 0);
  assert.ok(global < index.indexOf('export const '), 'must run before the first export');
});

test('every RTDB trigger, and nothing else, overrides the region (with RTDB_TRIGGER_REGION)', () => {
  const rtdbTriggers = [...index.matchAll(/onValueWritten\(\n(.*)\n/g)].map((match) => match[1]);
  assert.equal(rtdbTriggers.length, 3);
  for (const options of rtdbTriggers) assert.match(options, /region: RTDB_TRIGGER_REGION/);
  assert.equal([...index.matchAll(/region:/g)].length, 4, 'setGlobalOptions plus the three RTDB triggers');
});
