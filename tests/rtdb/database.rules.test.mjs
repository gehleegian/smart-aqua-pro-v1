import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, serverTimestamp, set, update } from 'firebase/database';

const PROJECT_ID = 'demo-smartaqua-rtdb-auth';
const AQUARIUM_A = 'aquarium-a';
const AQUARIUM_B = 'aquarium-b';
const HISTORY_DATE = '2026-10-17';

const TELEMETRY = Object.freeze({
  temperatureC: 25,
  temperatureReadingValid: true,
  waterLevelPercent: 82,
  waterPresent: true,
  tdsPpm: 180,
  tdsPercent: 74,
  tdsReadingValid: true,
  turbidity: 1,
  ammoniaPpm: 0,
  filterState: 'Active',
  equipmentStatus: 'Normal',
  powerStatus: 'Online',
  ph: 7,
  updatedAt: 1792224000000,
  online: true,
});

const CONTROL = Object.freeze({
  mode: 'automation',
  automationEnabled: true,
  feedingTimes: ['08:00', '18:00'],
  lightOnTime: '07:00',
  lightOffTime: '19:00',
  filtrationStartTime: '06:00',
  filtrationRuntimeHours: 12,
  manualLightState: 'Off',
  manualFilterState: 'Active',
  updatedAt: 1792224000000,
});

function commandFor(aquariumId, requestedBy, overrides = {}) {
  return Object.fromEntries(
    Object.entries({
      aquariumId,
      commandId: `feed_now-${aquariumId}`,
      type: 'feed_now',
      requestedAt: 1792224000000,
      requestedBy,
      durationMs: 1500,
      ...overrides,
    }).filter(([, value]) => value !== undefined)
  );
}

function baseFixture() {
  return {
    authorization: {
      users: {
        'user-a': { role: 'User', emailVerificationRequired: true },
        'user-b': { role: 'User', emailVerificationRequired: true },
        'admin-a': { role: 'Admin', emailVerificationRequired: true },
        'listed-human': { role: 'User', emailVerificationRequired: true },
      },
      aquariums: {
        [AQUARIUM_A]: {
          ownerUid: 'user-a',
          state: 'active',
          deviceUids: {
            'device-a': true,
            'listed-human': true,
          },
        },
        [AQUARIUM_B]: {
          ownerUid: 'user-b',
          state: 'active',
          deviceUids: { 'device-b': true },
        },
      },
    },
    deviceBindings: {
      'device-a': AQUARIUM_A,
      'device-b': AQUARIUM_B,
    },
    devices: {
      [AQUARIUM_A]: {
        telemetry: TELEMETRY,
        control: CONTROL,
        commands: { latest: commandFor(AQUARIUM_A, 'user-a') },
        history: {
          [HISTORY_DATE]: {
            entryA: {
              recordedAt: '2026-10-17T08:00:00.000Z',
              recordedAtEpoch: 1792224000000,
              temperatureC: 25,
              waterLevelPercent: 82,
            },
          },
        },
      },
      [AQUARIUM_B]: {
        telemetry: { ...TELEMETRY, temperatureC: 26 },
        control: { ...CONTROL, mode: 'manual', automationEnabled: false },
        commands: { latest: commandFor(AQUARIUM_B, 'user-b') },
        history: {
          [HISTORY_DATE]: {
            entryB: {
              recordedAt: '2026-10-17T08:00:00.000Z',
              recordedAtEpoch: 1792224000000,
              temperatureC: 26,
              waterLevelPercent: 80,
            },
          },
        },
      },
    },
  };
}

let testEnvironment;

function anonymousDatabase() {
  return testEnvironment.unauthenticatedContext().database();
}

function humanDatabase(uid, options = {}) {
  return testEnvironment
    .authenticatedContext(uid, {
      email: `${uid}@example.test`,
      email_verified: options.emailVerified ?? true,
      ...options.claims,
    })
    .database();
}

function deviceDatabase(uid) {
  return testEnvironment
    .authenticatedContext(uid, { principalType: 'device' })
    .database();
}

async function mutateFixture(path, value) {
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const target = ref(context.database(), path);
    if (value === null) {
      await remove(target);
    } else {
      await set(target, value);
    }
  });
}

before(async () => {
  const rules = await readFile(new URL('../../database.rules.json', import.meta.url), 'utf8');
  testEnvironment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: { rules },
  });
});

beforeEach(async () => {
  await testEnvironment.clearDatabase();
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    await set(ref(context.database()), baseFixture());
  });
});

after(async () => {
  await testEnvironment?.cleanup();
});

test('AUTH-01 unauthenticated access is denied', async () => {
  const database = anonymousDatabase();
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/telemetry`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
});

test('AUTH-02 clients cannot read or modify authorization projections', async () => {
  const databases = [
    humanDatabase('user-a'),
    humanDatabase('admin-a'),
    deviceDatabase('device-a'),
  ];

  for (const database of databases) {
    await assertFails(get(ref(database, 'authorization')));
    await assertFails(
      set(ref(database, `authorization/users/user-a/role`), 'Admin')
    );
  }
});

test('AUTH-03 unknown RTDB paths are denied', async () => {
  const database = humanDatabase('user-a');
  await assertFails(get(ref(database, 'unknown')));
  await assertFails(set(ref(database, 'unknown/value'), true));
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/unknown`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/unknown`), true));
});

test('USER-01 User A reads only the permitted Aquarium A child paths', async () => {
  const database = humanDatabase('user-a');
  const paths = [
    `devices/${AQUARIUM_A}/telemetry`,
    `devices/${AQUARIUM_A}/control`,
    `devices/${AQUARIUM_A}/commands/latest`,
    `devices/${AQUARIUM_A}/history/${HISTORY_DATE}`,
  ];

  for (const path of paths) {
    await assertSucceeds(get(ref(database, path)));
  }
});

test('USER-02 User A cannot access Aquarium B', async () => {
  const database = humanDatabase('user-a');
  await assertFails(get(ref(database, `devices/${AQUARIUM_B}/telemetry`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_B}/control`), CONTROL));
});

test('USER-03 User B cannot access Aquarium A', async () => {
  const database = humanDatabase('user-b');
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/telemetry`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
});

test('USER-04 two sessions for the same authorized UID may read Aquarium A', async () => {
  const sessionOne = humanDatabase('user-a');
  const sessionTwo = humanDatabase('user-a');
  await Promise.all([
    assertSucceeds(get(ref(sessionOne, `devices/${AQUARIUM_A}/telemetry`))),
    assertSucceeds(get(ref(sessionTwo, `devices/${AQUARIUM_A}/telemetry`))),
  ]);
});

test('USER-05 an unverified owner is denied', async () => {
  const database = humanDatabase('user-a', { emailVerified: false });
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/telemetry`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
});

test('USER-05B an explicitly exempt legacy owner can read only Aquarium A', async () => {
  await mutateFixture(
    'authorization/users/user-a/emailVerificationRequired',
    false
  );
  const database = humanDatabase('user-a', { emailVerified: false });
  await assertSucceeds(get(ref(database, `devices/${AQUARIUM_A}/telemetry`)));
  await assertFails(get(ref(database, `devices/${AQUARIUM_B}/telemetry`)));
});

test('USER-05C two sessions for an exempt legacy owner remain authorized', async () => {
  await mutateFixture(
    'authorization/users/user-a/emailVerificationRequired',
    false
  );
  const first = humanDatabase('user-a', { emailVerified: false });
  const second = humanDatabase('user-a', { emailVerified: false });
  await Promise.all([
    assertSucceeds(get(ref(first, `devices/${AQUARIUM_A}/telemetry`))),
    assertSucceeds(get(ref(second, `devices/${AQUARIUM_A}/telemetry`))),
  ]);
});

test('USER-05D two sessions for a new unverified owner remain denied', async () => {
  const first = humanDatabase('user-a', { emailVerified: false });
  const second = humanDatabase('user-a', { emailVerified: false });
  await Promise.all([
    assertFails(get(ref(first, `devices/${AQUARIUM_A}/telemetry`))),
    assertFails(get(ref(second, `devices/${AQUARIUM_A}/telemetry`))),
  ]);
});

test('USER-05E missing verification policy fails closed for an unverified owner', async () => {
  await mutateFixture(
    'authorization/users/user-a/emailVerificationRequired',
    null
  );
  await assertFails(
    get(
      ref(
        humanDatabase('user-a', { emailVerified: false }),
        `devices/${AQUARIUM_A}/telemetry`
      )
    )
  );
});

test('USER-06 a human owner cannot write authoritative telemetry', async () => {
  const database = humanDatabase('user-a');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), TELEMETRY));
});

test('USER-07 a human owner cannot forge history', async () => {
  const database = humanDatabase('user-a');
  await assertFails(
    set(ref(database, `devices/${AQUARIUM_A}/history/${HISTORY_DATE}/forged`), {
      recordedAtEpoch: 1792224000001,
    })
  );
});

test('USER-08 valid web and mobile control profiles are allowed', async () => {
  const database = humanDatabase('user-a');
  const webProfile = { ...CONTROL };
  delete webProfile.lightOnTime;
  delete webProfile.lightOffTime;

  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/control`), webProfile));
  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
});

test('USER-08B only approved partial control updates preserve a valid profile', async () => {
  const database = humanDatabase('user-a');
  const controlPath = `devices/${AQUARIUM_A}/control`;

  await assertSucceeds(set(ref(database, `${controlPath}/mode`), 'manual'));
  await assertSucceeds(set(ref(database, `${controlPath}/manualLightState`), 'On'));
  await assertFails(remove(ref(database, `${controlPath}/mode`)));
  await assertFails(set(ref(database, `${controlPath}/unauthorizedRelay`), true));
});

test('USER-09 an unknown control field is denied', async () => {
  const database = humanDatabase('user-a');
  await assertFails(
    set(ref(database, `devices/${AQUARIUM_A}/control`), {
      ...CONTROL,
      unauthorizedRelay: true,
    })
  );
});

test('USER-10 invalid control values and types are denied', async () => {
  const database = humanDatabase('user-a');
  const path = ref(database, `devices/${AQUARIUM_A}/control`);
  const invalidProfiles = [
    { ...CONTROL, mode: 'predictive' },
    { ...CONTROL, manualLightState: 'Blink' },
    { ...CONTROL, filtrationStartTime: '25:00' },
    { ...CONTROL, filtrationRuntimeHours: 25 },
    { ...CONTROL, automationEnabled: 'yes' },
    { ...CONTROL, feedingTimes: [] },
  ];

  for (const profile of invalidProfiles) {
    await assertFails(set(path, profile));
  }
});

test('USER-11 deleting the control profile is denied', async () => {
  const database = humanDatabase('user-a');
  await assertFails(remove(ref(database, `devices/${AQUARIUM_A}/control`)));
});

test('CMD-01 valid feed_now and sync_control commands are allowed', async () => {
  const database = humanDatabase('user-a');
  const target = ref(database, `devices/${AQUARIUM_A}/commands/latest`);
  await assertSucceeds(set(target, commandFor(AQUARIUM_A, 'user-a')));
  await assertSucceeds(
    set(
      target,
      commandFor(AQUARIUM_A, 'user-a', {
        commandId: 'sync_control-a',
        type: 'sync_control',
        durationMs: undefined,
      })
    )
  );
});

test('CMD-02 valid filter and light commands are allowed', async () => {
  const database = humanDatabase('user-a');
  const target = ref(database, `devices/${AQUARIUM_A}/commands/latest`);
  await assertSucceeds(
    set(
      target,
      commandFor(AQUARIUM_A, 'user-a', {
        commandId: 'filter-a',
        type: 'set_filter_state',
        state: 'Inactive',
        durationMs: undefined,
      })
    )
  );
  await assertSucceeds(
    set(
      target,
      commandFor(AQUARIUM_A, 'user-a', {
        commandId: 'light-a',
        type: 'set_light_state',
        state: 'On',
        durationMs: undefined,
      })
    )
  );
});

test('CMD-03 a command aquarium ID must match its RTDB path', async () => {
  const database = humanDatabase('user-a');
  await assertFails(
    set(
      ref(database, `devices/${AQUARIUM_A}/commands/latest`),
      commandFor(AQUARIUM_B, 'user-a')
    )
  );
});

test('CMD-04 requestedBy must match the authenticated UID', async () => {
  const database = humanDatabase('user-a');
  await assertFails(
    set(
      ref(database, `devices/${AQUARIUM_A}/commands/latest`),
      commandFor(AQUARIUM_A, 'user-b')
    )
  );
});

test('CMD-05 unknown fields and invalid type-specific payloads are denied', async () => {
  const database = humanDatabase('user-a');
  const target = ref(database, `devices/${AQUARIUM_A}/commands/latest`);
  const invalidCommands = [
    { ...commandFor(AQUARIUM_A, 'user-a'), bypass: true },
    commandFor(AQUARIUM_A, 'user-a', { type: 'set_filter_state', state: 'On' }),
    commandFor(AQUARIUM_A, 'user-a', { type: 'set_light_state', state: 'Active' }),
    commandFor(AQUARIUM_A, 'user-a', { type: 'feed_now', durationMs: 0 }),
    commandFor(AQUARIUM_A, 'user-a', { type: 'unsupported' }),
  ];

  for (const command of invalidCommands) {
    await assertFails(set(target, command));
  }
});

test('CMD-06 deleting commands/latest is denied', async () => {
  const database = humanDatabase('user-a');
  await assertFails(remove(ref(database, `devices/${AQUARIUM_A}/commands/latest`)));
});

test('ADMIN-01 Admin cannot read any live RTDB device path', async () => {
  const database = humanDatabase('admin-a');
  const paths = [
    `devices/${AQUARIUM_A}/telemetry`,
    `devices/${AQUARIUM_A}/control`,
    `devices/${AQUARIUM_A}/commands/latest`,
    `devices/${AQUARIUM_A}/history/${HISTORY_DATE}`,
  ];

  for (const path of paths) {
    await assertFails(get(ref(database, path)));
  }
});

test('ADMIN-02 Admin cannot write any live RTDB device path', async () => {
  const database = humanDatabase('admin-a');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), TELEMETRY));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
  await assertFails(
    set(
      ref(database, `devices/${AQUARIUM_A}/commands/latest`),
      commandFor(AQUARIUM_A, 'admin-a')
    )
  );
  await assertFails(
    set(ref(database, `devices/${AQUARIUM_A}/history/${HISTORY_DATE}/admin`), true)
  );
});

test('DEVICE-01 assigned Device A can write schema-valid Aquarium A telemetry', async () => {
  const database = deviceDatabase('device-a');
  await assertSucceeds(
    set(ref(database, `devices/${AQUARIUM_A}/telemetry`), {
      ...TELEMETRY,
      waterQualityPercent: 74,
    })
  );
});

test('DEVICE-02 assigned Device A can read Aquarium A control and latest command', async () => {
  const database = deviceDatabase('device-a');
  await assertSucceeds(get(ref(database, `devices/${AQUARIUM_A}/control`)));
  await assertSucceeds(get(ref(database, `devices/${AQUARIUM_A}/commands/latest`)));
});

test('DEVICE-03 Device A cannot access Aquarium B', async () => {
  const database = deviceDatabase('device-a');
  await assertFails(get(ref(database, `devices/${AQUARIUM_B}/control`)));
  await assertFails(set(ref(database, `devices/${AQUARIUM_B}/telemetry`), TELEMETRY));
});

test('DEVICE-04 a device cannot write control or create a human command', async () => {
  const database = deviceDatabase('device-a');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/control`), CONTROL));
  await assertFails(
    set(
      ref(database, `devices/${AQUARIUM_A}/commands/latest`),
      commandFor(AQUARIUM_A, 'device-a')
    )
  );
});

test('DEVICE-05 a device cannot write history before protocol approval', async () => {
  const database = deviceDatabase('device-a');
  await assertFails(
    set(ref(database, `devices/${AQUARIUM_A}/history/${HISTORY_DATE}/device`), {
      recordedAtEpoch: 1792224000002,
    })
  );
});

test('DEVICE-06 a listed human without the device claim cannot write telemetry', async () => {
  const database = humanDatabase('listed-human');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), TELEMETRY));
});

test('DEVICE-07 an unassigned claimed device cannot write telemetry', async () => {
  const database = deviceDatabase('device-c');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), TELEMETRY));
});

test('DEVICE-08 unknown, incomplete, or mistyped telemetry is denied', async () => {
  const database = deviceDatabase('device-a');
  const target = ref(database, `devices/${AQUARIUM_A}/telemetry`);
  const missingTemperature = { ...TELEMETRY };
  delete missingTemperature.temperatureC;
  const invalidTelemetry = [
    { ...TELEMETRY, unsupportedSensor: 1 },
    { ...TELEMETRY, online: 'yes' },
    missingTemperature,
  ];

  for (const telemetry of invalidTelemetry) {
    await assertFails(set(target, telemetry));
  }
});

test('STATE-01 missing authorization denies access', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}`, null);
  const database = humanDatabase('user-a');
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/telemetry`)));
});

test('STATE-02 revoked authorization denies human and device access', async () => {
  await mutateFixture(
    'authorization/users/user-a/emailVerificationRequired',
    false
  );
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}/state`, 'revoked');
  await assertFails(
    get(
      ref(
        humanDatabase('user-a', { emailVerified: false }),
        `devices/${AQUARIUM_A}/telemetry`
      )
    )
  );
  await assertFails(
    set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/telemetry`), TELEMETRY)
  );
});

test('STATE-03 transitioning authorization denies human and device access', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}/state`, 'transitioning');
  await assertFails(
    get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/telemetry`))
  );
  await assertFails(
    get(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/control`))
  );
});

test('STATE-04 missing or Admin mirrored role denies human device-data access', async () => {
  await mutateFixture('authorization/users/user-a', null);
  await assertFails(
    get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/telemetry`))
  );

  await mutateFixture('authorization/users/user-a', { role: 'Admin' });
  await assertFails(
    get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/telemetry`))
  );
});

test('TRANSFER-01 transitioning denies both previous and proposed owners', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}`, {
    ownerUid: 'user-b',
    state: 'transitioning',
    deviceUids: { 'device-a': true },
  });
  await assertFails(
    get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/telemetry`))
  );
  await assertFails(
    get(ref(humanDatabase('user-b'), `devices/${AQUARIUM_A}/telemetry`))
  );
});

test('TRANSFER-02 activating a new owner revokes the previous owner', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}/ownerUid`, 'user-b');
  await assertFails(
    get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/telemetry`))
  );
});

test('TRANSFER-03 activating a new owner grants only that new owner', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}/ownerUid`, 'user-b');
  await assertSucceeds(
    get(ref(humanDatabase('user-b'), `devices/${AQUARIUM_A}/telemetry`))
  );
});

test('PARENT-01 through PARENT-04 parent reads cannot bypass child rules', async () => {
  const database = humanDatabase('user-a');
  await assertFails(get(ref(database, 'devices')));
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}`)));
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/history`)));
  await assertSucceeds(
    get(ref(database, `devices/${AQUARIUM_A}/history/${HISTORY_DATE}`))
  );
});

test('PARENT-05 parent and multi-location writes cannot bypass child rules', async () => {
  const database = humanDatabase('user-a');
  await assertFails(
    update(ref(database, `devices/${AQUARIUM_A}`), {
      control: CONTROL,
      telemetry: TELEMETRY,
    })
  );
  await assertFails(
    update(ref(database), {
      [`devices/${AQUARIUM_A}/control`]: CONTROL,
      [`authorization/users/user-a/role`]: 'Admin',
    })
  );
});


// --- Sprint 1: device contract additions (docs/device-contract.md) ---

// Exact shape the current live firmware sends for Aquarium 1 (2026-11-06).
const LIVE_FIRMWARE_TELEMETRY = Object.freeze({
  equipmentStatus: 'Unknown',
  filterState: 'Inactive',
  online: true,
  ph: 8.116076,
  powerStatus: 'Unknown',
  tdsReadingValid: false,
  temperatureC: 26.5,
  temperatureReadingValid: true,
  updatedAt: 1793978486622,
  waterLevelPercent: 15.72354,
  waterPresent: true,
});

function ackFor(commandId, overrides = {}) {
  return Object.fromEntries(
    Object.entries({ commandId, status: 'done', executedAt: serverTimestamp(), ...overrides })
      .filter(([, value]) => value !== undefined)
  );
}

const COMMAND_A_ID = `feed_now-${AQUARIUM_A}`;

test('CONTRACT-01 the current live firmware telemetry payload remains valid', async () => {
  const database = deviceDatabase('device-a');
  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), LIVE_FIRMWARE_TELEMETRY));
});

test('CONTRACT-02 telemetry accepts the new validity flags and a server-timestamp updatedAt', async () => {
  const database = deviceDatabase('device-a');
  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), {
    ...TELEMETRY,
    phReadingValid: true,
    turbidityReadingValid: false,
    updatedAt: serverTimestamp(),
  }));
});

test('CONTRACT-03 validity flags must be booleans, and other devices cannot write them', async () => {
  const database = deviceDatabase('device-a');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), { ...TELEMETRY, phReadingValid: 'yes' }));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/telemetry`), { ...TELEMETRY, turbidityReadingValid: 1 }));
  await assertFails(set(ref(deviceDatabase('device-b'), `devices/${AQUARIUM_A}/telemetry`), { ...TELEMETRY, phReadingValid: true }));
});

test('ACK-01 the bound device acknowledges the current command with a server timestamp', async () => {
  const database = deviceDatabase('device-a');
  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertSucceeds(set(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`),
    ackFor(COMMAND_A_ID, { status: 'failed', error: 'feeder motor timeout' })));
  await assertSucceeds(get(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/commandAck/latest`)));
  await assertSucceeds(get(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`)));
});

test('ACK-02 a mismatched commandId is denied', async () => {
  const database = deviceDatabase('device-a');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`), ackFor('feed_now-stale')));
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(`feed_now-${AQUARIUM_B}`)));
});

test('ACK-03 another aquarium\'s device cannot acknowledge or read Aquarium A commands', async () => {
  const database = deviceDatabase('device-b');
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertFails(get(ref(database, `devices/${AQUARIUM_A}/commandAck/latest`)));
});

test('ACK-04 humans cannot write acknowledgements; non-owners cannot read them', async () => {
  await assertFails(set(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertFails(set(ref(humanDatabase('user-b'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertFails(set(ref(humanDatabase('admin-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  // A human UID listed in deviceUids without the device claim is still not a device.
  await assertFails(set(ref(humanDatabase('listed-human'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertFails(get(ref(humanDatabase('user-b'), `devices/${AQUARIUM_A}/commandAck/latest`)));
  await assertFails(get(ref(anonymousDatabase(), `devices/${AQUARIUM_A}/commandAck/latest`)));
});

test('ACK-05 acknowledgement payloads are validated', async () => {
  const path = `devices/${AQUARIUM_A}/commandAck/latest`;
  const database = deviceDatabase('device-a');
  for (const ack of [
    ackFor(COMMAND_A_ID, { executedAt: 1792224000000 }),
    ackFor(COMMAND_A_ID, { status: 'pending' }),
    ackFor(COMMAND_A_ID, { status: undefined }),
    ackFor(COMMAND_A_ID, { executedAt: undefined }),
    ackFor(COMMAND_A_ID, { error: 'x'.repeat(201) }),
    ackFor(COMMAND_A_ID, { extra: true }),
  ]) {
    await assertFails(set(ref(database, path), ack));
  }
  await assertFails(set(ref(database, `devices/${AQUARIUM_A}/commandAck/other`), ackFor(COMMAND_A_ID)));
});

test('ACK-06 web command writes and device acks live on separate paths', async () => {
  await assertSucceeds(set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertSucceeds(set(ref(humanDatabase('user-a'), `devices/${AQUARIUM_A}/commands/latest`),
    commandFor(AQUARIUM_A, 'user-a', { commandId: 'feed_now-next', requestedAt: 1792224001000 })));
  await testEnvironment.withSecurityRulesDisabled(async (context) => {
    const ack = (await get(ref(context.database(), `devices/${AQUARIUM_A}/commandAck/latest`))).val();
    if (ack?.commandId !== COMMAND_A_ID) throw new Error('command write overwrote the acknowledgement');
  });
  // The device cannot write into commands/ at all.
  await assertFails(set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/commands/latest/status`), 'done'));
  // The old ack no longer matches the new command, so it cannot be re-written for it.
  await assertFails(set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
  await assertSucceeds(set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor('feed_now-next')));
});

test('ACK-07 a revoked aquarium blocks device acknowledgements', async () => {
  await mutateFixture(`authorization/aquariums/${AQUARIUM_A}/state`, 'revoked');
  await assertFails(set(ref(deviceDatabase('device-a'), `devices/${AQUARIUM_A}/commandAck/latest`), ackFor(COMMAND_A_ID)));
});

test('BIND-01 a device reads only its own binding', async () => {
  await assertSucceeds(get(ref(deviceDatabase('device-a'), 'deviceBindings/device-a')));
  await assertFails(get(ref(deviceDatabase('device-a'), 'deviceBindings/device-b')));
  await assertFails(get(ref(deviceDatabase('device-b'), 'deviceBindings/device-a')));
  await assertFails(get(ref(deviceDatabase('device-a'), 'deviceBindings')));
});

test('BIND-02 humans cannot read bindings, and nobody can write them from a client', async () => {
  // Same UID string as a device but without the device claim.
  await assertFails(get(ref(humanDatabase('device-a'), 'deviceBindings/device-a')));
  await assertFails(get(ref(humanDatabase('user-a'), 'deviceBindings/device-a')));
  await assertFails(get(ref(humanDatabase('admin-a'), 'deviceBindings/device-a')));
  await assertFails(get(ref(anonymousDatabase(), 'deviceBindings/device-a')));
  await assertFails(set(ref(deviceDatabase('device-a'), 'deviceBindings/device-a'), AQUARIUM_B));
  await assertFails(set(ref(humanDatabase('user-a'), 'deviceBindings/device-a'), AQUARIUM_A));
  await assertFails(set(ref(humanDatabase('admin-a'), 'deviceBindings/device-c'), AQUARIUM_A));
});
