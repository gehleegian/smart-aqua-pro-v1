import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after, before, beforeEach } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';

const PROJECT_ID = 'demo-smartaqua-firestore-auth';
const USER_A = 'user-a';
const USER_B = 'user-b';
const ADMIN_A = 'admin-a';
const AQUARIUM_A = 'aquarium-a';
const AQUARIUM_B = 'aquarium-b';
let environment;

async function createSupportThread(database, threadId = 'support-a') {
  const batch = writeBatch(database);
  const threadRef = doc(database, 'support_threads', threadId);
  const messageRef = doc(database, 'support_threads', threadId, 'messages', 'message-a');
  const timestamp = serverTimestamp();

  batch.set(threadRef, {
    ownerId: USER_A,
    ownerName: 'User A',
    ownerEmail: 'user-a@example.test',
    subject: 'Need help with my aquarium',
    status: 'open',
    lastMessage: 'Please help me understand this alert.',
    lastMessageAt: timestamp,
    lastSenderRole: 'User',
    userUnreadCount: 0,
    adminUnreadCount: 1,
    visibleToUser: true,
    visibleToAdmin: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
  batch.set(messageRef, {
    senderId: USER_A,
    senderName: 'User A',
    senderRole: 'User',
    body: 'Please help me understand this alert.',
    createdAt: timestamp,
  });
  await batch.commit();
}

const aquarium = {
  name: 'Aquarium A',
  species: ['Goldfish'],
  bioload: 'low',
  tankType: 'Freshwater',
  tankLengthCm: 60,
  tankWidthCm: 30,
  tankHeightCm: 35,
  workingWaterVolumeLiters: 50,
  hasFiltrationSystem: true,
  filtrationSetup: 'Internal filter',
  fishCount: 2,
  fishWeightsG: [120, 180],
  minTemp: 20,
  maxTemp: 25,
  minPh: 6.5,
  maxPh: 7.5,
  minLevel: 70,
  minQuality: 80,
  temp: 20,
  level: 100,
  quality: 100,
  feeder: 'Active',
  light: 'On',
  filter: 'Active',
  ownerId: USER_A,
  ownerName: 'User A',
  createdAt: '2026-10-18T00:00:00.000Z',
  updatedAt: '2026-10-18T00:00:00.000Z',
  directorySchemaVersion: 3,
};

const directory = {
  name: aquarium.name,
  ownerId: USER_A,
  ownerName: aquarium.ownerName,
  species: aquarium.species,
  bioload: aquarium.bioload,
  tankType: aquarium.tankType,
  tankLengthCm: aquarium.tankLengthCm,
  tankWidthCm: aquarium.tankWidthCm,
  tankHeightCm: aquarium.tankHeightCm,
  workingWaterVolumeLiters: aquarium.workingWaterVolumeLiters,
  hasFiltrationSystem: aquarium.hasFiltrationSystem,
  filtrationSetup: aquarium.filtrationSetup,
  fishCount: aquarium.fishCount,
  createdAt: aquarium.createdAt,
  updatedAt: aquarium.updatedAt,
  schemaVersion: 3,
};

function userDatabase(uid = USER_A, emailVerified = true) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@example.test`,
    email_verified: emailVerified,
  }).firestore();
}

function adminDatabase() {
  return environment.authenticatedContext(ADMIN_A, {
    email: 'admin-a@example.test',
    email_verified: true,
  }).firestore();
}

function engineAlert(aquariumId) {
  return {
    alert_id: `alert-engine-${aquariumId}`, aquarium_id: aquariumId, device_id: aquariumId, type: 'Water temperature above range',
    message: 'Temperature 25 °C is above the 24 °C maximum.', severity: 'warning', isRead: false, status: 'active',
    triggered_at: new Date(0), resolved_at: null, ruleId: 'temp_high_warning', recommendationId: 'rec-a',
    parameter: 'temperatureC', dedupKey: `${aquariumId}:temperatureC`, occurrences: 1, lastSeenAt: 1,
  };
}

function recommendation(aquariumId, ownerId) {
  return {
    aquariumId, ownerId, alertId: 'alert-engine-a', ruleId: 'temp_high_warning', ruleStatus: 'draft', parameter: 'temperatureC',
    severity: 'warning', title: 'Water temperature above range', issueDetected: 'x', action: 'y', basis: 'z', preCheck: 'w',
    readingSnapshot: { temperatureC: 25 }, status: 'pending', createdAt: 1, resolvedAt: null, resolvedBy: null,
  };
}

async function seed() {
  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await Promise.all([
      setDoc(doc(database, 'users', USER_A), {
        name: 'User A',
        email: 'user-a@example.test',
        role: 'User',
      }),
      setDoc(doc(database, 'users', USER_B), {
        name: 'User B',
        email: 'user-b@example.test',
        role: 'User',
      }),
      setDoc(doc(database, 'users', ADMIN_A), {
        name: 'Admin A',
        email: 'admin-a@example.test',
        role: 'Admin',
      }),
      setDoc(doc(database, 'authorization_user_policies', USER_A), {
        emailVerificationRequired: true,
      }),
      setDoc(doc(database, 'authorization_user_policies', USER_B), {
        emailVerificationRequired: true,
      }),
      setDoc(doc(database, 'authorization_user_policies', ADMIN_A), {
        emailVerificationRequired: true,
      }),
      setDoc(doc(database, 'aquariums', AQUARIUM_A), aquarium),
      setDoc(doc(database, 'aquariums', AQUARIUM_B), {
        ...aquarium,
        name: 'Aquarium B',
        ownerId: USER_B,
        ownerName: 'User B',
      }),
      setDoc(doc(database, 'aquarium_directory', AQUARIUM_A), directory),
      setDoc(doc(database, 'alert_records', 'alert-a'), {
        aquarium_id: AQUARIUM_A,
        isRead: false,
      }),
      setDoc(doc(database, 'alert_records', 'alert-engine-a'), engineAlert(AQUARIUM_A)),
      setDoc(doc(database, 'alert_records', 'alert-engine-b'), engineAlert(AQUARIUM_B)),
      setDoc(doc(database, 'recommendations', 'rec-a'), recommendation(AQUARIUM_A, USER_A)),
      setDoc(doc(database, 'recommendations', 'rec-b'), recommendation(AQUARIUM_B, USER_B)),
      setDoc(doc(database, 'recommendations', 'rec-a-resolved'), { ...recommendation(AQUARIUM_A, USER_A), status: 'resolved', resolvedBy: 'system', resolvedAt: 1 }),
      setDoc(doc(database, 'maintenance_actions', 'clean-a'), { aquariumId: AQUARIUM_A, actionType: 'cleaning', performedAt: 1, performedBy: USER_A }),
      setDoc(doc(database, 'maintenance_actions', 'clean-b'), { aquariumId: AQUARIUM_B, actionType: 'cleaning', performedAt: 1, performedBy: USER_B }),
      setDoc(doc(database, 'species', 'goldfish'), { name: 'Goldfish', status: 'draft', source: 'TBD', approvedBy: null, approvedAt: null }),
      setDoc(doc(database, 'rules', 'temp_high_warning'), { parameter: 'temperatureC', severity: 'warning', status: 'draft' }),
    ]);
  });
}

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile('firestore.rules', 'utf8'),
    },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await seed();
});

after(async () => {
  await environment.cleanup();
});

test('FS-01 verified owner retains normal aquarium access while unblocked', async () => {
  const database = userDatabase();
  await assertSucceeds(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    name: 'Updated Aquarium',
    updatedAt: '2026-10-18T01:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    name: 'Updated Aquarium',
    updatedAt: '2026-10-18T01:00:00.000Z',
  });
  await assertSucceeds(batch.commit());
});

// Sprint 3: list queries must filter on orgId (tests/firestore/org-access.rules.test.mjs).
// The pre-migration ownerId query is denied, which is why migrate-orgs runs
// before these rules are deployed (docs/migration-live.md).
test('FS-01A1 the legacy ownerId list query is denied after the org model', async () => {
  await assertFails(
    getDocs(
      query(
        collection(userDatabase(), 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );
});

test('FS-01A2 owner query cannot request another users aquariums', async () => {
  await assertFails(
    getDocs(
      query(
        collection(userDatabase(), 'aquariums'),
        where('ownerId', '==', USER_B)
      )
    )
  );
});

test('FS-01A3 owner cannot list aquariums without an ownership constraint', async () => {
  await assertFails(getDocs(collection(userDatabase(), 'aquariums')));
});

test('FS-01A unverified owner cannot access protected aquarium data', async () => {
  const database = userDatabase(USER_A, false);
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(
    getDocs(
      query(
        collection(database, 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );
  await assertFails(getDoc(doc(database, 'alert_records', 'alert-a')));
});

test('FS-01B explicitly exempt legacy owner retains only authorized aquarium access', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'authorization_user_policies', USER_A),
      { emailVerificationRequired: false }
    );
  });
  const database = userDatabase(USER_A, false);
  await assertSucceeds(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_B)));
});

test('FS-01B2 explicitly exempt legacy owner can query only their aquariums', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), 'authorization_user_policies', USER_A),
      { emailVerificationRequired: false }
    );
  });
  const database = userDatabase(USER_A, false);
  // Direct reads keep working for an exempt legacy owner; list queries need orgId.
  await assertSucceeds(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_B)));
  await assertFails(
    getDocs(
      query(
        collection(database, 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );
});

test('FS-01C missing policy fails closed for an unverified owner', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await deleteDoc(
      doc(context.firestore(), 'authorization_user_policies', USER_A)
    );
  });
  await assertFails(
    getDoc(doc(userDatabase(USER_A, false), 'aquariums', AQUARIUM_A))
  );
});

test('FS-01D users can read only their policy and cannot create or modify exemptions', async () => {
  const database = userDatabase(USER_A, false);
  await assertSucceeds(
    getDoc(doc(database, 'authorization_user_policies', USER_A))
  );
  await assertFails(
    getDoc(doc(database, 'authorization_user_policies', USER_B))
  );
  await assertFails(
    updateDoc(doc(database, 'authorization_user_policies', USER_A), {
      emailVerificationRequired: false,
    })
  );
  await assertFails(
    setDoc(doc(database, 'authorization_user_policies', 'forged-user'), {
      emailVerificationRequired: false,
    })
  );
});

test('FS-01E revoked legacy owner remains denied', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await Promise.all([
      setDoc(doc(context.firestore(), 'authorization_user_policies', USER_A), {
        emailVerificationRequired: false,
      }),
      setDoc(doc(context.firestore(), 'security_user_blocks', USER_A), {
        operationId: 'legacy-revocation',
      }),
    ]);
  });
  await assertFails(
    getDoc(doc(userDatabase(USER_A, false), 'aquariums', AQUARIUM_A))
  );
});

test('FS-02 direct client aquarium deletion is denied even as a paired batch', async () => {
  const database = userDatabase();
  await assertFails(deleteDoc(doc(database, 'aquariums', AQUARIUM_A)));
  const batch = writeBatch(database);
  batch.delete(doc(database, 'aquariums', AQUARIUM_A));
  batch.delete(doc(database, 'aquarium_directory', AQUARIUM_A));
  await assertFails(batch.commit());
});

test('FS-03 clients cannot transfer ownership directly', async () => {
  const database = userDatabase();
  await assertFails(
    updateDoc(doc(database, 'aquariums', AQUARIUM_A), {
      ownerId: USER_B,
      ownerName: 'User B',
    })
  );
});

test('FS-04 clients cannot update roles or delete user profiles', async () => {
  const database = adminDatabase();
  await assertFails(updateDoc(doc(database, 'users', USER_A), { role: 'Admin' }));
  await assertFails(deleteDoc(doc(database, 'users', USER_A)));
});

test('FS-05 an aquarium security block immediately denies owner data access', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'security_aquarium_blocks', AQUARIUM_A), {
      operationId: 'operation-a',
      reason: 'ownership-transfer',
    });
  });
  const database = userDatabase();
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(getDoc(doc(database, 'alert_records', 'alert-a')));
});

test('FS-06 a user security block denies the blocked account', async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'security_user_blocks', USER_A), {
      operationId: 'operation-user-a',
      reason: 'user-revocation',
    });
  });
  const database = userDatabase();
  await assertFails(getDoc(doc(database, 'users', USER_A)));
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(
    getDocs(
      query(
        collection(database, 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );
});

// Sprint 3 access model: the platform admin reads everything, writes nothing.
test('FS-07 platform admin reads the directory and live aquarium records but cannot write them', async () => {
  const database = adminDatabase();
  await assertSucceeds(
    getDocs(query(collection(database, 'aquarium_directory'), where('ownerId', '==', USER_A)))
  );
  await assertSucceeds(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertSucceeds(getDoc(doc(database, 'alert_records', 'alert-a')));
  await assertFails(updateDoc(doc(database, 'aquariums', AQUARIUM_A), { name: 'Admin edit' }));
  await assertFails(updateDoc(doc(database, 'alert_records', 'alert-a'), { isRead: true }));
});

test('FS-08 clients cannot read or write trusted workflow collections', async () => {
  const database = adminDatabase();
  await assertFails(getDoc(doc(database, 'security_mutation_operations', 'operation-a')));
  await assertFails(
    setDoc(doc(database, 'security_user_blocks', USER_B), {
      operationId: 'forged-operation',
    })
  );
  assert.ok(true);
});

// Sprint 3: aquariums are created only by the claimDevice callable.
test('FS-09 clients cannot create aquariums directly, even with a complete profile', async () => {
  const database = userDatabase();
  const aquariumId = 'aquarium-profile-create';
  const { bioload: _legacyBioload, ...profileAquarium } = aquarium;
  const { bioload: _legacyDirectoryBioload, ...profileDirectory } = directory;
  const batch = writeBatch(database);

  batch.set(doc(database, 'aquariums', aquariumId), {
    ...profileAquarium,
    name: 'Profile Aquarium',
  });
  batch.set(doc(database, 'aquarium_directory', aquariumId), {
    ...profileDirectory,
    name: 'Profile Aquarium',
  });

  await assertFails(batch.commit());
});

test('FS-10 owner can update structural profile fields with a matching directory record', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);

  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishCount: 5,
    fishWeightsG: [100, 110, 120, 130, 140],
    workingWaterVolumeLiters: 55,
    hasFiltrationSystem: false,
    updatedAt: '2026-10-18T02:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    fishCount: 5,
    workingWaterVolumeLiters: 55,
    hasFiltrationSystem: false,
    updatedAt: '2026-10-18T02:00:00.000Z',
  });

  await assertSucceeds(batch.commit());
  const saved = await assertSucceeds(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  assert.equal(saved.data().fishCount, 5);
  assert.deepEqual(saved.data().fishWeightsG, [100, 110, 120, 130, 140]);
  assert.equal(saved.data().workingWaterVolumeLiters, 55);
  assert.equal(saved.data().hasFiltrationSystem, false);
  assert.equal(saved.data().filtrationSetup, 'Internal filter');
});

test('FS-10B owner can complete and update a legacy profile without filtration presence', async () => {
  const aquariumId = 'legacy-aquarium-profile';
  const {
    hasFiltrationSystem: _legacyFiltrationPresence,
    directorySchemaVersion: _legacyDirectoryVersion,
    ...legacyAquarium
  } = aquarium;
  const {
    hasFiltrationSystem: _legacyDirectoryFiltrationPresence,
    schemaVersion: _legacySchemaVersion,
    ...legacyDirectory
  } = directory;

  await environment.withSecurityRulesDisabled(async (context) => {
    const database = context.firestore();
    await setDoc(doc(database, 'aquariums', aquariumId), {
      ...legacyAquarium,
      directorySchemaVersion: 2,
    });
    await setDoc(doc(database, 'aquarium_directory', aquariumId), {
      ...legacyDirectory,
      schemaVersion: 2,
    });
  });

  const database = userDatabase();
  const updatedAt = '2026-10-18T02:30:00.000Z';
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', aquariumId), {
    hasFiltrationSystem: false,
    directorySchemaVersion: 3,
    updatedAt,
  });
  batch.set(doc(database, 'aquarium_directory', aquariumId), {
    ...legacyDirectory,
    hasFiltrationSystem: false,
    schemaVersion: 3,
    updatedAt,
  });

  await assertSucceeds(batch.commit());
  const saved = await assertSucceeds(getDoc(doc(database, 'aquariums', aquariumId)));
  assert.equal(saved.data().hasFiltrationSystem, false);
  assert.equal(saved.data().directorySchemaVersion, 3);
});

test('FS-11 another user cannot modify an aquarium profile', async () => {
  const database = userDatabase(USER_B);
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishCount: 4,
    fishWeightsG: [100, 110, 120, 130],
    updatedAt: '2026-10-18T03:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    fishCount: 4,
    updatedAt: '2026-10-18T03:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-12 profile validation rejects fractional fish quantity', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishCount: 2.5,
    updatedAt: '2026-10-18T04:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    fishCount: 2.5,
    updatedAt: '2026-10-18T04:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-13 owner cannot forge derived biomass or estimated bioload fields', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    totalFishBiomassG: 9999,
    estimatedBioloadGL: 9999,
    updatedAt: '2026-10-18T05:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    updatedAt: '2026-10-18T05:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-15 profile validation rejects zero fish and an empty weights list', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishCount: 0,
    fishWeightsG: [],
    updatedAt: '2026-10-18T06:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    fishCount: 0,
    updatedAt: '2026-10-18T06:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-16 profile validation rejects a fish-count and weights-length mismatch', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishCount: 3,
    fishWeightsG: [120, 180],
    updatedAt: '2026-10-18T07:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    fishCount: 3,
    updatedAt: '2026-10-18T07:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-17 profile validation rejects a non-positive first fish weight', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    fishWeightsG: [0, 180],
    updatedAt: '2026-10-18T08:00:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    updatedAt: '2026-10-18T08:00:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-17B profile validation rejects an inverted pH threshold range', async () => {
  const database = userDatabase();
  const batch = writeBatch(database);
  batch.update(doc(database, 'aquariums', AQUARIUM_A), {
    minPh: 8,
    maxPh: 7,
    updatedAt: '2026-10-18T08:30:00.000Z',
  });
  batch.update(doc(database, 'aquarium_directory', AQUARIUM_A), {
    updatedAt: '2026-10-18T08:30:00.000Z',
  });
  await assertFails(batch.commit());
});

test('FS-14 creation requires an explicit filtration-system choice', async () => {
  const database = userDatabase();
  const aquariumId = 'aquarium-incomplete';
  const {
    hasFiltrationSystem: _filtrationPresence,
    bioload: _legacyBioload,
    ...incompleteAquarium
  } = aquarium;
  const {
    hasFiltrationSystem: _directoryFiltrationPresence,
    bioload: _legacyDirectoryBioload,
    ...incompleteDirectory
  } = directory;
  const batch = writeBatch(database);
  batch.set(doc(database, 'aquariums', aquariumId), incompleteAquarium);
  batch.set(doc(database, 'aquarium_directory', aquariumId), incompleteDirectory);
  await assertFails(batch.commit());
});

test('FS-18 user can create a support thread with its first message', async () => {
  const database = userDatabase();
  await assertSucceeds(createSupportThread(database));
  const saved = await assertSucceeds(
    getDoc(doc(database, 'support_threads', 'support-a'))
  );
  assert.equal(saved.data().ownerId, USER_A);
  assert.equal(saved.data().adminUnreadCount, 1);
});

test('FS-19 support conversations are isolated to their owner and administrators', async () => {
  await createSupportThread(userDatabase());
  await assertSucceeds(
    getDocs(
      query(
        collection(userDatabase(), 'support_threads'),
        where('ownerId', '==', USER_A)
      )
    )
  );
  await assertSucceeds(
    getDocs(
      collection(
        userDatabase(),
        'support_threads',
        'support-a',
        'messages'
      )
    )
  );
  await assertFails(
    getDoc(doc(userDatabase(USER_B), 'support_threads', 'support-a'))
  );
  await assertSucceeds(
    getDoc(doc(adminDatabase(), 'support_threads', 'support-a'))
  );
  await assertFails(
    getDoc(
      doc(
        userDatabase(USER_B),
        'support_threads',
        'support-a',
        'messages',
        'message-a'
      )
    )
  );
});

test('FS-20 administrator can reply and the user can clear the reply notification', async () => {
  await createSupportThread(userDatabase());

  const adminDb = adminDatabase();
  const batch = writeBatch(adminDb);
  const timestamp = serverTimestamp();
  batch.set(
    doc(adminDb, 'support_threads', 'support-a', 'messages', 'message-admin'),
    {
      senderId: ADMIN_A,
      senderName: 'Admin A',
      senderRole: 'Admin',
      body: 'We have reviewed your question.',
      createdAt: timestamp,
    }
  );
  batch.update(doc(adminDb, 'support_threads', 'support-a'), {
    lastMessage: 'We have reviewed your question.',
    lastMessageAt: timestamp,
    lastSenderRole: 'Admin',
    userUnreadCount: 1,
    adminUnreadCount: 0,
    updatedAt: timestamp,
  });
  await assertSucceeds(batch.commit());

  await assertSucceeds(
    updateDoc(doc(userDatabase(), 'support_threads', 'support-a'), {
      userUnreadCount: 0,
    })
  );
});

test('FS-21 user cannot forge an administrator reply or another users ticket', async () => {
  await createSupportThread(userDatabase());
  await assertFails(
    setDoc(
      doc(userDatabase(USER_B), 'support_threads', 'forged-support'),
      {
        ownerId: USER_A,
        ownerName: 'User A',
        ownerEmail: 'user-a@example.test',
        subject: 'Forged ticket',
        status: 'open',
        lastMessage: 'This should fail.',
        lastMessageAt: serverTimestamp(),
        lastSenderRole: 'User',
        userUnreadCount: 0,
        adminUnreadCount: 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    )
  );
  await assertFails(
    setDoc(
      doc(userDatabase(), 'support_threads', 'support-a', 'messages', 'forged-admin'),
      {
        senderId: USER_A,
        senderName: 'User A',
        senderRole: 'Admin',
        body: 'Forged administrator reply.',
        createdAt: serverTimestamp(),
      }
    )
  );
});

test('FS-22 direct support conversation deletion is denied to users and admins', async () => {
  await createSupportThread(userDatabase());
  await assertFails(
    deleteDoc(doc(userDatabase(), 'support_threads', 'support-a'))
  );
  await assertFails(
    deleteDoc(doc(adminDatabase(), 'support_threads', 'support-a'))
  );
});

test('FS-23 user and admin can independently hide only their own conversation copy', async () => {
  await createSupportThread(userDatabase());

  await assertSucceeds(
    updateDoc(doc(userDatabase(), 'support_threads', 'support-a'), {
      visibleToUser: false,
    })
  );
  const adminCopy = await assertSucceeds(
    getDoc(doc(adminDatabase(), 'support_threads', 'support-a'))
  );
  assert.equal(adminCopy.data().visibleToAdmin, true);

  await assertFails(
    updateDoc(doc(userDatabase(), 'support_threads', 'support-a'), {
      visibleToAdmin: false,
    })
  );
  await assertSucceeds(
    updateDoc(doc(adminDatabase(), 'support_threads', 'support-a'), {
      visibleToAdmin: false,
    })
  );
});

// ---------------- Sprint 2: rules engine collections ----------------

test('FS-30 species and rules are readable by signed-in users and writable by no client', async () => {
  for (const database of [userDatabase(), adminDatabase()]) {
    await assertSucceeds(getDoc(doc(database, 'species', 'goldfish')));
    await assertSucceeds(getDocs(collection(database, 'rules')));
  }
  await assertFails(getDoc(doc(userDatabase(USER_A, false), 'species', 'goldfish')));
  await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'rules', 'temp_high_warning')));
  for (const database of [userDatabase(), adminDatabase()]) {
    await assertFails(updateDoc(doc(database, 'species', 'goldfish'), { status: 'approved' }));
    await assertFails(setDoc(doc(database, 'rules', 'new_rule'), { parameter: 'ph', severity: 'warning' }));
    await assertFails(updateDoc(doc(database, 'rules', 'temp_high_warning'), { enabled: false }));
  }
});

test('FS-31 owners read only their own recommendations, alerts and maintenance actions', async () => {
  const database = userDatabase();
  await assertSucceeds(getDoc(doc(database, 'recommendations', 'rec-a')));
  await assertSucceeds(getDocs(query(collection(database, 'recommendations'), where('aquariumId', '==', AQUARIUM_A))));
  await assertSucceeds(getDoc(doc(database, 'alert_records', 'alert-engine-a')));
  await assertSucceeds(getDocs(query(collection(database, 'alert_records'), where('aquarium_id', '==', AQUARIUM_A))));
  await assertSucceeds(getDoc(doc(database, 'maintenance_actions', 'clean-a')));
  await assertFails(getDoc(doc(database, 'recommendations', 'rec-b')));
  await assertFails(getDocs(query(collection(database, 'recommendations'), where('aquariumId', '==', AQUARIUM_B))));
  await assertFails(getDocs(collection(database, 'recommendations')));
  await assertFails(getDoc(doc(database, 'alert_records', 'alert-engine-b')));
  await assertFails(getDoc(doc(database, 'maintenance_actions', 'clean-b')));
  await assertSucceeds(getDoc(doc(adminDatabase(), 'recommendations', 'rec-a')), 'the platform admin reads (Sprint 3)');
  await assertFails(updateDoc(doc(adminDatabase(), 'recommendations', 'rec-a'), { status: 'applied', resolvedAt: Date.now(), resolvedBy: ADMIN_A }));
});

test('FS-32 the owner can mark a pending recommendation applied or dismissed, and nothing else', async () => {
  const database = userDatabase();
  await assertSucceeds(updateDoc(doc(database, 'recommendations', 'rec-a'), { status: 'applied', resolvedAt: Date.now(), resolvedBy: USER_A }));
  await environment.withSecurityRulesDisabled((context) => setDoc(doc(context.firestore(), 'recommendations', 'rec-a'), recommendation(AQUARIUM_A, USER_A)));
  await assertSucceeds(updateDoc(doc(database, 'recommendations', 'rec-a'), { status: 'dismissed', resolvedAt: Date.now(), resolvedBy: USER_A }));
});

test('FS-33 recommendation updates are denied outside the allowed transition', async () => {
  const database = userDatabase();
  const ref = doc(database, 'recommendations', 'rec-a');
  const now = Date.now();
  await assertFails(updateDoc(ref, { status: 'resolved', resolvedAt: now, resolvedBy: USER_A }), 'resolved is system-only');
  await assertFails(updateDoc(ref, { status: 'pending', resolvedAt: now, resolvedBy: USER_A }));
  await assertFails(updateDoc(ref, { status: 'applied', resolvedAt: now, resolvedBy: USER_B }), 'cannot stamp another user');
  await assertFails(updateDoc(ref, { status: 'applied', resolvedAt: now, resolvedBy: 'system' }));
  await assertFails(updateDoc(ref, { status: 'applied', resolvedAt: now - 3_600_000, resolvedBy: USER_A }), 'backdated');
  await assertFails(updateDoc(ref, { status: 'applied', resolvedAt: String(now), resolvedBy: USER_A }));
  await assertFails(updateDoc(ref, { status: 'applied', resolvedAt: now, resolvedBy: USER_A, action: 'edited' }), 'other fields');
  await assertFails(updateDoc(ref, { severity: 'critical' }));
  await assertFails(updateDoc(doc(database, 'recommendations', 'rec-a-resolved'), { status: 'applied', resolvedAt: now, resolvedBy: USER_A }), 'only pending');
  await assertFails(updateDoc(doc(userDatabase(USER_B), 'recommendations', 'rec-a'), { status: 'applied', resolvedAt: now, resolvedBy: USER_B }));
  await assertFails(updateDoc(doc(adminDatabase(), 'recommendations', 'rec-a'), { status: 'applied', resolvedAt: now, resolvedBy: ADMIN_A }));
});

test('FS-34 only the functions create recommendations, alerts and maintenance actions; nobody deletes them', async () => {
  for (const database of [userDatabase(), adminDatabase()]) {
    await assertFails(setDoc(doc(database, 'recommendations', 'forged'), recommendation(AQUARIUM_A, USER_A)));
    await assertFails(setDoc(doc(database, 'alert_records', 'forged'), engineAlert(AQUARIUM_A)));
    await assertFails(setDoc(doc(database, 'maintenance_actions', 'forged'), { aquariumId: AQUARIUM_A, actionType: 'cleaning', performedAt: 1 }));
    await assertFails(deleteDoc(doc(database, 'recommendations', 'rec-a')));
    await assertFails(deleteDoc(doc(database, 'alert_records', 'alert-engine-a')));
  }
  await assertFails(getDoc(doc(userDatabase(), 'aquariums', AQUARIUM_A, 'engine', 'state')), 'engine state is functions-only');
});

test('FS-35 alert_records: the owner may only flip isRead; engine fields are protected', async () => {
  const database = userDatabase();
  await assertSucceeds(updateDoc(doc(database, 'alert_records', 'alert-engine-a'), { isRead: true }));
  await assertFails(updateDoc(doc(database, 'alert_records', 'alert-engine-a'), { occurrences: 0 }));
  await assertFails(updateDoc(doc(database, 'alert_records', 'alert-engine-a'), { status: 'resolved' }));
  await assertFails(updateDoc(doc(database, 'alert_records', 'alert-engine-b'), { isRead: true }));
});

test('FS-36 owners cannot write the engine-owned aquarium fields (condition, cleaning, overrides)', async () => {
  const database = userDatabase();
  for (const field of ['condition', 'cleaning', 'bioloadLevel', 'thresholdOverrides']) {
    await assertFails(updateDoc(doc(database, 'aquariums', AQUARIUM_A), { [field]: { overall: 'normal' }, updatedAt: '2026-11-07T00:00:00.000Z' }), field);
  }
});
