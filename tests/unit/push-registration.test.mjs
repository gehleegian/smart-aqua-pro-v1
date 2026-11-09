import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/services/pushService.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
} }).outputText;

function harness({ active = true, configured = true } = {}) {
  const docs = new Map();
  const storage = new Map();
  const auth = { currentUser: { uid: 'owner-a' } };
  const calls = { token: 0, permission: 0, save: 0 };
  const worker = new EventTarget();
  worker.state = active ? 'activated' : 'installing';
  const registration = new EventTarget();
  Object.assign(registration, { active: active ? worker : null, installing: active ? null : worker, waiting: null });
  const notification = { permission: 'granted', requestPermission: async () => { calls.permission++; return notification.permission; } };
  const firestore = {
    doc: (_db, ...parts) => parts.join('/'),
    getDoc: async (path) => {
      if (calls.switchAccount) auth.currentUser = { uid: 'owner-b' };
      return { exists: () => docs.has(path), get: key => docs.get(path)?.[key] };
    },
    setDoc: async (path, data) => { calls.save++; if (calls.failSave) throw Error('permission-denied'); docs.set(path, data); },
    deleteDoc: async path => docs.delete(path),
  };
  const messaging = {
    getMessaging: () => ({}), isSupported: async () => true,
    getToken: async (_messaging, options) => {
      assert.equal(options.serviceWorkerRegistration.active?.state, 'activated', 'token requested before activation');
      calls.token++; return 'browser-token';
    },
    deleteToken: async () => {},
  };
  const loaded = { exports: {} };
  vm.runInNewContext(compiled, {
    module: loaded, exports: loaded.exports,
    require: name => ({ 'firebase/firestore': firestore, 'firebase/messaging': messaging,
      'firebase/app': { getApp: () => ({}) }, '../firebase': { auth, db: {} } })[name],
    process: { env: { NEXT_PUBLIC_FIREBASE_VAPID_KEY: configured ? 'public-vapid' : '' } },
    window: { Notification: notification }, Notification: notification,
    navigator: { userAgent: 'Chrome/ Windows', serviceWorker: {
      register: async () => registration, getRegistration: async () => registration,
    } },
    crypto: webcrypto, TextEncoder, setTimeout, clearTimeout,
    localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
  });
  return { api: loaded.exports, auth, calls, docs, registration, worker, notification, activate() {
    worker.state = 'activated'; registration.active = worker; registration.installing = null;
    worker.dispatchEvent(new Event('statechange'));
  } };
}

test('permission alone is not reported as a registered browser', async () => {
  const h = harness();
  assert.equal(await h.api.pushEnabledHere(), false);
  assert.equal(h.calls.save, 0);
  assert.equal(h.calls.permission, 0);
});

test('first registration waits for worker activation before subscribing', async () => {
  const h = harness({ active: false });
  const enabling = h.api.enablePush();
  await new Promise(setImmediate);
  assert.equal(h.calls.token, 0);
  h.activate();
  await enabling;
  assert.equal(h.calls.token, 1);
  assert.equal(await h.api.pushEnabledHere(), true);
  const [[path, data]] = h.docs;
  assert.match(path, /^users\/owner-a\/fcmTokens\/[a-f0-9]{40}$/);
  assert.equal(data.platform, 'web');
  assert.deepEqual(Object.keys(data).sort(), ['createdAt', 'lastSeenAt', 'platform', 'token', 'userAgent']);
});

test('already active worker registers immediately and preserves creation time on refresh', async () => {
  const h = harness();
  await h.api.enablePush();
  const [path, data] = [...h.docs][0];
  data.createdAt = 123;
  await h.api.refreshPushToken();
  assert.equal(h.docs.get(path).createdAt, 123);
  assert.equal(h.calls.permission, 1, 'refresh must not prompt');
});

test('turning alerts off deletes registration and prevents silent re-enabling', async () => {
  const h = harness();
  await h.api.enablePush();
  await h.api.disablePush();
  const count = h.calls.token;
  await h.api.refreshPushToken();
  assert.equal(h.docs.size, 0);
  assert.equal(h.calls.token, count);
  assert.equal(await h.api.pushEnabledHere(), false);
  await h.api.enablePush();
  assert.equal(await h.api.pushEnabledHere(), true);
});

test('missing VAPID and denied permissions never register a token', async () => {
  const missing = harness({ configured: false });
  await assert.rejects(missing.api.enablePush(), /not-configured/);
  assert.equal(await missing.api.pushEnabledHere(), false);
  const denied = harness(); denied.notification.permission = 'denied';
  await assert.rejects(denied.api.enablePush(), /denied/);
  assert.equal(denied.calls.token, 0);
});

test('failed Firestore save never becomes an enabled registration', async () => {
  const h = harness(); h.calls.failSave = true;
  await assert.rejects(h.api.enablePush(), /permission-denied/);
  assert.equal(await h.api.pushEnabledHere(), false);
});

test('concurrent startup refreshes share one SDK token request', async () => {
  const h = harness();
  await Promise.all([h.api.refreshPushToken(), h.api.refreshPushToken()]);
  assert.equal(h.calls.token, 1);
  assert.equal(h.docs.size, 1);
});

test('an account switch during registration does not write the token to either account', async () => {
  const h = harness(); h.calls.switchAccount = true;
  await assert.rejects(h.api.enablePush(), /Account changed/);
  assert.equal(h.docs.size, 0);
});
