# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Read `AGENTS.md` first.** It is the project's binding rulebook: manuscript scope, the NORMAL/WARNING/CRITICAL classification, the ban on ML/predictive logic, no invented thresholds or rules, no mock telemetry unless asked, inspect-only requests mean no file edits, and the 10-point completion report. Everything below assumes it and does not repeat it.

## Commands

```bash
npm run dev            # Next.js dev server, http://localhost:3000 (needs .env.local, see .env.example)
npm run build          # production build (also the typecheck for the web app)
npm run lint           # ESLint for the web app
npm run build:functions   # tsc for functions/ -> functions/lib
npm run lint:functions
npm run demo           # emulators + seeded demo data + Next.js (scripts/demo.mjs)
```

Tests use Node's built-in runner (`node --test`), not Jest/Vitest. Every suite has its own `test:*` script in `package.json`; check there before inventing a command.

- **Pure unit tests** (no emulator) import `.ts` sources directly via type stripping. Run one file with:
  `node --experimental-strip-types --test tests/unit/<name>.test.mjs`
  Filter to a single test case with `--test-name-pattern="..."`.
- **Firebase rules / callables / triggers** run inside `firebase emulators:exec` with a dedicated `demo-*` project id each (e.g. `npm run test:firestore-rules`, `npm run test:rtdb-rules`, `npm run test:telemetry-ingest`). Scripts that test `functions/` compile first (`build:functions`) and run the compiled files in `functions/lib/test/`.
- `npm run test:security` is the aggregate security suite (contracts, rules, callables, org access).
- `npm run test:smoke` runs Playwright (`tests/e2e/`) against `scripts/demo.mjs` on port 3100 with emulators only.
- `npm run test:functions-core-parity` must pass whenever shared core code changes (see below).

## Architecture

**Web app (Next.js App Router, but effectively a client-side SPA).** `src/app/page.tsx` renders `AppClient`, which loads `components/layout/Layout.tsx` with `ssr: false`. Layout owns auth state and switches between screens in `src/views/` via a `currentPage` state (persisted in localStorage), not URL routes. The only real server code is `src/app/api/devices/claim/route.ts` (device claiming, using `src/server/` with firebase-admin) and `src/app/invite/[token]`.

Layering inside `src/`: `views/` (screens) → `hooks/use*Controller.ts` (page state/data orchestration) → `services/` (Firebase reads/writes and callable invocations) → `utils/` (pure logic) and `types/`. Firebase client init and emulator wiring live in `src/firebase.ts` (`NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true` to use emulators). `next.config.mjs` maps legacy `VITE_FIREBASE_*` env names to `NEXT_PUBLIC_*` and applies CSP/security headers from `security-headers.mjs`.

**Cloud Functions (`functions/`, separate npm package, Node 22, ESM).** All exports are in `functions/src/index.ts`. Key pieces:
- `telemetryIngest.ts` + `ruleEngine.ts`: RTDB trigger on `devices/{aquariumId}/telemetry` that validates the reading, classifies it, matches rules and writes alerts, recommendations, sampled history and the aquarium condition summary. **This is the authoritative evaluator**; the browser only evaluates as a fallback before the server summary exists.
- `authorizationSync.ts`: mirrors Firestore authorization (org membership, owner/caretaker assignment) into RTDB so database rules can enforce aquarium access.
- `trustedMutations.ts`, `orgAccess.ts`, `ruleAdmin.ts`, `maintenance.ts`, `hardwareSetup.ts`, `reports/`, `notifications.ts`, `scheduledChecks.ts`: callables and triggers for privileged writes. Clients call these rather than writing protected docs directly.

**Shared core, duplicated by design.** `src/utils/monitoringAssessmentCore.ts` holds validation, classification, rule matching and command-status logic. A byte-identical copy lives at `functions/src/shared/monitoringAssessmentCore.ts` (and another in the sibling mobile repo `../smart-aqua-mobile`). After editing the web file, run:
`cp src/utils/monitoringAssessmentCore.ts functions/src/shared/monitoringAssessmentCore.ts`, then `npm run test:functions-core-parity`. `waterLevelProfile.ts`, `waterTrends.ts` and `hardwareInventory.ts` in `functions/src/shared/` are also identical copies of their `src/utils/` files, so keep both sides in sync. (`shared/claimCode.ts` is functions-only, shared with `scripts/provision-device.ts`.)

**Rules and thresholds are data, not code.** They live in Firestore (`species/{id}`, `rules/{id}`) with approval fields; the seed source is `scripts/seed/goldfish-draft.json` (`npm run seed:rules`). Draft (unapproved) config is preview-only and must not produce live classifications, alerts or recommendations. See `docs/rule-engine.md` and `docs/rule-matrix.md`.

**Access model (supersedes the manuscript's two-role model).** Organizations own aquariums. Roles: Platform Admin (`platformAdmin` custom claim, read-only plus suspend and rule approval), Organization Owner (created by claiming a device), and Caretaker (by invite only, scoped by the aquarium's `caretakerIds`). Every permission is enforced in both `firestore.rules` / `database.rules.json` and the callables; UI hiding is never the security boundary. See `docs/access-model.md`.

**Device ↔ cloud contract.** ESP32 firmware (`firmware/Aquarium1Device`, `firmware/Aquarium2Device`) writes telemetry and reads commands in RTDB. `docs/device-contract.md` is the single source of truth for payload shapes; `npm run test:firmware-contract` checks the firmware against it. `src/utils/monitoringSimulator.ts` is a dev-only simulator that never writes to Firebase.

## Docs worth knowing

`docs/` holds the design record: `rule-engine.md`, `access-model.md`, `device-contract.md`, `sensor-semantics.md`, `testing-plan.md`, `deploy.md`, `TEAM-QUICKSTART.md` (current known limitations), and `docs/security/` (per-phase verification reports). Check these before changing related behavior, and update them when a change alters what they describe.
