# Deploying the web app (prep only: nothing is deployed)

**Status:** configuration only. No deploy has been run from this branch. The go-live order is `docs/migration-live.md` (the app is step 4 / 7e).

## Option A (recommended): Vercel

`vercel.json` holds the build settings:
- framework `nextjs`, `npm ci`, `npm run build`;
- region `sin1` (Singapore), the closest Vercel region to Davao;
- no-cache on `/firebase-messaging-sw.js`, so a service worker update reaches users.

1. Import the GitHub repository in Vercel. Set the **Production Branch** to the branch you release from.
2. Add the environment variables below for **Production** (and Preview, if you use previews). Names only: the values come from the Firebase console (Project settings → General → Your apps → Web app config). Every `NEXT_PUBLIC_*` value is public client configuration by design. Still, do not paste values into chats or issues.
3. Add the Vercel domain (and any custom domain) to Firebase Auth → Settings → **Authorized domains**, and to the App Check reCAPTCHA Enterprise key's allowed domains.
4. Deploy. Then run the checks at the bottom.

**Previews:** a preview build talks to the same Firebase project as production unless you give it a different project's variables. Do not give previews production admin credentials (there are none in this app; see "Never set").

## Option B (alternative): Firebase Hosting with the Next.js framework integration

`firebase experiments:enable webframeworks`, then add a `hosting` block with `"source": "."` and `"frameworksBackend": { "region": "asia-southeast1" }` to `firebase.json`. The server-rendered parts then run as a Cloud Function (Blaze is already required). Keeping one vendor is the advantage. The integration is still marked experimental; it is not configured here. The security headers come from `next.config.mjs` either way.

## Environment variables (names only)

### Required

| Name | What |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Web app config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Web app config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `practice-smartaqua` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Default bucket (report PDFs/CSVs, Sprint 5) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Web app config (FCM) |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Web app config |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | Realtime Database URL |

### Optional / feature switches

| Name | What | Default when unset |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID` | Analytics ID (the app does not start Analytics) | — |
| `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` | Callable region | `us-central1` (the functions' default region) |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` | reCAPTCHA Enterprise key for App Check | App Check off |
| `NEXT_PUBLIC_FIREBASE_VAPID_KEY` | Web push public key (`docs/migration-live.md` 7f) | "Turn on alerts" says push is not configured |
| `NEXT_PUBLIC_MFA_TOTP_ENABLED` | `true` after Identity Platform + TOTP are enabled (`migration-live.md` §8) | MFA hidden, not enforced |

### Never set in a deployed build

| Name | Why |
|---|---|
| `NEXT_PUBLIC_USE_FIREBASE_EMULATORS` | Points the app at `127.0.0.1` emulators |
| `NEXT_PUBLIC_MFA_TOTP_MOCK` | Emulator-only MFA mock (code `123456`). It also needs the emulator flag, but keep both unset |
| `NEXT_DIST_DIR` | Demo build folder only |
| `SMARTAQUA_DEVICE_CLAIMING_ENABLED`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_DATABASE_URL`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, `GOOGLE_APPLICATION_CREDENTIALS` | Gian's superseded `/api/devices/claim` route (`docs/merge-pr8-notes.md`). It would create aquariums without an organization, and it puts an Admin SDK key on the web host |
| `VITE_*` | Old Vite names; only mapped for local `.env` files |

Functions parameters and secrets (`CLAIM_CODE_PEPPER`, `SMARTAQUA_SUPPORT_EMAIL`, `REQUIRE_PLATFORM_ADMIN_MFA`) belong to Cloud Functions, not to the web host.

## Security headers (`security-headers.mjs`, applied in `next.config.mjs`)

| Header | Value |
|---|---|
| `Content-Security-Policy` | `default-src 'self'`. `connect-src` allows Firebase (`*.googleapis.com`, `*.cloudfunctions.net`, `*.firebaseio.com`/`*.firebasedatabase.app` over https and wss). `worker-src 'self'` for the push service worker. App Check reCAPTCHA in `script-src`/`frame-src`. Also `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'` and `upgrade-insecure-requests` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` |
| `X-Frame-Options` | `DENY` (older browsers; CSP `frame-ancestors` is the real control) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera for this site only (QR scanner); microphone, geolocation, payment and USB off |
| `Cross-Origin-Opener-Policy` | `same-origin-allow-popups` (report files open in a new tab) |

**Accepted risks:**
- `script-src 'unsafe-inline'`: Next.js injects inline bootstrap scripts. Removing it needs a nonce middleware (a later hardening step).
- `style-src 'unsafe-inline'`: React `style` attributes, such as the report condition bar.

`npm run test:security-headers` checks that the policy keeps Firebase, FCM, the service worker and App Check allowed. The Playwright smoke tests run the dev server under the same policy (plus `'unsafe-eval'` and the emulator ports, dev only) and fail on any CSP violation in the reports flow.

## Checks after a deploy

1. `curl -sI https://<domain>/ | grep -iE 'content-security-policy|strict-transport|x-frame'` shows the headers.
2. Sign in. Dashboard live readings update: RTDB over wss works under the CSP.
3. Settings → Turn on alerts: the service worker registers, and a test alert arrives (`docs/notifications.md` §6).
4. Reports → generate → PDF opens: the callable and Storage work.
5. Add device → the camera opens for the QR scanner.
6. Browser console: no "Refused to connect" or "Content Security Policy" errors.
