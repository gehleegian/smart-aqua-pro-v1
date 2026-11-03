# Email-verification compatibility policy

Status: local implementation only; not deployed

## Authorization contract

Firebase Authentication remains the authority for whether an email was actually
verified. Backward compatibility is represented separately in the trusted
Firestore document:

```text
authorization_user_policies/{uid}
  emailVerificationRequired: boolean
  policyVersion: 1
  source: registration-default | approved-legacy-cutoff
  createdAt / updatedAt: server timestamps
```

The effective protected-access condition is:

```text
authenticated
AND not revoked
AND (email_verified == true OR emailVerificationRequired == false)
AND the existing role, ownership, and resource checks pass
```

Only an explicit `false` is an exemption. A missing document, missing field, or
invalid value means verification is required. Clients may read their own policy
to route the UI, but no client can create, update, or delete a policy. The RTDB
mirror copies only the effective boolean alongside the trusted role.

New `users/{uid}` documents cause the trusted synchronization trigger to create
the policy with `emailVerificationRequired: true` if it is absent. Duplicate and
out-of-order synchronization reads preserve an existing explicit `false`.

## Legacy boundary and migration status

The accepted outline and repository profiles do not provide a trustworthy
email-verification rollout date. Profile `createdAt` values are client supplied,
so they are not sufficient migration evidence. The recommended boundary is a
reviewed UTC cutoff applied to Firebase Authentication `metadata.creationTime`.

No production inventory or migration was run. Consequently:

- safely classified production legacy accounts: not measured
- ambiguous production accounts: not measured
- approved rollout cutoff: missing; project owner approval required
- production policy records written: zero

The local migration utility is dry-run-first and refuses anything except local
Auth and Firestore emulators with a `demo-*` project ID. It never changes the
Firebase Auth `emailVerified` property and does not log email addresses.

```powershell
cd C:\new\smart-aqua-pro-v1
$env:FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9099"
$env:FIRESTORE_EMULATOR_HOST = "127.0.0.1:8080"
$env:GCLOUD_PROJECT = "demo-smartaqua-auth-compat"
npm.cmd run dev:plan-legacy-policy -- --cutoff=2026-10-20T00:00:00.000Z
```

After reviewing the aggregate report, `--apply` writes exemptions only to the
local emulator. It must not be used as a production migration command.

## Rollout and rollback prerequisites

Before deployment, an administrator must export or inventory Firebase Auth
creation metadata, approve the cutoff and ambiguous-account decisions, review a
UID-only migration manifest, and back up existing policy records. Apply legacy
policy records before enforcing the updated rules. Then deploy backend sync,
rules, and clients in a reviewed maintenance sequence.

Rollback must restore the prior policy snapshot and prior matching rules and
clients together. Removing a policy fails closed for unverified accounts; it is
not a safe standalone rollback. Revocation blocks always take precedence over
an exemption.
