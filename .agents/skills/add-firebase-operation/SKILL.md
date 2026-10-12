---
name: add-firebase-operation
description: Add or revise authenticated Firebase data operations for Smart Aqua Pro, including Firestore and Realtime Database access that must preserve aquarium isolation, role checks, validation, and the approved data architecture.
---

# Add a Smart Aqua Pro Firebase Operation

Use this skill when a request changes a service, query, mutation, subscription, security rule, or data mapping that uses Firebase.

## Workflow

1. Read `AGENTS.md`, then inspect `src/firebase.ts`, the relevant service and type files, and the matching Firebase security rules before editing.
2. Confirm whether the data belongs in Cloud Firestore or Firebase Realtime Database. Preserve their responsibilities defined in `AGENTS.md`; do not create a duplicate collection, node, or competing model.
3. Trace the existing collection or node name, identifiers, field names, timestamps, and caller expectations. Reuse the current schema unless the user explicitly approves a change.
4. Require an authenticated user for protected operations. Verify administrator privileges or aquarium ownership/assignment before accessing aquarium-specific data; never trust a client-provided aquarium ID by itself.
5. Validate input and sensor data before threshold or rule evaluation. Treat missing, malformed, or impossible readings as data/device errors, not automatically as abnormal water conditions.
6. Keep condition classification (`NORMAL`, `WARNING`, `CRITICAL`) separate from rule-based maintenance recommendations. Do not invent thresholds, prescriptive rules, sensor values, or hardware command formats.
7. Update the corresponding Firebase rule when access behavior changes. Keep client checks and server-enforced rules aligned.
8. Preserve useful error context without exposing secrets. Never commit `.env`, credentials, service-account keys, tokens, or private configuration.
9. Run `npm run lint` and `npm run build`, plus Firebase emulator or rule tests if they exist. Distinguish software verification from behavior that requires physical ESP32, sensor, or equipment testing.

## Completion Notes

Report the files changed, the collection or database nodes affected, authentication and authorization impact, schema impact, checks performed, assumptions, and any remaining hardware verification.
