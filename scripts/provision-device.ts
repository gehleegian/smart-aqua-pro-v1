// Step 0 of the claim flow: create a device identity and its claim code.
//
//   node --experimental-strip-types scripts/provision-device.ts                 # 1 device, emulator (default)
//   node --experimental-strip-types scripts/provision-device.ts --count 2       # 2 devices, emulator
//   node --experimental-strip-types scripts/provision-device.ts --project <id>  # a REAL project: asks you to type the id
//
// For each device it:
//   1. generates a deviceId (SAQ-XXXX-XXXX, the live style) and an 8-character
//      claim code without ambiguous characters (no 0/O, 1/I/L);
//   2. creates the device's Firebase Auth account, uid esp32-<deviceId>, the
//      same uid pattern as the live esp32-SAQ-7K3M-9R2X, and sets the custom
//      claims { principalType: 'device', deviceId };
//   3. stores device_registry/{deviceId} with claimCodeHash = HMAC-SHA256 of the
//      code under CLAIM_CODE_PEPPER, status 'unclaimed';
//   4. writes, all gitignored:
//        provisioning-output/<deviceId>/qr.png     smartaqua://claim?d=<deviceId>&c=<code>
//        provisioning-output/<deviceId>/label.svg  printable label (QR + plain-text ID and code)
//        firmware/secrets/<deviceId>.h             the device's login credentials
//
// Pepper: env CLAIM_CODE_PEPPER, or CLAIM_CODE_PEPPER=... in functions/.secret.local
// (the file the Functions emulator reads). It must equal the deployed functions
// secret, or no code will ever match. Never commit it, never print it.
//
// The code and the device password are printed to nothing but those files.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimUri,
  deviceUidFor,
  generateClaimCode,
  generateDeviceId,
  hashClaimCode,
} from '../functions/src/shared/claimCode.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const requireFromFunctions = createRequire(path.join(root, 'functions/package.json'));
const requireFromRoot = createRequire(path.join(root, 'package.json'));
const { initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
const QRCode = requireFromRoot('qrcode');

const DEFAULT_EMULATOR_PROJECT = 'demo-smartaqua';
const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
};
const project = flag('--project');
const count = Number(flag('--count') ?? 1);
const outDir = path.resolve(root, flag('--out') ?? 'provisioning-output');
const secretsDir = path.resolve(root, 'firmware/secrets');
if (args.includes('--project') && !project) {
  console.error('--project needs a project id.');
  process.exit(1);
}
if (!Number.isInteger(count) || count < 1 || count > 50) {
  console.error('--count must be 1 to 50.');
  process.exit(1);
}

function readPepper() {
  if (process.env.CLAIM_CODE_PEPPER) return process.env.CLAIM_CODE_PEPPER;
  const file = path.join(root, 'functions/.secret.local');
  if (existsSync(file)) {
    const line = readFileSync(file, 'utf8').split('\n').find((entry) => entry.startsWith('CLAIM_CODE_PEPPER='));
    if (line) return line.slice('CLAIM_CODE_PEPPER='.length).trim();
  }
  return '';
}

function escapeXml(value: string) {
  return value.replace(/[<>&"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

async function labelSvg(deviceId: string, claimCode: string) {
  const qr: string = await QRCode.toString(claimUri(deviceId, claimCode), { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
  const qrBody = qr.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
  const viewBox = /viewBox="([^"]+)"/.exec(qr)?.[1] ?? '0 0 33 33';
  const grouped = `${claimCode.slice(0, 4)} ${claimCode.slice(4)}`;
  // 62 x 29 mm: a common thermal label size.
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="62mm" height="29mm" viewBox="0 0 620 290">
  <rect width="620" height="290" fill="#ffffff"/>
  <svg x="10" y="10" width="270" height="270" viewBox="${viewBox}">${qrBody}</svg>
  <g font-family="Helvetica, Arial, sans-serif" fill="#0f172a">
    <text x="300" y="58" font-size="26" font-weight="700">SmartAqua Pro</text>
    <text x="300" y="104" font-size="18" fill="#475569">Device ID</text>
    <text x="300" y="136" font-size="28" font-family="Menlo, Consolas, monospace">${escapeXml(deviceId)}</text>
    <text x="300" y="182" font-size="18" fill="#475569">Claim code</text>
    <text x="300" y="218" font-size="34" font-weight="700" font-family="Menlo, Consolas, monospace">${escapeXml(grouped)}</text>
    <text x="300" y="262" font-size="15" fill="#475569">Scan in the app: Add device</text>
  </g>
</svg>
`;
}

function firmwareHeader(deviceId: string, email: string, password: string) {
  return `// SmartAqua Pro device credentials for ${deviceId}.
// GENERATED by scripts/provision-device.ts. GITIGNORED: never commit this file.
// The firmware signs in with email/password (Identity Toolkit) and refreshes
// its ID token; see docs/firmware-changes.md section 7.
#pragma once
#define SMARTAQUA_DEVICE_ID "${deviceId}"
#define SMARTAQUA_DEVICE_UID "${deviceUidFor(deviceId)}"
#define SMARTAQUA_DEVICE_EMAIL "${email}"
#define SMARTAQUA_DEVICE_PASSWORD "${password}"
`;
}

async function main() {
  let projectId: string;
  if (project) {
    if (process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST) {
      console.error('Emulator host variables are set; unset them to target a real project.');
      process.exit(1);
    }
    projectId = project;
    console.log(`About to create ${count} device account(s) and registry entries in the REAL project "${projectId}".`);
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Type the project id (${projectId}) to confirm: `);
    rl.close();
    if (answer.trim() !== projectId) {
      console.log('Not confirmed. Nothing was written.');
      process.exit(1);
    }
  } else {
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
    projectId = process.env.GCLOUD_PROJECT || DEFAULT_EMULATOR_PROJECT;
    console.log(`Emulators (auth ${process.env.FIREBASE_AUTH_EMULATOR_HOST}, firestore ${process.env.FIRESTORE_EMULATOR_HOST}), project "${projectId}".`);
  }

  const pepper = readPepper();
  if (!pepper) {
    console.error('CLAIM_CODE_PEPPER is not set (env, or functions/.secret.local). See docs/access-model.md.');
    process.exit(1);
  }

  const app = initializeApp({ projectId }, 'provision-device');
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  mkdirSync(secretsDir, { recursive: true });
  const provisioned: string[] = [];

  for (let index = 0; index < count; index += 1) {
    let deviceId = generateDeviceId();
    while ((await firestore.doc(`device_registry/${deviceId}`).get()).exists) deviceId = generateDeviceId();
    const claimCode = generateClaimCode();
    const uid = deviceUidFor(deviceId);
    const email = `${deviceId.toLowerCase()}@devices.smartaqua.invalid`;
    const password = randomBytes(24).toString('base64url');

    await auth.createUser({ uid, email, password, emailVerified: false, displayName: `Device ${deviceId}` });
    await auth.setCustomUserClaims(uid, { principalType: 'device', deviceId });
    await firestore.doc(`device_registry/${deviceId}`).create({
      claimCodeHash: hashClaimCode(pepper, deviceId, claimCode),
      status: 'unclaimed',
      deviceUid: uid,
      orgId: null,
      aquariumId: null,
      claimedBy: null,
      claimedAt: null,
      createdAt: Date.now(),
    });

    const deviceDir = path.join(outDir, deviceId);
    mkdirSync(deviceDir, { recursive: true });
    await QRCode.toFile(path.join(deviceDir, 'qr.png'), claimUri(deviceId, claimCode), { errorCorrectionLevel: 'M', margin: 2, width: 512 });
    writeFileSync(path.join(deviceDir, 'label.svg'), await labelSvg(deviceId, claimCode));
    writeFileSync(path.join(deviceDir, 'claim.json'), `${JSON.stringify({ deviceId, claimCode, uri: claimUri(deviceId, claimCode) }, null, 2)}\n`, { mode: 0o600 });
    writeFileSync(path.join(secretsDir, `${deviceId}.h`), firmwareHeader(deviceId, email, password), { mode: 0o600 });
    provisioned.push(deviceId);
    console.log(`Provisioned ${deviceId} (uid ${uid}). Label: ${path.relative(root, deviceDir)}/label.svg; credentials: firmware/secrets/${deviceId}.h`);
  }
  console.log(`Done: ${provisioned.length} device(s). Claim codes are only in the label and claim.json files.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
