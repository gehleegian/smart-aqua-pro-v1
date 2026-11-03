import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(
  new URL('../package.json', import.meta.url)
);
const { deleteApp, initializeApp } = requireFromFunctions('firebase-admin/app');
const { getAuth } = requireFromFunctions('firebase-admin/auth');
const { FieldValue, getFirestore } = requireFromFunctions('firebase-admin/firestore');

function readArgument(name) {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length);
}

function requireLocalDemoEnvironment(projectId) {
  const hosts = [
    process.env.FIREBASE_AUTH_EMULATOR_HOST ?? '',
    process.env.FIRESTORE_EMULATOR_HOST ?? '',
  ];
  const local = (host) =>
    /^(127\.0\.0\.1|localhost):\d+$/.test(host) || /^\[::1\]:\d+$/.test(host);

  if (!projectId.startsWith('demo-')) {
    throw new Error('Refusing to continue: project ID must start with demo-.');
  }
  if (!hosts.every(local)) {
    throw new Error(
      'Refusing to continue: Auth and Firestore emulator hosts must point to localhost.'
    );
  }
}

async function listAllUsers(auth) {
  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users);
    pageToken = page.pageToken;
  } while (pageToken);
  return users;
}

async function applyLegacyPolicies(firestore, users, cutoffIso) {
  for (let start = 0; start < users.length; start += 400) {
    const batch = firestore.batch();
    for (const user of users.slice(start, start + 400)) {
      batch.set(firestore.doc(`authorization_user_policies/${user.uid}`), {
        emailVerificationRequired: false,
        policyVersion: 1,
        source: 'approved-legacy-cutoff',
        legacyCutoff: cutoffIso,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();
  }
}

const projectId =
  process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT_ID ?? '';
const cutoffText = readArgument('--cutoff');
const apply = process.argv.includes('--apply');

if (!cutoffText) {
  throw new Error(
    'Provide a reviewed UTC boundary, for example --cutoff=2026-10-20T00:00:00.000Z.'
  );
}

const cutoffMs = Date.parse(cutoffText);
if (!Number.isFinite(cutoffMs)) {
  throw new Error('The --cutoff value must be a valid ISO date-time.');
}

requireLocalDemoEnvironment(projectId);
const cutoffIso = new Date(cutoffMs).toISOString();
const app = initializeApp({ projectId }, `legacy-policy-plan-${Date.now()}`);

try {
  const users = await listAllUsers(getAuth(app));
  const legacy = [];
  let postCutoff = 0;
  let ambiguous = 0;

  for (const user of users) {
    const createdMs = Date.parse(user.metadata.creationTime ?? '');
    if (!Number.isFinite(createdMs)) {
      ambiguous += 1;
    } else if (createdMs < cutoffMs) {
      legacy.push(user);
    } else {
      postCutoff += 1;
    }
  }

  if (apply) {
    await applyLegacyPolicies(getFirestore(app), legacy, cutoffIso);
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'applied-to-local-emulator' : 'dry-run',
        projectId,
        cutoff: cutoffIso,
        accountsInspected: users.length,
        legacyAccountsSafelyClassified: legacy.length,
        postCutoffAccounts: postCutoff,
        ambiguousAccounts: ambiguous,
        policiesWritten: apply ? legacy.length : 0,
      },
      null,
      2
    )
  );
} finally {
  await deleteApp(app);
}
