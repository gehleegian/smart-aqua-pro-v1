// Sprint 5 hosting prep: the security headers keep the app's own origins
// (Firebase, FCM, the push service worker, App Check) working.
// Run: npm run test:security-headers
import assert from 'node:assert/strict';
import test from 'node:test';
import { contentSecurityPolicy, securityHeaders } from '../../security-headers.mjs';

const directive = (csp, name) => csp.split('; ').find((part) => part.startsWith(`${name} `) || part === name)?.split(' ').slice(1) ?? null;

test('HEADERS-01 production: framing denied, HSTS, nosniff, no eval, no localhost', () => {
  const headers = Object.fromEntries(securityHeaders().map(({ key, value }) => [key, value]));
  const csp = headers['Content-Security-Policy'];
  assert.deepEqual(directive(csp, 'frame-ancestors'), ["'none'"]);
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Strict-Transport-Security'], /^max-age=63072000; includeSubDomains/);
  assert.equal(headers['X-Content-Type-Options'], 'nosniff');
  assert.ok(!directive(csp, 'script-src').includes("'unsafe-eval'"));
  assert.ok(!csp.includes('127.0.0.1') && !csp.includes('localhost'));
  assert.deepEqual(directive(csp, 'object-src'), ["'none'"]);
  assert.ok(directive(csp, 'upgrade-insecure-requests'));
});

test('HEADERS-02 Firebase, FCM, the service worker and App Check stay allowed', () => {
  const csp = contentSecurityPolicy();
  const connect = directive(csp, 'connect-src');
  // Auth, Firestore, Storage, Installations, FCM registrations, App Check all live on googleapis.com.
  for (const origin of ['https://*.googleapis.com', 'https://*.cloudfunctions.net', 'https://*.firebaseio.com', 'wss://*.firebaseio.com', 'https://*.firebasedatabase.app', 'wss://*.firebasedatabase.app']) {
    assert.ok(connect.includes(origin), `connect-src has ${origin}`);
  }
  assert.deepEqual(directive(csp, 'worker-src'), ["'self'"], '/firebase-messaging-sw.js is same-origin');
  assert.ok(directive(csp, 'script-src').includes('https://www.google.com'), 'reCAPTCHA Enterprise for App Check');
  assert.ok(directive(csp, 'frame-src').includes('https://www.google.com'));
  assert.ok(directive(csp, 'img-src').includes('data:'), 'the MFA QR code is a data: URL');
  assert.match(securityHeaders().find(({ key }) => key === 'Permissions-Policy').value, /camera=\(self\)/, 'QR scanner');
});

test('HEADERS-03 dev + emulators: eval for the dev server and the local emulator ports', () => {
  const csp = contentSecurityPolicy({ dev: true, emulators: true });
  assert.ok(directive(csp, 'script-src').includes("'unsafe-eval'"));
  assert.ok(directive(csp, 'connect-src').includes('http://127.0.0.1:*'));
  assert.ok(directive(csp, 'connect-src').includes('ws://127.0.0.1:*'));
  assert.deepEqual(directive(csp, 'frame-ancestors'), ["'none'"], 'framing is denied everywhere');
});

test('HEADERS-04 RTDB long-poll scripts and disconnect frames are allowed without broad script access', () => {
  for (const options of [{}, { dev: true, emulators: true }]) {
    const csp = contentSecurityPolicy(options);
    for (const name of ['script-src', 'frame-src', 'connect-src']) {
      const sources = directive(csp, name);
      for (const origin of ['https://*.firebaseio.com', 'https://*.firebasedatabase.app']) {
        assert.ok(sources.includes(origin), `${name} permits RTDB fallback ${origin}`);
      }
      assert.ok(!sources.includes('*') && !sources.includes('https:'), `${name} remains host-restricted`);
    }
    const scripts = directive(csp, 'script-src');
    assert.ok(!scripts.includes('https://*.googleapis.com'));
    assert.ok(!scripts.includes('https://*.cloudfunctions.net'));
    assert.deepEqual(directive(csp, 'frame-ancestors'), ["'none'"]);
  }
});
