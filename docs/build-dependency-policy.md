# Web build warning cleanup

This change affects the root web dependency tree and build configuration only.
No Firebase rules, deployed functions, application thresholds, roles, credentials,
database records, or mobile dependencies are changed.

## Runtime and npm configuration

The root package now pins Node `22.x`, matching the tested local runtime and
the existing Cloud Functions runtime. Vercel honors this package engine; it avoids
running the app on an untested moving Node major that deprecates tooling's
`module.register()` usage. Runtime warnings are not globally suppressed.

Vercel's install and build commands remove the obsolete `npm_config_cache_dir`
environment option (including uppercase/hyphen variants) before starting npm.
The valid `npm_config_cache` option and the rest of the build environment remain
unchanged. The `env -u` wrapper is for Vercel's Linux environment, not a replacement
for developers' normal `npm ci` / `npm run build` commands on Windows.

## Install scripts

The locked tree has install scripts only for `@firebase/util` (two versions) and
`protobufjs`. They are explicitly denied in `package.json#allowScripts`. Vercel
also uses `npm ci --ignore-scripts` so the policy applies to older npm releases
that do not implement `allowScripts`.

Reviewed behavior:

- Firebase utility postinstall optionally fetches/injects auto-configuration from
  `FIREBASE_WEBAPP_CONFIG`. This app instead supplies explicit Firebase client
  settings in `src/firebase.ts` and `next.config.mjs`; no automatic injection is
  needed. Default stub files are shipped in the published package.
- Protobuf postinstall checks its dependency's version-prefix convention and
  emits a warning. It is not needed to generate the installed protobuf runtime.

Do not blanket-approve new scripts. The regression test fails if an updated
lockfile adds an unreviewed install script. In that case, review the script,
native-binary requirements, and build impact before changing this policy.

## Dependency fixes

Non-forced compatible updates address the root lockfile's audit findings.
Firebase Admin `14.5.1` and Firestore `9.4.1` remove the old Firestore API/GAX chain
that pulled in deprecated, vulnerable `glob` and `rimraf` packages.

TypeScript ESLint's current minimatch range does not include a patched release
for [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
A deliberately scoped override uses `minimatch@11.0.8` only beneath
`@typescript-eslint/typescript-estree`; the matcher API, parser and full lint
checks must pass. Remove the override when the upstream parser adopts a patched
range. Other major dependency versions are not forced or downgraded.

One upstream deprecation remains: Google fetch dependencies still require
`node-domexception`. Its latest published version is also deprecated. Do not
substitute an incompatible shim or hide the install log to claim a warning-free
build. Revisit when the upstream fetch chain removes that dependency.

## Verification and deployment

Run a clean `npm ci --ignore-scripts`, root npm audit, the web unit suite,
TypeScript, ESLint and the production Next.js build. Regression tests live in
`tests/unit/build-dependency-policy.test.mjs`. These are software/build checks,
not authenticated-browser, push-delivery or physical hardware verification.

The changes require a web redeployment to affect Vercel. They do not require
a Firebase deployment, database migration or new mobile APK. After deployment,
confirm Node 22 in Vercel's logs and verify that project-level build-command
overrides have not bypassed `vercel.json`. Existing public VAPID settings remain
in Vercel and are neither hardcoded nor changed by this work.

Local verification on 15 November 2026:

- Clean `npm ci --ignore-scripts` succeeded; its only deprecation notice was
  the upstream `node-domexception` dependency described above.
- Root `npm audit`: zero findings, including development dependencies.
- All 490 web unit tests passed, including six new dependency-policy checks.
- TypeScript and ESLint passed with no warnings.
- Next.js production build with `--webpack` passed on Node 22.23.3. Vercel's
  Linux command wrapper and default Turbopack build still require verification
  in a new Vercel deployment; this work has not pushed or deployed anything.
- The cross-repository palette check initially failed because the clean local
  mobile checkout was four published main commits behind. Fast-forwarding it
  to the existing published `5dbbbe3` commit resolved that test without editing
  either application's theme as part of this dependency cleanup.
