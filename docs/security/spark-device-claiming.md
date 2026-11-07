# Spark-compatible device claiming

Status: implemented locally; live registration, rule deployment, Vercel setup,
and ESP32 login/integration are separate steps. No live data was changed by the
implementation or emulator tests. Existing sample aquariums are not migrated.

## Customer experience

1. Sign into a User account with verified email, or the existing trusted legacy
   verification exemption.
2. Open Aquariums > Add aquarium.
3. Enter only the unique enclosure ID printed on the device. No separate claim code is required.
4. Complete the existing aquarium profile and save.
5. The server claims the device for that authenticated user and enables only its
   reserved aquarium. Repeating the request resumes setup, not a second aquarium.

The user explicitly chose **ID-only, first-eligible-account claiming**. Knowing
an unclaimed ID is sufficient to claim it; the system does not prove physical
possession. Keep IDs private until registration. Existing ownership, identity,
email-policy, security-block and per-account rate-limit checks remain enforced.
A different user cannot take an already-claimed device just by entering its ID.

IDs are trimmed and uppercased, and must match `SAQ-XXXX-XXXX` (letters/digits).
The request contains only `deviceId` and `profile`; obsolete extra claim-code
fields are rejected, not silently used as authority. Device sign-in credentials
remain private firmware configuration and are not entered by customers.

The operator tool no longer generates codes or hashes. Legacy `claimCodeHash`
fields, if present, are ignored; this change does not delete or migrate live data.

## Deployment is not needed first

The existing Next.js app provides `POST /api/devices/claim`. It can run locally
with `npm run dev`, and later as a Node.js route on Vercel. Firebase continues
to hold Auth, Firestore and RTDB on Spark, within their quotas. This route does
not require deploying a Firebase Cloud Function. Vercel has its own limits and
billing conditions; this does not promise unlimited or permanently free hosting.

References: [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers),
[Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Firestore transactions](https://firebase.google.com/docs/firestore/manage-data/transactions).

## Data and permissions

| Record | Purpose | Client access |
| --- | --- | --- |
| `device_registry/{deviceId}` (Firestore) | Reserved aquarium ID, device Auth UID, owner and setup state | None |
| `device_uid_registry/{deviceUid}` (Firestore) | Prevents registering one Auth identity under several IDs | None |
| `device_claim_limits/{sha256(userUid)}` (Firestore) | Ten attempts per minute per authenticated account | None |
| `aquariums/{aquariumId}` (Firestore) | Existing owner-scoped profile plus immutable device ID/UID | Existing authorized reads/edits; direct client create denied |
| `aquarium_directory/{aquariumId}` (Firestore) | Existing safe directory projection | Existing rules |
| `authorization/users/{uid}` (RTDB) | Existing trusted User role and email policy mirror | Server-written |
| `authorization/aquariums/{aquariumId}` (RTDB) | Existing owner/state/device allowlist | Server-written |

No alternative telemetry or command tree is introduced. Firmware continues to
use `devices/{aquariumId}/telemetry`, `control`, and `commands/latest` under the
existing interface contract. Only the assigned device UID may write telemetry;
only the authorized owner may issue the supported commands. Device UID and
aquarium ID are chosen by trusted provisioning, never accepted from the client.

The endpoint verifies a non-revoked Firebase ID token and enabled Auth identity;
rejects device principals, Admin profiles, missing User profiles and security
blocks; applies the existing email policy; validates every profile field; bounds
the actual HTTP body to 32 KiB; and denies cross-origin browser requests.
It never logs tokens, request bodies or SDK exceptions.

Native mobile uses the same endpoint, with
`EXPO_PUBLIC_SMARTAQUA_API_URL=https://your-web-domain`. Development native devices
can use an HTTP LAN URL while `__DEV__` is true. A phone's `localhost` is the
phone, not the development computer. Expo Web on a different origin is not
enabled: it requires a reviewed explicit CORS allowlist or a same-origin proxy.
Do not solve this with wildcard CORS.

## Failure recovery and concurrency

Firestore and RTDB do not share a transaction. This is a resumable coordination
protocol, **not an atomic transaction across both databases**:

1. A Firestore transaction reserves an unclaimed device for one user, creates the
   profile/directory, and adds a temporary aquarium security block.
2. RTDB access is staged as `transitioning` for that exact user and device.
3. Another Firestore transaction rechecks the owner/security policy, marks the
   registry `activating`, and removes only this claim's temporary block.
4. Trusted User authorization is mirrored; RTDB activation uses compare-and-set
   checks and never overwrites revoked or unrelated authorization.
5. Firestore ownership/security is rechecked and the registry becomes `claimed`.
   If this last check fails, the coordinator attempts to revoke only its own
   active grant, preserving another operation's changes.

The same account and enclosure ID may retry interrupted setup. Another owner cannot take it,
and retries never overwrite the first profile. Revoked access is not restored
by retrying. Foreign security blocks are not removed. A revoked/conflicted claim
requires trusted operator review; do not reset it to `unclaimed`, delete a
security block, or rewrite authorization to force success.

There can be a brief interval between final access activation and the last
Firestore security check. Existing trusted revocation operations must revoke
RTDB access as well as block Firestore; a manual change to only one database is
not a complete revocation. Permanent backend outages require operator recovery,
not a promise that every failure repairs itself automatically.

## Local verification

Requires Node 22+, Java 21+, Firebase CLI and dependencies in the web project.
Tests use `demo-*` project IDs and require all named emulators; no service key
or production credentials are needed.

```powershell
npm run test:device-claim-unit
npm run test:device-claim-parity
npm run test:device-claims
npm run test:firestore-rules
npm run test:rtdb-rules
npm run test:aquarium-profile
npm run test:client-contracts
npx tsc --noEmit
npm run build
```

The cross-client enclosure-ID parity test uses the sibling `smart-aqua-mobile`
checkout, as the existing monitoring parity tests do. For a web-only checkout,
run the other tests or provide that sibling repository.

The emulator suite exercises competing users, same-user retries, interruptions
at each stage, revocation, blocks, private-record isolation, token verification,
HTTP errors and body limits. Any telemetry-shaped values in security tests are
isolated test fixtures; setup does not fabricate or upload sensor readings.

On the current Windows machine, Turbopack's CSS child process selected a Node
version-manager shim with no active version. `npx next build --webpack` is a local
build fallback; fix the active Node installation before relying on the default
build. Do not change production credentials to troubleshoot a build problem.

## Provision Aquarium 1, after review

The existing Auth identity is `esp32-SAQ-7K3M-9R2X`, enclosure ID
`SAQ-7K3M-9R2X`, in project `practice-smartaqua`. Creating that Auth identity did
not by itself create this registry or assign a customer.

The provisioning tool is dry-run by default:

```powershell
npm run device:provision -- --project practice-smartaqua --device-id SAQ-7K3M-9R2X --device-uid esp32-SAQ-7K3M-9R2X
```

Only after approval, use the existing external key through
`GOOGLE_APPLICATION_CREDENTIALS`, then pass `--apply`,
`--confirm-project practice-smartaqua`, and
`--out C:\Users\marin\firebase-private\aquarium1-registration.json`.
Do not paste private keys or device login credentials into chat, source control or logs.
Protect the private folder with Windows permissions; POSIX file mode alone does
not enforce Windows ACLs.

The tool checks the existing Auth UID is enabled with `principalType=device`,
reserves a stable aquarium ID and refuses to overwrite an existing ID/UID
binding. It saves a registration manifest (project, device ID/UID, aquarium ID)
outside the repository, exclusively creating a new file. It generates no secret
claim code. Keep the manifest private while the ID remains unclaimed. If provisioning fails after file creation, that file is not proof of a
successful registration: inspect registry status before retrying. It does not
assign a customer, issue ESP32 sign-in credentials or modify sample aquariums.

## Controlled live rollout

1. Review the rule changes and emulator results. Keep claiming disabled.
2. Coordinate the web and native-mobile client updates: old clients that create
   profiles directly will correctly fail once the new Firestore rules are live.
3. Deploy reviewed Firestore/RTDB rules explicitly, not all Firebase services.
   Preserve the existing rules for samples and owner operations. Private registry
   collections must remain denied to every client, including Admin clients.
4. Provision the device registry using the reviewed tool; keep the ID private until claimed.
5. Configure the Next server using `.env.claiming.example`. Locally use the
   external credential file; Vercel needs private server environment variables:
   `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_DATABASE_URL`,
   `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`.
   The database URL must point to the matching project's existing database.
6. Use a dedicated least-privilege server service account with the required
   Firestore, RTDB and Firebase Auth read/token-check permissions. Provisioning
   credentials stay operator-side. Never use `NEXT_PUBLIC_`, ship JSON keys in
   the deployment, or grant live credentials to untrusted preview deployments.
7. Set `SMARTAQUA_DEVICE_CLAIMING_ENABLED=true` only after the preceding checks.
   Configure the production domain in Firebase Auth's authorized domains.
8. Set the mobile public API URL. Claim the real device from the intended account
   and verify another account cannot read or control it.
9. Separately provision ESP32 sign-in, install its reserved aquarium ID, then
   verify real telemetry and light/filter command acknowledgements on hardware.

Use hosting-level abuse protection in addition to the per-account limiter; it
does not stop quota abuse by many accounts. App Check enforcement for this new
route is not implemented. Review remaining dependency advisories and deployment
limits before public release. Rate-limit records are one per account, not one
per attempt; there is currently no automatic record-expiration job.

## Scope and remaining work

This implements the requested claiming flow and the project's multi-user
isolation, trusted ownership and web/mobile consistency requirements. It does
not mark sensors calibrated or prove that equipment operates physically.

Existing Cloud Functions for deletion, ownership transfer, authorization sync,
admin mutations and other background features were not migrated by this change.
Those functions still need their own supported hosting/plan strategy. In
particular, do not promise transfer, device resale/reclaim, deletion-driven
release, or background sync on Spark merely because initial claiming now works
without Functions. Claim retries deliberately refuse altered/revoked ownership.

Changed areas: Next API/server coordinator and validation; web/mobile create
forms and services; Firestore create permission; private operator provisioning;
dependencies, tests and configuration documentation. Existing edit/read rules,
sample aquarium data, hardware calibration constants and command formats were
not changed.

## Original implementation verification — 2026-11-05

These results predate the ID-only correction. The revision's results are recorded below.

- Passed: 99 local emulator tests (21 device-claim/HTTP integration cases and
  78 existing Firestore/RTDB rule cases). Includes editing a newly claimed profile
  and owner/assigned-device permissions for all four light/filter state commands.
- Passed: 33 unit, client-contract and web/mobile credential-parity tests.
- Passed: web source/new script/test lint, changed mobile-source lint, mobile
  TypeScript, and the Next production build with `next build --webpack` (including
  web TypeScript). The default Turbopack build encountered the local Node shim
  problem described above; it was not reported as successful.
- Passed: provisioning script syntax and plan-only execution for Aquarium 1.
  The script's live write path was not run against Firebase.
- Compatible dependency audit fixes reduced the earlier findings to 21 moderate
  findings, with no high/critical findings at that audit run. Remaining transitive
  glob/minimatch tooling/Admin-SDK chains need release review; no forced breaking
  dependency downgrade was applied.
- Not verified: browser/native interactive UI walkthrough, Vercel deployment,
  live account claim, ESP32 sign-in, sensor accuracy or actual relay operation.
- No production rules, account assignments, sample records or credentials were
  changed. The new endpoint remains disabled unless explicitly configured.

### Changed-file inventory

Web repository:

- `src/app/api/devices/claim/route.ts`
- `src/server/firebaseAdmin.ts`, `src/server/deviceClaim.ts`, `src/server/claimValidation.ts`
- `src/services/deviceClaimContracts.ts`, `src/services/aquariumService.ts`
- `src/components/aquariums/AquariumFormModal.tsx`, `src/hooks/useAquariumsController.ts`
- `src/types/aquarium.ts`, `src/types/aquariumManagement.ts`, `src/utils/aquariumManagementHelpers.ts`
- `firestore.rules`, `scripts/provision-device.mjs`
- `tests/integration/device-claim.test.mjs`, `tests/integration/device-claim-parity.test.mjs`
- `tests/unit/device-claim-validation.test.mjs`, `tests/firestore/firestore.rules.test.mjs`
- `package.json`, `package-lock.json`, `.gitignore`, `.env.claiming.example`, this guide

Sibling mobile repository:

- `src/components/aquarium-profile-modal.tsx`
- `src/services/firebase-service.ts`
- `src/utils/device-claim.ts`
- `.env.example`

The pre-existing untracked `functions/%LOCALAPPDATA%/` artifact was left alone.

## ID-only correction (requested step 1)

Only local code and documentation are changed in this step. No device registry,
Firebase Auth login, assignment, production rules, private environment settings
or deployment is created/modified. Live setup is still a separate step.

Affected files: public request contract, claim validation/coordinator, HTTP retry
message, web form/types/helpers/controller/service, mobile form/service/validator,
operator provisioning output, unit/parity/integration tests, and this guide.
This implements the requested single-ID experience consistently across web and
mobile, while preserving authorization for already-assigned aquarium data.

### ID-only verification - 2026-11-05

- Passed: 99 local demo-project emulator tests (claim/HTTP integration and
  Firestore/Realtime Database access rules), with no failures or skipped tests.
- Passed: 34 unit, client-contract and web/mobile parity tests, including the
  absence of a claim-code field in both clients and their requests.
- Passed: targeted web/mobile lint, mobile TypeScript, provisioning-script syntax,
  and the web production build using `next build --webpack` (including TypeScript).
- Passed: whitespace checks in both repositories.
- Not performed: browser/native UI walkthrough, live Firebase registration or
  claiming, deployment, ESP32 sign-in, or hardware testing.
- Security tradeoff: an eligible user who knows an unclaimed enclosure ID can
  claim it first. ID-only claiming does not prove physical possession. Existing
  ownership, account-role, security-block and revocation checks remain enforced.
