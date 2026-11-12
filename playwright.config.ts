// Playwright smoke tests (Sprint 4 task 0) against the Emulator Suite ONLY.
// The web server is `npm run demo` on its own demo-* project and port: it
// starts the emulators, seeds them (scripts/seed-demo.ts) and runs Next.js.
//   npm run test:smoke
import { defineConfig } from '@playwright/test';

export const SMOKE_PROJECT = 'demo-smartaqua-smoke';
const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `node scripts/demo.mjs --port ${PORT} --project ${SMOKE_PROJECT} --no-live --mfa-mock --e2e-fixture-approvals`,
    url: `http://localhost:${PORT}`,
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: 'ignore',
    stderr: 'pipe',
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
  },
});
