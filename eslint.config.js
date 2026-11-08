import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['.next', '.next-demo', 'dist', 'next-env.d.ts', 'test-results', 'playwright-report', 'provisioning-output']),
  ...nextCoreWebVitals,
  ...nextTypescript,
])
