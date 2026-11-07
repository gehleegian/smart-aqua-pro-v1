// Migration §7·0: convert Gian's PR #8 device registry (live today) to this
// repo's claim-code schema (docs/access-model.md, docs/migration-live.md §7·0).
//
//   npm run build:functions                                                         # reuses the compiled mirror sync
//   node --experimental-strip-types scripts/convert-pr8-registry.ts --dry-run        # emulator (default): plan only
//   node --experimental-strip-types scripts/convert-pr8-registry.ts                  # emulator: apply
//   node --experimental-strip-types scripts/convert-pr8-registry.ts --project <id> --database-url <url> [--dry-run]
//                                                                                    # REAL project: asks you to type the id
//
// Run it AFTER scripts/migrate-orgs.ts (a claimed tank needs its orgId first).
//
// His schema (scripts/provision-device.mjs + src/server/deviceClaim.ts):
//   device_registry/{SAQ-…}     { deviceUid, aquariumId, state, schemaVersion, createdAt (ISO),
//                                 ownerUid?, operationId?, claimedAt? (ISO) }   no claim code
//   device_uid_registry/{uid}   { deviceId }
//   state: unclaimed -> claiming -> activating -> claimed
//
// What it does, per registry doc in his schema (has `state`, no `status`):
//   claimed     -> status 'claimed', orgId (from the tank), claimedBy = ownerUid,
//                  claimedAtMs, claimCodeHash null (his fields, including the ISO claimedAt, unchanged); deviceBindings/{uid} and the
//                  mirror's deviceUids entry if missing; RTDB mirror re-synced (adds orgId).
//                  No code is needed: the device is already someone's.
//   unclaimed   -> status 'unclaimed', a new claim code (HMAC under CLAIM_CODE_PEPPER),
//                  reservedAquariumId = his pre-reserved aquariumId (the ID his firmware
//                  writes to; claimDevice creates the tank under it), aquariumId null,
//                  state 'converted' so his ID-only route can no longer claim it.
//                  The QR label goes to provisioning-output/pr8-conversion/<SAQ-…>/ (gitignored).
//   claiming / activating -> reported and skipped: finish or roll back by hand, with Gian.
// Every converted doc keeps all of his fields and a full copy in `pr8Original`,
// plus convertedFromPr8At. A doc with convertedFromPr8At is never touched again
// (idempotent), so a re-run plans 0 steps and never re-issues a code.
import { createRequire } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateClaimCode, hashClaimCode } from '../functions/src/shared/claimCode.ts';
import { writeClaimLabel } from './lib/claim-label.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getDatabase } = requireFromFunctions('firebase-admin/database');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');

const DEFAULT_EMULATOR_PROJECT = 'demo-smartaqua';
const SAFE_KEY = /^[A-Za-z0-9_-]{1,128}$/;
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const project = flag('--project');
const databaseUrlFlag = flag('--database-url');
const dryRun = args.includes('--dry-run');
const outDir = path.resolve(root, flag('--out') ?? 'provisioning-output/pr8-conversion');

type Data = Record<string, unknown>;
type Step = { label: string; apply: () => Promise<void> };
const isRecord = (value: unknown): value is Data => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);
const millis = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

function readPepper() {
  if (process.env.CLAIM_CODE_PEPPER) return process.env.CLAIM_CODE_PEPPER;
  const file = path.join(root, 'functions/.secret.local');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8').split('\n').find((entry) => entry.startsWith('CLAIM_CODE_PEPPER='));
    if (line) return line.slice('CLAIM_CODE_PEPPER='.length).trim();
  }
  return '';
}

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
      console.log(`About to convert the PR #8 device registry on the REAL project "${projectId}".`);
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
    databaseURL = databaseUrlFlag ?? `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST}?ns=${projectId}-default-rtdb`;
    console.log(`Emulators, project "${projectId}".`);
  }
  const app = initializeApp({ projectId, databaseURL }, 'convert-pr8-registry');
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

/** His schema: a `state` field and no `status` (ours). */
export function isPr8RegistryDoc(data: Data) {
  return typeof data.state === 'string' && data.status === undefined && data.convertedFromPr8At === undefined;
}

async function plan(services: Awaited<ReturnType<typeof connect>>, now: number) {
  const { firestore, database, auth } = services;
  const steps: Step[] = [];
  const warnings: string[] = [];
  const resync = new Set<string>();
  let pepper: string | null = null;
  const registry = await firestore.collection('device_registry').get();
  const bindings = ((await database.ref('deviceBindings').get()).val() ?? {}) as Data;

  for (const doc of registry.docs) {
    const deviceId = doc.id;
    const data = doc.data() as Data;
    if (!isPr8RegistryDoc(data)) continue;
    const deviceUid = text(data.deviceUid);
    const aquariumId = text(data.aquariumId);
    const state = String(data.state);
    if (!deviceUid || !SAFE_KEY.test(deviceUid) || !aquariumId || !SAFE_KEY.test(aquariumId)) {
      warnings.push(`skip device_registry/${deviceId}: deviceUid or aquariumId missing or malformed`);
      continue;
    }
    const uidBinding = await firestore.doc(`device_uid_registry/${deviceUid}`).get();
    if (uidBinding.exists && uidBinding.get('deviceId') !== deviceId) {
      warnings.push(`skip device_registry/${deviceId}: device_uid_registry/${deviceUid} points to ${String(uidBinding.get('deviceId'))}`);
      continue;
    }
    try {
      const device = await auth.getUser(deviceUid);
      if (device.disabled || device.customClaims?.principalType !== 'device') warnings.push(`device_registry/${deviceId}: Auth user ${deviceUid} is disabled or not principalType=device (converted anyway; check before go-live)`);
    } catch {
      warnings.push(`device_registry/${deviceId}: no Auth user ${deviceUid} (converted anyway; the device cannot sign in until it exists)`);
    }
    const original = { ...data };

    if (state === 'claimed') {
      const aquariumSnap = await firestore.doc(`aquariums/${aquariumId}`).get();
      const aquarium = aquariumSnap.data() as Data | undefined;
      const ownerUid = text(data.ownerUid);
      const orgId = text(aquarium?.orgId);
      if (!aquarium || !ownerUid || aquarium.ownerId !== ownerUid) {
        warnings.push(`skip device_registry/${deviceId}: aquariums/${aquariumId} is missing or its ownerId is not ${ownerUid ?? '(none)'}`);
        continue;
      }
      if (!orgId) {
        warnings.push(`skip device_registry/${deviceId}: aquariums/${aquariumId} has no orgId yet; run scripts/migrate-orgs.ts first`);
        continue;
      }
      const boundTo = bindings[deviceUid];
      if (boundTo !== undefined && boundTo !== aquariumId) {
        warnings.push(`skip device_registry/${deviceId}: deviceBindings/${deviceUid} points to ${String(boundTo)}, not ${aquariumId}`);
        continue;
      }
      const mirrorUid = (await database.ref(`authorization/aquariums/${aquariumId}/deviceUids/${deviceUid}`).get()).val();
      const addFields = !text(aquarium.deviceId) || !text(aquarium.deviceUid);
      steps.push({
        label: `claimed ${deviceId} -> status claimed, org ${orgId}, aquarium ${aquariumId} (no code)${boundTo === undefined ? `, write deviceBindings/${deviceUid}` : ''}${mirrorUid !== true ? ', add mirror deviceUids entry' : ''}${addFields ? ', set aquarium deviceId/deviceUid' : ''}`,
        apply: async () => {
          await firestore.runTransaction(async (transaction) => {
            const fresh = await transaction.get(doc.ref);
            if (!isPr8RegistryDoc(fresh.data() ?? {})) return;
            transaction.update(doc.ref, {
              // His claimedAt (ISO string) stays as it is; claimedAtMs is ours.
              status: 'claimed', claimCodeHash: null, orgId, aquariumId, claimedBy: ownerUid,
              claimedAtMs: millis(data.claimedAt), convertedFromPr8At: now, pr8Original: original,
            });
            if (addFields) transaction.update(aquariumSnap.ref, { deviceId, deviceUid });
          });
          await database.ref().update({
            ...(boundTo === undefined ? { [`deviceBindings/${deviceUid}`]: aquariumId } : {}),
            ...(mirrorUid !== true ? { [`authorization/aquariums/${aquariumId}/deviceUids/${deviceUid}`]: true } : {}),
          });
        },
      });
      resync.add(aquariumId);
    } else if (state === 'unclaimed') {
      const reservedTaken = (await firestore.doc(`aquariums/${aquariumId}`).get()).exists;
      if (reservedTaken) {
        warnings.push(`skip device_registry/${deviceId}: unclaimed, but aquariums/${aquariumId} already exists`);
        continue;
      }
      pepper ??= readPepper();
      if (!pepper) {
        warnings.push(`skip device_registry/${deviceId}: CLAIM_CODE_PEPPER is not set (env, or functions/.secret.local); it must equal the deployed functions secret`);
        continue;
      }
      const usedPepper = pepper;
      steps.push({
        label: `unclaimed ${deviceId} -> status unclaimed with a new claim code, reservedAquariumId ${aquariumId}; label in ${path.relative(root, outDir)}/${deviceId}/`,
        apply: async () => {
          const claimCode = generateClaimCode();
          // The label first: if the update below fails, a re-run writes a new label and code.
          await writeClaimLabel(outDir, deviceId, claimCode);
          await firestore.runTransaction(async (transaction) => {
            const fresh = await transaction.get(doc.ref);
            if (!isPr8RegistryDoc(fresh.data() ?? {})) throw new Error(`device_registry/${deviceId} changed while converting; re-run the dry run`);
            transaction.update(doc.ref, {
              status: 'unclaimed', claimCodeHash: hashClaimCode(usedPepper, deviceId, claimCode),
              orgId: null, aquariumId: null, reservedAquariumId: aquariumId, claimedBy: null, claimedAt: null,
              state: 'converted', convertedFromPr8At: now, pr8Original: original,
            });
          });
        },
      });
    } else {
      warnings.push(`skip device_registry/${deviceId}: state "${state}" is a claim in progress; finish or undo it with Gian, then re-run`);
    }
  }
  for (const doc of (await firestore.collection('device_uid_registry').get()).docs) {
    const deviceId = text(doc.get('deviceId'));
    if (!deviceId || !registry.docs.some((item) => item.id === deviceId)) warnings.push(`device_uid_registry/${doc.id} points to a missing registry doc (${deviceId ?? 'none'}); left unchanged`);
  }
  return { steps, warnings, resync };
}

async function main() {
  const services = await connect();
  const { steps, warnings, resync } = await plan(services, Date.now());
  // Warnings are part of the plan the operator reads, so they go to stdout.
  for (const warning of warnings) console.log(`  ! ${warning}`);
  console.log(`Conversion plan: ${steps.length} step(s).`);
  for (const step of steps) console.log(`  - ${step.label}`);
  if (dryRun) {
    console.log('Dry run: nothing was written.');
    return;
  }
  const sync = resync.size > 0 ? await loadSync() : null;
  for (const step of steps) await step.apply();
  for (const aquariumId of resync) await sync?.syncAquariumAuthorization({ firestore: services.firestore, database: services.database }, aquariumId);
  console.log(`Applied ${steps.length} step(s); re-synced ${resync.size} RTDB access mirror entr${resync.size === 1 ? 'y' : 'ies'}.`);
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  },
);
