// npm run demo: start the Emulator Suite, seed it, start Next.js against it.
// EMULATOR ONLY: the project id must be demo-* (it cannot reach real Firebase).
//
//   npm run demo                                   # http://localhost:3000
//   node scripts/demo.mjs --port 3100 --project demo-smartaqua-ui   # Playwright
//   --no-live   do not run the demo devices (tanks then go offline after 60 s)
//   --mfa-mock  emulator-only TOTP mock (src/utils/mfaMock.ts; code 123456): the Auth emulator cannot run TOTP
//
// Ctrl+C stops everything. See docs/demo.md.
import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const projectId = flag('--project', 'demo-smartaqua');
const portFree = (candidate) => new Promise((resolve) => {
  const server = net.createServer().once('error', () => resolve(false)).once('listening', () => server.close(() => resolve(true)));
  server.listen(candidate);
});
let port = flag('--port', null);
if (port && !(await portFree(Number(port)))) {
  console.error(`Port ${port} is already in use. Pick another with --port.`);
  process.exit(1);
}
if (!port) {
  // Something else (another dev server) may already own 3000.
  let candidate = 3000;
  while (!(await portFree(candidate))) candidate += 1;
  port = String(candidate);
}
if (!projectId.startsWith('demo-')) {
  console.error(`Refusing "${projectId}": npm run demo only uses demo-* emulator projects.`);
  process.exit(1);
}

const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children.reverse()) {
    try { process.kill(-child.pid, 'SIGINT'); } catch { /* already gone */ }
  }
  setTimeout(() => process.exit(code), 4000).unref();
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

function run(command, commandArgs, env) {
  const child = spawn(command, commandArgs, { cwd: root, env: { ...process.env, ...env }, stdio: 'inherit', detached: true });
  children.push(child);
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`${command} ${commandArgs[0]} exited (${code}); stopping the demo.`);
      stop(code ?? 1);
    }
  });
  return child;
}

async function waitForFunctions() {
  // A callable answers 400/401 (not 404) once the functions are loaded.
  const url = `http://127.0.0.1:5001/${projectId}/us-central1/claimDevice`;
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"data":{}}' });
      if (response.status !== 404) return;
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The Functions emulator did not load the functions in 120 s.');
}

execFileSync('npm', ['run', 'build:functions'], { cwd: root, stdio: 'inherit' });
execFileSync('node', ['tests/helpers/ensureEmulatorPepper.mjs'], { cwd: root, stdio: 'inherit' });

// DATABASE_URL makes the functions' Admin SDK use the default RTDB instance,
// the same one the RTDB triggers watch and firebase.json's rules apply to.
run('firebase', ['emulators:start', '--only', 'auth,firestore,database,functions,storage', '--project', projectId], {
  DATABASE_URL: `https://${projectId}-default-rtdb.firebaseio.com`,
  FUNCTIONS_DISCOVERY_TIMEOUT: '60',
});
await waitForFunctions();
execFileSync('node', ['--experimental-strip-types', '--no-warnings', 'scripts/seed-demo.ts'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, GCLOUD_PROJECT: projectId },
});

if (!args.includes('--no-live')) {
  run('node', ['--experimental-strip-types', '--no-warnings', 'scripts/demo-device.ts'], { GCLOUD_PROJECT: projectId });
}

// process.env wins over .env.local in Next.js, so the live config is not used.
run('npx', ['next', 'dev', '--port', port], {
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: 'true',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: 'demo-key',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'localhost',
  NEXT_PUBLIC_FIREBASE_DATABASE_URL: `http://127.0.0.1:9000?ns=${projectId}-default-rtdb`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_APP_ID: '1:000000000000:web:demo',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: '',
  NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY: '',
  NEXT_PUBLIC_FIREBASE_VAPID_KEY: '',
  NEXT_PUBLIC_MFA_TOTP_MOCK: args.includes('--mfa-mock') ? 'true' : 'false',
  NEXT_DIST_DIR: '.next-demo',
});
console.log(`\nSmartAqua Pro demo: http://localhost:${port}  (accounts above; Ctrl+C stops everything)\n`);
