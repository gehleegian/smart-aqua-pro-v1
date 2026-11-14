import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationUiHarness } from '../helpers/paginationUiHarness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(role = 'Admin') {
  const reads = [];
  const stops = [];
  const listeners = new Map();
  let authListener;
  const auth = { currentUser: { uid: 'admin' }, onAuthStateChanged(callback) {
    authListener = callback; return () => stops.push('auth');
  } };
  const listen = (path, callback, fail) => {
    reads.push(path); listeners.set(path, { callback, fail });
    return () => { stops.push(path); listeners.delete(path); };
  };
  const h = paginationUiHarness({ mocks: {
    '../firebase': { auth, db: {}, rtdb: {} },
    'firebase/firestore': { collection: (_db, path) => path, onSnapshot: listen },
    'firebase/database': { ref: (_db, path) => path, onValue: listen },
    './userService': { getCurrentUserProfile: async () => ({ role }) },
    './emailVerificationPolicyService': { assertCurrentEmailAccess: async () => {} },
  } });
  const { subscribeToDeviceInventory } = h.load(new URL('../../src/services/deviceInventoryService.ts', import.meta.url));
  const data = [], errors = [];
  const stop = subscribeToDeviceInventory(value => data.push(value), error => errors.push(error));
  const firestore = (path, rows) => listeners.get(path).callback({ docs: rows.map(([id, data]) => ({ id, data: () => data })) });
  const rtdb = (path, value) => listeners.get(path).callback({ val: () => value });
  return { auth, data, errors, reads, stops, listeners, stop, firestore, rtdb, session: user => authListener(user) };
}

test('non-admin and signed-out users never subscribe to protected inventory', async () => {
  const user = setup('User');
  await flush();
  assert.equal(user.errors.length, 1);
  assert.deepEqual(user.reads, []);
  const signedOut = setup(); signedOut.auth.currentUser = null;
  await flush();
  assert.equal(signedOut.errors.length, 1);
  assert.deepEqual(signedOut.reads, []);
});

test('unmount during async authorization prevents subscriptions', async () => {
  const h = setup(); h.stop(); await flush();
  assert.deepEqual(h.reads, []);
  assert.deepEqual(h.data, []);
});

test('inventory only reads metadata and bound telemetry; synchronizes and releases listeners', async () => {
  const h = setup(); await flush();
  h.firestore('device_registry', [
    ['one', { status: 'claimed', aquariumId: 'tank1', claimCodeHash: 'NEVER-EXPOSE' }],
    ['two', { state: 'unclaimed', aquariumId: 'reserved' }],
  ]);
  h.firestore('aquarium_directory', [['tank1', { name: 'Tank', ownerId: 'owner' }]]);
  h.firestore('users', [['owner', { full_name: 'Owner', email: 'owner@example.invalid', private: 'NEVER-EXPOSE' }]]);
  assert.equal(h.data.length, 1);
  assert.equal(h.data.at(-1).rows.length, 2);
  assert.equal(h.data.at(-1).rows[0].ownerName, 'Owner');
  h.rtdb('.info/connected', true);
  h.rtdb('.info/serverTimeOffset', 1234);
  h.rtdb('devices/tank1/telemetry', { online: true, updatedAt: Date.now(), phReadingValid: false, ph: 0 });
  assert.equal(h.data.at(-1).connected, true);
  assert.equal(h.data.at(-1).clockOffset, 1234);
  assert.deepEqual(h.data.at(-1).telemetry.tank1.sensorTypes, ['ph']);
  assert.doesNotMatch(JSON.stringify(h.data), /NEVER-EXPOSE/);
  assert.ok(!h.reads.some(path => /commands|control|history|reserved/.test(path)));
  const lateTelemetryCallback = h.listeners.get('devices/tank1/telemetry').callback;
  h.firestore('device_registry', [['two', { status: 'unclaimed' }]]);
  lateTelemetryCallback({ val: () => ({ online: true, updatedAt: Date.now() }) });
  assert.ok(h.stops.includes('devices/tank1/telemetry'));
  assert.deepEqual(h.data.at(-1).telemetry, {});
  h.stop();
  assert.equal(h.listeners.size, 0);
});

test('permission errors clear a device status and a session change closes inventory', async () => {
  const h = setup(); await flush();
  h.firestore('device_registry', [['one', { status: 'claimed', aquariumId: 'tank1' }]]);
  h.firestore('aquarium_directory', []); h.firestore('users', []);
  h.listeners.get('devices/tank1/telemetry').fail(new Error('permission denied'));
  assert.equal(h.data.at(-1).telemetry.tank1, null);
  assert.ok(h.data.at(-1).errors.tank1);
  h.session(null);
  assert.equal(h.errors.length, 1);
  assert.equal(h.listeners.size, 0);
});

test('a denied metadata subscription fails closed and releases all listeners', async () => {
  const h = setup(); await flush();
  h.listeners.get('device_registry').fail(new Error('Permission denied'));
  assert.equal(h.errors.length, 1);
  assert.equal(h.listeners.size, 0);
  assert.equal(h.data.length, 0);
});
