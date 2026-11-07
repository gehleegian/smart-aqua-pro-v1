// Operator-only tool. Never import this into the website or run it on an ESP32.
import { parseArgs } from 'node:util';
import { open, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, basename, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp, deleteApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const { values } = parseArgs({ options: {
  project: { type: 'string' }, 'device-id': { type: 'string' },
  'device-uid': { type: 'string' }, out: { type: 'string' },
  apply: { type: 'boolean', default: false }, 'confirm-project': { type: 'string' },
} });
let app;
try {
  const deviceId = values['device-id']?.toUpperCase();
  const deviceUid = values['device-uid'];
  if (!values.project || !/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(deviceId || '') ||
    !/^[A-Za-z0-9_-]{1,128}$/.test(deviceUid || '')) {
    throw new Error('Provide --project, --device-id SAQ-XXXX-XXXX, and --device-uid.');
  }
  if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error('This operator command is for explicit live provisioning; emulator tests use isolated fixtures.');
  }
  if (!values.apply) {
    console.log(`PLAN ONLY: register ${deviceId} for existing Auth UID ${deviceUid} in ${values.project}.`);
    console.log('Creates one private registry entry and UID binding. Does not assign an owner, issue ESP32 login credentials, or alter samples.');
    console.log('Use --apply --confirm-project <project> --out <private-file-outside-repository> after review.');
  } else {
    if (values['confirm-project'] !== values.project || !values.out) throw new Error('Explicit project confirmation and a private output path are required.');
    // Resolve parent symlinks before checking that secrets stay outside the repo.
    const output = resolve(await realpath(dirname(resolve(values.out))), basename(values.out));
    const root = await realpath(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
    const relation = relative(root, output);
    if (relation !== '..' && !relation.startsWith(`..${sep}`) && !isAbsolute(relation)) {
      throw new Error('The private output must be outside this repository.');
    }
    app = initializeApp({ projectId: values.project, credential: applicationDefault() });
    const device = await getAuth(app).getUser(deviceUid);
    if (device.disabled || device.customClaims?.principalType !== 'device') {
      throw new Error('The existing Auth identity must be enabled with principalType=device.');
    }
    const db = getFirestore(app);
    const registry = db.doc(`device_registry/${deviceId}`);
    const binding = db.doc(`device_uid_registry/${deviceUid}`);
    const aquariumId = db.collection('aquariums').doc().id;
    // Exclusive creation avoids overwriting an earlier registration manifest.
    const file = await open(output, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify({ projectId: values.project, deviceId, deviceUid,
        aquariumId }, null, 2));
    } finally { await file.close(); }
    await db.runTransaction(async tx => {
      const [existing, existingBinding] = await tx.getAll(registry, binding);
      if (existing.exists || existingBinding.exists) throw new Error('Device ID or Auth UID is already registered. Nothing was overwritten.');
      tx.create(registry, { deviceUid, aquariumId, state: 'unclaimed',
        schemaVersion: 1, createdAt: new Date().toISOString() });
      tx.create(binding, { deviceId });
    });
    console.log(`Registered ${deviceId}. Registration information saved to ${output}.`);
    console.log('Do not share the file publicly. No aquarium owner has been assigned.');
  }
} catch (error) {
  // Never print credentials or tokens.
  console.error('Provisioning stopped:', error instanceof Error ? error.message : 'Unknown error');
  console.error('If an output file was created before a failure, keep it private; it is not proof of successful registration.');
  process.exitCode = 1;
} finally { if (app) await deleteApp(app); }
