// Sprint 3 access model: RTDB isolation through the authorization mirror
// (emulator only). Run: npm run test:rtdb-org-rules
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set } from 'firebase/database';

const PROJECT_ID = 'demo-smartaqua-rtdb-org';
const TANK_1 = 'tank-1';
const TANK_2 = 'tank-2';
const TANK_S = 'tank-s';
const LIVE = 'TtNtMT5Ba100fS66GZHc';
const LIVE_DEVICE = 'esp32-SAQ-7K3M-9R2X';
const DATE = '2026-11-07';

// Exactly the live Aquarium 1 payload shape seen on 2026-11-06 (AUDIT.md §4.1).
const LIVE_TELEMETRY = {
  temperatureC: 26.5,
  temperatureReadingValid: true,
  waterLevelPercent: 15.7,
  waterPresent: true,
  ph: 8.12,
  tdsReadingValid: false,
  filterState: 'Active',
  equipmentStatus: 'Unknown',
  powerStatus: 'Unknown',
  online: true,
  updatedAt: 1794000000000,
};
const CONTROL = {
  mode: 'automation', automationEnabled: true, feedingTimes: ['08:00'], lightOnTime: '07:00', lightOffTime: '19:00',
  filtrationStartTime: '06:00', filtrationRuntimeHours: 12, manualLightState: 'Off', manualFilterState: 'Active', updatedAt: 1794000000000,
};
const command = (aquariumId, requestedBy) => ({
  aquariumId, commandId: `feed_now-${requestedBy}`, type: 'feed_now', requestedAt: 1794000000000, requestedBy, durationMs: 1500,
});

function fixture() {
  const device = (id) => ({
    telemetry: LIVE_TELEMETRY,
    control: CONTROL,
    commands: { latest: command(id, 'owner-a') },
    commandAck: { latest: { commandId: 'feed_now-owner-a', status: 'done', executedAt: 1794000000000 } },
    history: { [DATE]: { e1: { temperatureC: 26 } } },
  });
  return {
    authorization: {
      users: Object.fromEntries(
        ['owner-a', 'owner-b', 'owner-s', 'care-x', 'care-z', 'newbie', 'live-owner'].map((uid) => [uid, { role: 'User', emailVerificationRequired: true }])
          .concat([['admin-p', { role: 'Admin', emailVerificationRequired: true }]])
      ),
      aquariums: {
        [TANK_1]: { ownerUid: 'owner-a', orgId: 'org-owner-a', state: 'active', caretakerUids: { 'care-x': true }, deviceUids: { 'esp32-SAQ-AAAA-1111': true } },
        [TANK_2]: { ownerUid: 'owner-a', orgId: 'org-owner-a', state: 'active', deviceUids: { 'esp32-SAQ-BBBB-2222': true } },
        [TANK_S]: { ownerUid: 'owner-s', orgId: 'org-owner-s', state: 'suspended', caretakerUids: { 'care-x': true }, deviceUids: { 'esp32-SAQ-SSSS-0000': true } },
        // Live Aquarium 1 after migrate-orgs: the old fields are untouched, orgId added.
        [LIVE]: { ownerUid: 'live-owner', orgId: 'org-live-owner', state: 'active', deviceUids: { [LIVE_DEVICE]: true }, claimOperationId: 'device-claim-SAQ-7K3M-9R2X' },
      },
    },
    deviceBindings: { [LIVE_DEVICE]: LIVE, 'esp32-SAQ-AAAA-1111': TANK_1 },
    devices: { [TANK_1]: device(TANK_1), [TANK_2]: device(TANK_2), [TANK_S]: device(TANK_S), [LIVE]: device(LIVE) },
  };
}

let environment;
const human = (uid, claims = {}) =>
  environment.authenticatedContext(uid, { email: `${uid}@example.test`, email_verified: true, ...claims }).database();
const device = (uid) => environment.authenticatedContext(uid, { principalType: 'device', deviceId: uid.replace(/^esp32-/, '') }).database();

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { host: '127.0.0.1', port: 9000, rules: await readFile(new URL('../../database.rules.json', import.meta.url), 'utf8') },
  });
});
beforeEach(async () => {
  await environment.withSecurityRulesDisabled((ctx) => set(ref(ctx.database()), fixture()));
});
after(async () => {
  await environment.cleanup();
});

const READ_PATHS = (id) => [`devices/${id}/telemetry`, `devices/${id}/control`, `devices/${id}/commands/latest`, `devices/${id}/commandAck/latest`, `devices/${id}/history/${DATE}`];

async function readsAll(db, id) {
  for (const path of READ_PATHS(id)) await assertSucceeds(get(ref(db, path)));
}
async function readsNone(db, id) {
  for (const path of READ_PATHS(id)) await assertFails(get(ref(db, path)));
}

test('RORG-01 a caretaker on tank 1 reads telemetry and sends commands; is denied everything on tank 2', async () => {
  const db = human('care-x');
  await readsAll(db, TANK_1);
  await assertSucceeds(set(ref(db, `devices/${TANK_1}/commands/latest`), command(TANK_1, 'care-x')));
  await readsNone(db, TANK_2);
  await assertFails(set(ref(db, `devices/${TANK_2}/commands/latest`), command(TANK_2, 'care-x')));
  await assertFails(set(ref(db, `devices/${TANK_2}/control`), CONTROL));
});

test('RORG-02 a caretaker cannot write control or schedules; the owner can', async () => {
  await assertFails(set(ref(human('care-x'), `devices/${TANK_1}/control`), { ...CONTROL, feedingTimes: ['09:00'] }));
  await assertSucceeds(set(ref(human('owner-a'), `devices/${TANK_1}/control`), { ...CONTROL, feedingTimes: ['09:00'] }));
  await assertFails(set(ref(human('care-x'), `devices/${TANK_1}/commands/latest`), command(TANK_1, 'owner-a')), 'requestedBy must be the caller');
  await assertFails(set(ref(human('care-x'), `devices/${TANK_1}/telemetry`), LIVE_TELEMETRY), 'only the device writes telemetry');
});

test('RORG-03 the owner reads and commands every tank in the org', async () => {
  const db = human('owner-a');
  await readsAll(db, TANK_1);
  await readsAll(db, TANK_2);
  await assertSucceeds(set(ref(db, `devices/${TANK_2}/commands/latest`), command(TANK_2, 'owner-a')));
});

test('RORG-04 org B sees nothing of org A; an unassigned new user sees nothing', async () => {
  for (const uid of ['owner-b', 'newbie', 'care-z']) {
    const db = human(uid);
    for (const id of [TANK_1, TANK_2, LIVE]) await readsNone(db, id);
    await assertFails(set(ref(db, `devices/${TANK_1}/commands/latest`), command(TANK_1, uid)));
    await assertFails(get(ref(db, 'authorization')));
  }
});

test('RORG-05 removing a caretaker from the mirror ends RTDB access immediately', async () => {
  const db = human('care-x');
  await assertSucceeds(get(ref(db, `devices/${TANK_1}/telemetry`)));
  await environment.withSecurityRulesDisabled((ctx) => remove(ref(ctx.database(), `authorization/aquariums/${TANK_1}/caretakerUids/care-x`)));
  await readsNone(db, TANK_1);
  await assertFails(set(ref(db, `devices/${TANK_1}/commands/latest`), command(TANK_1, 'care-x')));
});

test('RORG-06 a suspended org is locked out for owner, caretaker and device', async () => {
  await readsNone(human('owner-s'), TANK_S);
  await readsNone(human('care-x'), TANK_S);
  await assertFails(set(ref(human('owner-s'), `devices/${TANK_S}/commands/latest`), command(TANK_S, 'owner-s')));
  await assertFails(set(ref(device('esp32-SAQ-SSSS-0000'), `devices/${TANK_S}/telemetry`), LIVE_TELEMETRY));
});

test('RORG-07 the platform admin reads (claim + Admin mirror) but cannot write', async () => {
  const admin = human('admin-p', { platformAdmin: true });
  await readsAll(admin, TANK_1);
  await readsAll(admin, TANK_S);
  await assertFails(set(ref(admin, `devices/${TANK_1}/commands/latest`), command(TANK_1, 'admin-p')));
  await assertFails(set(ref(admin, `devices/${TANK_1}/control`), CONTROL));
  await readsNone(human('admin-p'), TANK_1);
  await readsNone(human('owner-a', { platformAdmin: true }), TANK_2.replace('2', 'x'));
  await readsNone(human('owner-b', { platformAdmin: true }), TANK_1);
});

test('RORG-08 the migrated live Aquarium 1 accepts live-format telemetry from its device and its owner reads it', async () => {
  const deviceDb = device(LIVE_DEVICE);
  await assertSucceeds(set(ref(deviceDb, `devices/${LIVE}/telemetry`), { ...LIVE_TELEMETRY, updatedAt: 1794000007400 }));
  await assertSucceeds(get(ref(deviceDb, `deviceBindings/${LIVE_DEVICE}`)));
  await assertSucceeds(get(ref(deviceDb, `devices/${LIVE}/control`)));
  await assertSucceeds(get(ref(deviceDb, `devices/${LIVE}/commands/latest`)));
  await assertSucceeds(set(ref(deviceDb, `devices/${LIVE}/commandAck/latest`), { commandId: 'feed_now-owner-a', status: 'done', executedAt: serverTimestamp() }));
  await assertFails(set(ref(deviceDb, `devices/${TANK_1}/telemetry`), LIVE_TELEMETRY), 'the live device stays bound to Aquarium 1 only');
  await readsAll(human('live-owner'), LIVE);
  await assertSucceeds(set(ref(human('live-owner'), `devices/${LIVE}/commands/latest`), command(LIVE, 'live-owner')));
});
