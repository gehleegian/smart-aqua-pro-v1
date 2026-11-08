// Security headers for the Next.js app (Sprint 5 hosting prep).
// Used by next.config.mjs; unit-tested in tests/unit/security-headers.test.mjs.
//
// The Content-Security-Policy allows exactly what the app talks to:
//   - Firebase Auth, Firestore, Storage, Functions (callables), Installations,
//     FCM registration and App Check: *.googleapis.com and *.cloudfunctions.net
//   - Realtime Database: *.firebaseio.com and *.firebasedatabase.app (https + wss)
//   - App Check reCAPTCHA Enterprise: www.google.com / www.gstatic.com / recaptcha.net
//   - the push service worker (/firebase-messaging-sw.js) is same-origin: worker-src 'self'
//   - the QR scanner uses the camera (Permissions-Policy camera=(self))
// 'unsafe-inline' scripts are needed by Next.js's inline bootstrap without a
// nonce middleware; inline styles by React style attributes. Both are noted
// in docs/deploy.md as accepted risks.

const FIREBASE_HTTP = [
  'https://*.googleapis.com',
  'https://*.cloudfunctions.net',
  'https://*.firebaseio.com',
  'https://*.firebasedatabase.app',
];
const FIREBASE_WS = ['wss://*.firebaseio.com', 'wss://*.firebasedatabase.app'];
const RECAPTCHA = ['https://www.google.com', 'https://www.gstatic.com', 'https://www.recaptcha.net'];

/** @param {{ dev?: boolean, emulators?: boolean }} options */
export function contentSecurityPolicy({ dev = false, emulators = false } = {}) {
  const local = emulators || dev
    ? ['http://127.0.0.1:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'ws://localhost:*']
    : [];
  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), ...RECAPTCHA],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://*.googleapis.com'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", ...FIREBASE_HTTP, ...FIREBASE_WS, ...local],
    'frame-src': ['https://*.firebaseapp.com', ...RECAPTCHA],
    'worker-src': ["'self'"],
    'manifest-src': ["'self'"],
    'media-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
    'frame-ancestors': ["'none'"],
    ...(dev ? {} : { 'upgrade-insecure-requests': [] }),
  };
  return Object.entries(directives).map(([name, values]) => [name, ...values].join(' ')).join('; ');
}

/** @param {{ dev?: boolean, emulators?: boolean }} options */
export function securityHeaders(options = {}) {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(options) },
    // Two years, the preload-list minimum. Browsers ignore it on plain http (local dev).
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
  ];
}
