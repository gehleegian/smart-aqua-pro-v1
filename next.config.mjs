import { securityHeaders } from './security-headers.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Keeps `next dev` from appending its own block to the project's AGENTS.md.
  agentRules: false,
  poweredByHeader: false,
  // Sprint 5: CSP, HSTS, frame-ancestors and friends on every route
  // (security-headers.mjs). The dev server also gets them, so the Playwright
  // smoke tests run under the same policy.
  async headers() {
    return [{
      source: '/:path*',
      headers: securityHeaders({
        dev: process.env.NODE_ENV !== 'production',
        emulators: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true',
      }),
    }];
  },
  // npm run demo builds into its own folder so it never mixes with a real build.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // No dev-tools badge in demo screenshots.
  ...(process.env.NEXT_DIST_DIR ? { devIndicators: false } : {}),
  // The repository's ignored local .env may still use the Vite-era names.
  // Firebase web config is public client configuration, so map those values
  // into Next's explicitly exposed NEXT_PUBLIC names for local development.
  env: {
    NEXT_PUBLIC_FIREBASE_API_KEY:
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? process.env.VITE_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN:
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? process.env.VITE_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_DATABASE_URL:
      process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? process.env.VITE_FIREBASE_DATABASE_URL,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? process.env.VITE_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET:
      process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? process.env.VITE_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID:
      process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? process.env.VITE_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID:
      process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? process.env.VITE_FIREBASE_MEASUREMENT_ID,
  },
};

export default nextConfig;
