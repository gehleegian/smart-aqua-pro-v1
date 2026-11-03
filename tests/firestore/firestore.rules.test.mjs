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

test('FS-01A1 verified owner can query only their aquariums', async () => {
  const snapshot = await assertSucceeds(
    getDocs(
      query(
        collection(userDatabase(), 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );

  assert.deepEqual(snapshot.docs.map((entry) => entry.id), [AQUARIUM_A]);
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
  const snapshot = await assertSucceeds(
    getDocs(
      query(
        collection(database, 'aquariums'),
        where('ownerId', '==', USER_A)
      )
    )
  );

  assert.deepEqual(snapshot.docs.map((entry) => entry.id), [AQUARIUM_A]);
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

test('FS-07 Admin can read the directory but not live aquarium records', async () => {
  const database = adminDatabase();
  await assertSucceeds(
    getDocs(query(collection(database, 'aquarium_directory'), where('ownerId', '==', USER_A)))
  );
  await assertFails(getDoc(doc(database, 'aquariums', AQUARIUM_A)));
  await assertFails(getDoc(doc(database, 'alert_records', 'alert-a')));
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

test('FS-09 owner can create and reload a complete Goldfish profile without invented bioload', async () => {
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

  await assertSucceeds(batch.commit());
  const saved = await assertSucceeds(getDoc(doc(database, 'aquariums', aquariumId)));
  assert.equal(saved.data().tankType, 'Freshwater');
  assert.equal(saved.data().species[0], 'Goldfish');
  assert.equal(saved.data().fishCount, 2);
  assert.equal(saved.data().hasFiltrationSystem, true);
  assert.equal(saved.data().minPh, 6.5);
  assert.equal(saved.data().maxPh, 7.5);
  assert.equal(saved.data().bioload, undefined);
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
