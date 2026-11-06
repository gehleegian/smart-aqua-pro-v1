// Sprint 3 migration: move existing data onto the organization access model.
//
//   npm run build:functions                                                  # the script reuses the compiled mirror sync
//   node --experimental-strip-types scripts/migrate-orgs.ts --dry-run        # emulator (default): print the plan only
//   node --experimental-strip-types scripts/migrate-orgs.ts                  # emulator: apply
//   node --experimental-strip-types scripts/migrate-orgs.ts --rollback       # emulator: undo what this script created
//   node --experimental-strip-types scripts/migrate-orgs.ts --project <id> --database-url <url> [--dry-run|--rollback]
//                                                                            # REAL project: asks you to type the id
//
// Idempotent: re-running changes nothing that is already migrated.
//   1. Each aquarium owner without an org gets a personal org org-<uid>
//      (members/<uid> role owner); each of their aquariums gets orgId and an
//      empty caretakerIds. ownerId is kept.
//   2. Every device already bound in authorization/aquariums/{id}/deviceUids
//      with a uid esp32-SAQ-XXXX-XXXX (the live esp32-SAQ-7K3M-9R2X) gets a
//      device_registry/<SAQ-…> entry with status 'claimed' and no claim code, and
//      deviceBindings/<uid> if it is missing.
//   3. Users with role 'Admin' get the platformAdmin: true custom claim.
//   4. The RTDB access mirror is re-synced (adds orgId; ownerUid, state,
//      deviceUids and claimOperationId are kept), using functions/lib.
// Every document this script creates carries migratedAt, so --rollback removes
// exactly those. See docs/migration-live.md step 4.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { FieldValue, getFirestore } = requireFromFunctions('firebase-admin/firestore');

const DEFAULT_EMULATOR_PROJECT = 'demo-smartaqua';
const DEVICE_UID_PATTERN = /^esp32-(SAQ-[A-Z0-9]{4}-[A-Z0-9]{4})$/;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const project = flag('--project');
const databaseUrlFlag = flag('--database-url');
const dryRun = args.includes('--dry-run');
const rollback = args.includes('--rollback');

type Plan = { label: string; apply: () => Promise<void> }[];
type Record_ = Record<string, unknown>;
const isRecord = (value: unknown): value is Record_ => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

async function connect() {
  let projectId: string;
  let databaseURL: string;
  if (project) {
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_DATABASE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      console.error('Emulator host variables are set; unset them to target a real project.');
      process.exit(1);
    }
    if (!databaseUrlFlag) {
      console.error('--project needs --database-url (the RTDB URL from the Firebase console).');
      process.exit(1);
    }
    projectId = project;
    databaseURL = databaseUrlFlag;
    if (!dryRun) {
      console.log(`About to ${rollback ? 'ROLL BACK' : 'apply'} the org migration on the REAL project "${projectId}".`);
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`Type the project id (${projectId}) to confirm: `);
      rl.close();
      if (answer.trim() !== projectId) {
        console.log('Not confirmed. Nothing was written.');
        process.exit(1);
      }
    }
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
    projectId = process.env.GCLOUD_PROJECT || DEFAULT_EMULATOR_PROJECT;
    databaseURL = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${projectId}-default-rtdb`;
    console.log(`Emulators, project "${projectId}".`);
  }
  const app = initializeApp({ projectId, databaseURL }, 'migrate-orgs');
  return { firestore: getFirestore(app), database: getDatabase(app), auth: getAuth(app) };
}

async function loadSync() {
  const compiled = path.join(root, 'functions/lib/src/authorizationSync.js');
  if (!existsSync(compiled)) {
    console.error('functions/lib is missing: run `npm run build:functions` first.');
    process.exit(1);
  }
  return (await import(pathToFileURL(compiled).href)) as {
    syncAquariumAuthorization: (deps: unknown, aquariumId: string) => Promise<unknown>;
  };
}

async function planMigration(services: Awaited<ReturnType<typeof connect>>, now: number): Promise<{ plan: Plan; aquariumIds: Set<string> }> {
  const { firestore, database, auth } = services;
  const plan: Plan = [];
  const touched = new Set<string>();
  const [aquariums, users, mirrorSnapshot, bindingsSnapshot] = await Promise.all([
    firestore.collection('aquariums').get(),
    firestore.collection('users').get(),
    database.ref('authorization/aquariums').get(),
    database.ref('deviceBindings').get(),
  ]);
  const userById = new Map(users.docs.map((doc: { id: string; data: () => Record_ }) => [doc.id, doc.data()]));
  const orgsPlanned = new Set<string>();
  const orgIdByAquarium = new Map<string, string>();

  // 1. Personal orgs + aquarium orgId.
  for (const aquarium of aquariums.docs) {
    const data = aquarium.data() as Record_;
    const existingOrg = text(data.orgId);
    if (existingOrg) {
      orgIdByAquarium.set(aquarium.id, existingOrg);
      continue;
    }
    const ownerId = text(data.ownerId);
    const owner = ownerId ? (userById.get(ownerId) as Record_ | undefined) : undefined;
    if (!ownerId || !owner) {
      console.warn(`skip aquariums/${aquarium.id}: owner ${ownerId ?? '(none)'} has no users/ profile`);
      continue;
    }
    if (owner.role !== 'User') {
      console.warn(`skip aquariums/${aquarium.id}: owner ${ownerId} has role ${String(owner.role)}, not User`);
      continue;
    }
    const orgId = `org-${ownerId}`;
    orgIdByAquarium.set(aquarium.id, orgId);
    if (!orgsPlanned.has(orgId)) {
      orgsPlanned.add(orgId);
      const orgRef = firestore.doc(`organizations/${orgId}`);
      if (!(await orgRef.get()).exists) {
        const name = text(owner.name) ?? text(owner.full_name) ?? text(data.ownerName) ?? text(owner.email) ?? ownerId;
        plan.push({
          label: `create organizations/${orgId} (personal, "${name}") with owner ${ownerId}`,
          apply: async () => {
            const batch = firestore.batch();
            batch.create(orgRef, { name, type: 'personal', status: 'active', createdBy: ownerId, createdAt: now, migratedAt: now });
            batch.create(firestore.doc(`organizations/${orgId}/members/${ownerId}`), {
              uid: ownerId, role: 'owner', joinedAt: now, invitedBy: null,
              email: text(owner.email)?.toLowerCase() ?? null, displayName: name, migratedAt: now,
            });
            batch.create(firestore.collection('audit_logs').doc(), {
              actor: 'migration', action: 'org.migrate', target: `organizations/${orgId}`, orgId, details: { ownerId }, at: now,
            });
            await batch.commit();
          },
        });
      }
    }
    plan.push({
      label: `set aquariums/${aquarium.id} orgId=${orgId}, caretakerIds=[] (ownerId kept)`,
      apply: async () => {
        await aquarium.ref.update({ orgId, ...(Array.isArray(data.caretakerIds) ? {} : { caretakerIds: [] }) });
      },
    });
    touched.add(aquarium.id);
  }

  // 2. Devices already bound in the mirror (the live esp32-SAQ-7K3M-9R2X).
  const mirror = isRecord(mirrorSnapshot.val()) ? (mirrorSnapshot.val() as Record_) : {};
  const bindings = isRecord(bindingsSnapshot.val()) ? (bindingsSnapshot.val() as Record_) : {};
  for (const [aquariumId, entry] of Object.entries(mirror)) {
    if (!isRecord(entry) || !isRecord(entry.deviceUids)) continue;
    const aquarium = aquariums.docs.find((doc: { id: string }) => doc.id === aquariumId);
    const orgId = orgIdByAquarium.get(aquariumId);
    if (!aquarium || !orgId) continue;
    const data = aquarium.data() as Record_;
    for (const deviceUid of Object.keys(entry.deviceUids)) {
      const match = DEVICE_UID_PATTERN.exec(deviceUid);
      if (!match || entry.deviceUids[deviceUid] !== true) continue;
      const deviceId = match[1];
      const registryRef = firestore.doc(`device_registry/${deviceId}`);
      if ((await registryRef.get()).exists) continue;
      const bindingMissing = bindings[deviceUid] === undefined;
      if (!bindingMissing && bindings[deviceUid] !== aquariumId) {
        console.warn(`deviceBindings/${deviceUid} points to ${String(bindings[deviceUid])}, not ${aquariumId}; left unchanged`);
      }
      const addFields = !text(data.deviceId);
      plan.push({
        label: `register ${deviceId} as claimed (no claim code) for aquariums/${aquariumId}${bindingMissing ? `, write deviceBindings/${deviceUid}` : ''}${addFields ? ', set aquarium deviceId/deviceUid' : ''}`,
        apply: async () => {
          await registryRef.create({
            claimCodeHash: null, status: 'claimed', deviceUid, orgId, aquariumId,
            claimedBy: text(data.ownerId), claimedAt: now, createdAt: now, migratedAt: now,
            migratedFrom: text(entry.claimOperationId),
            bindingCreatedByMigration: bindingMissing, aquariumFieldsAddedByMigration: addFields,
          });
          if (addFields) await aquarium.ref.update({ deviceId, deviceUid });
          if (bindingMissing) await database.ref(`deviceBindings/${deviceUid}`).set(aquariumId);
        },
      });
      touched.add(aquariumId);
    }
  }

  // 3. Admin role -> platformAdmin claim.
  for (const [uid, profile] of userById) {
    if ((profile as Record_).role !== 'Admin') continue;
    let claims: Record_ | undefined;
    try {
      claims = (await auth.getUser(uid)).customClaims;
    } catch {
      console.warn(`skip platformAdmin for ${uid}: no Auth account`);
      continue;
    }
    if (claims?.platformAdmin === true) continue;
    plan.push({
      label: `set platformAdmin claim on Admin ${uid}`,
      apply: async () => {
        await auth.setCustomUserClaims(uid, { ...(claims ?? {}), platformAdmin: true });
      },
    });
  }
  return { plan, aquariumIds: touched };
}

async function planRollback(services: Awaited<ReturnType<typeof connect>>): Promise<{ plan: Plan; aquariumIds: Set<string> }> {
  const { firestore, database, auth } = services;
  const plan: Plan = [];
  const touched = new Set<string>();
  const orgs = await firestore.collection('organizations').where('migratedAt', '>', 0).get();
  for (const org of orgs.docs) {
    const aquariums = await firestore.collection('aquariums').where('orgId', '==', org.id).get();
    for (const aquarium of aquariums.docs) {
      const caretakers = aquarium.get('caretakerIds');
      if (Array.isArray(caretakers) && caretakers.length > 0) {
        console.warn(`aquariums/${aquarium.id} has caretakers added after the migration; they lose access on rollback`);
      }
      plan.push({
        label: `remove orgId/caretakerIds from aquariums/${aquarium.id}`,
        apply: async () => {
          await aquarium.ref.update({ orgId: FieldValue.delete(), caretakerIds: FieldValue.delete() });
        },
      });
      touched.add(aquarium.id);
    }
    plan.push({
      label: `delete organizations/${org.id} and its members`,
      apply: async () => {
        await firestore.recursiveDelete(org.ref);
      },
    });
  }
  const devices = await firestore.collection('device_registry').where('migratedAt', '>', 0).get();
  for (const device of devices.docs) {
    const data = device.data() as Record_;
    plan.push({
      label: `delete device_registry/${device.id}${data.bindingCreatedByMigration ? ` and deviceBindings/${String(data.deviceUid)}` : ''}`,
      apply: async () => {
        if (data.aquariumFieldsAddedByMigration && typeof data.aquariumId === 'string') {
          await firestore.doc(`aquariums/${data.aquariumId}`).update({ deviceId: FieldValue.delete(), deviceUid: FieldValue.delete() });
        }
        if (data.bindingCreatedByMigration) await database.ref(`deviceBindings/${String(data.deviceUid)}`).remove();
        await device.ref.delete();
      },
    });
  }
  const admins = await firestore.collection('users').where('role', '==', 'Admin').get();
  for (const admin of admins.docs) {
    plan.push({
      label: `clear platformAdmin claim on ${admin.id}`,
      apply: async () => {
        try {
          const claims = { ...((await auth.getUser(admin.id)).customClaims ?? {}) };
          delete claims.platformAdmin;
          await auth.setCustomUserClaims(admin.id, claims);
        } catch {
          console.warn(`no Auth account for ${admin.id}`);
        }
      },
    });
  }
  return { plan, aquariumIds: touched };
}

async function main() {
  const services = await connect();
  const now = Date.now();
  const { plan, aquariumIds } = rollback ? await planRollback(services) : await planMigration(services, now);
  console.log(`${rollback ? 'Rollback' : 'Migration'} plan: ${plan.length} step(s).`);
  for (const step of plan) console.log(`  - ${step.label}`);
  if (dryRun) {
    console.log('Dry run: nothing was written.');
    return;
  }
  const sync = plan.length > 0 || aquariumIds.size > 0 ? await loadSync() : null;
  for (const step of plan) await step.apply();
  for (const aquariumId of aquariumIds) {
    await sync?.syncAquariumAuthorization({ firestore: services.firestore, database: services.database }, aquariumId);
  }
  console.log(`Applied ${plan.length} step(s); re-synced ${aquariumIds.size} RTDB access mirror entr${aquariumIds.size === 1 ? 'y' : 'ies'}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
