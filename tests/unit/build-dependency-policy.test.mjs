// Build/dependency regression checks only. No credentials, Firebase app or network.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const readJson = path => JSON.parse(readFileSync(new URL(path, root), 'utf8'));
const manifest = readJson('package.json');
const lock = readJson('package-lock.json');
const vercel = readJson('vercel.json');

test('web builds use the tested Node 22 major without suppressing runtime warnings', () => {
  assert.equal(manifest.engines.node, '22.x');
  assert.equal(lock.packages[''].engines.node, manifest.engines.node);
  const { dev, build, start } = manifest.scripts;
  assert.doesNotMatch(JSON.stringify({ scripts: { dev, build, start }, vercel }), /--no-warnings|NODE_NO_WARNINGS|--loglevel[= ]silent/);
});

test('Vercel removes only the unsupported cache-dir environment option before invoking npm', () => {
  for (const command of [vercel.installCommand, vercel.buildCommand]) {
    const args = command.split(' ');
    assert.equal(args[0], 'env');
    const removed = [];
    for (let index = 1; args[index] === '-u'; index += 2) removed.push(args[index + 1]);
    assert.deepEqual(removed, ['npm_config_cache_dir', 'NPM_CONFIG_CACHE_DIR', 'npm_config_cache-dir', 'NPM_CONFIG_CACHE-DIR']);
    assert.ok(!removed.includes('npm_config_cache'), 'valid npm cache configuration is preserved');
    assert.doesNotMatch(command, /--force|--no-audit|--audit=false/);
  }
  assert.ok(vercel.installCommand.endsWith('npm ci --ignore-scripts'));
  assert.ok(vercel.buildCommand.endsWith('npm run build'));
});

test('every locked dependency install script is reviewed and explicitly denied', () => {
  assert.deepEqual(manifest.allowScripts, { '@firebase/util': false, protobufjs: false });
  const scripted = Object.entries(lock.packages).filter(([, item]) => item.hasInstallScript);
  assert.ok(scripted.length > 0);
  for (const [path, item] of scripted) {
    const name = item.name ?? path.split('node_modules/').at(-1);
    assert.equal(manifest.allowScripts[name], false, `${name}@${item.version} needs a build-policy review`);
  }
});

test('deprecated glob/rimraf chain and vulnerable minimatch versions stay out of the web lockfile', () => {
  for (const [path, item] of Object.entries(lock.packages)) {
    assert.doesNotMatch(path, /(^|\/)node_modules\/(glob|rimraf)$/);
    if (/(^|\/)node_modules\/minimatch$/.test(path)) {
      const [major, minor, patch] = item.version.split('.').map(Number);
      assert.ok(major < 7 || major > 11 || (major === 11 && (minor > 0 || patch >= 1)), `${path}@${item.version} is affected by GHSA-g3hv-75wg-m249`);
    }
  }
});

test('the narrowly scoped ESLint minimatch override keeps the matcher API used by tooling', async () => {
  const fromParser = createRequire(new URL('node_modules/@typescript-eslint/typescript-estree/package.json', root));
  const matcher = fromParser('minimatch');
  const installed = fromParser('minimatch/package.json').version;
  assert.equal(installed, manifest.overrides['@typescript-eslint/typescript-estree'].minimatch);
  const pattern = new matcher.Minimatch('src/{views,hooks}/**/*.{ts,tsx}', { dot: true });
  assert.equal(pattern.match('src/views/Reports.tsx'), true);
  assert.equal(pattern.match('src/hooks/useDataLogsController.ts'), true);
  assert.equal(pattern.match('functions/src/index.ts'), false);
  const parser = await import('@typescript-eslint/typescript-estree');
  assert.equal(parser.parse('export const View = () => <div>Ready</div>;', { jsx: true }).type, 'Program');
});

test('Firebase Admin server entry points and protobuf still load without dependency install scripts', async () => {
  for (const [entry, method] of [
    ['app', 'initializeApp'], ['auth', 'getAuth'], ['database', 'getDatabase'],
    ['firestore', 'getFirestore'], ['storage', 'getStorage'],
  ]) {
    assert.equal(typeof (await import(`firebase-admin/${entry}`))[method], 'function');
  }
  const { default: protobuf } = await import('protobufjs');
  const schema = protobuf.parse('syntax = "proto3"; message BuildCheck { string label = 1; }').root.lookupType('BuildCheck');
  const bytes = schema.encode({ label: 'dependency check ✓' }).finish();
  assert.equal(schema.decode(bytes).label, 'dependency check ✓');
});
