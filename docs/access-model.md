# SmartAqua Pro: Access Model (Organizations, Device Claiming, Caretakers)

**Status:** implemented and tested on the emulator only (Sprints 3–4, `feat/device-pipeline`). Nothing is deployed. This model replaces the manuscript's two-role Admin/User model; §1–§5 are written so the team can paste them into Chapter 2.

---

## 1. Roles

SmartAqua Pro has three roles. An account can hold a different role in different organizations.

| Role | How someone gets it | Scope |
|---|---|---|
| **Platform Admin** | The existing `Admin` account role, mapped to the `platformAdmin: true` Firebase Auth custom claim | The whole system, **read-only**, plus suspending and reactivating organizations and user accounts |
| **Organization Owner** | Signs up on their own. Their **first successful device claim creates their organization** (a personal one named after them, or a name they type such as "Davao Pet Shop"). An owner can also **promote a caretaker to co-owner** (Sprint 4) | Every aquarium in their organization, its profiles, thresholds, schedules and team. An org can have several owners and **always keeps at least one** |
| **Caretaker** | **Only** by accepting an Owner's invite link | Only the aquariums the Owner assigned to them |

A new account that has no organization and no accepted invite can access nothing. The app shows two ways in: **Add your first device** or **Waiting for an invite**. Open sign-up is therefore safe.

A **caretaker may also claim a device of their own.** That always creates or uses *their own* organization, where they are the owner. A caretaker can never claim into the org they care for; adding devices there stays owner-only.

An **organization** is the unit of ownership and isolation. An aquarium belongs to exactly one organization, and data from different organizations is never mixed.

## 2. Permission matrix

✅ allowed · ❌ denied · "assigned" means the aquarium lists the caretaker in `caretakerIds`.

| Action | Platform Admin | Owner | Caretaker | No organization |
|---|---|---|---|---|
| View organization list (all orgs) | ✅ | ❌ | ❌ | ❌ |
| Suspend or reactivate an organization | ✅ (audited) | ❌ | ❌ | ❌ |
| Create an organization or assign devices | ❌ | ✅ by claiming a device | ❌ | ✅ first claim creates one |
| Claim (add) a device | ❌ | ✅ | ❌ into the org they care for; ✅ into their own org | ✅ |
| View aquarium profile, live readings, history | ✅ all (read-only) | ✅ every tank in the org | ✅ assigned tanks | ❌ |
| View alerts, recommendations, maintenance, reports | ✅ all (read-only) | ✅ | ✅ assigned tanks | ❌ |
| Mark alert read; apply or dismiss a recommendation | ❌ | ✅ | ✅ assigned tanks | ❌ |
| Log maintenance (`logMaintenance`) | ❌ | ✅ | ✅ assigned tanks | ❌ |
| Read maintenance history and command log | ✅ all (read-only) | ✅ | ✅ assigned tanks | ❌ |
| Receive push alerts for a tank | ❌ | ✅ every tank (per prefs) | ✅ assigned tanks (per prefs) | ❌ |
| Send a device command (feed now, light, filter) | ❌ | ✅ | ✅ assigned tanks | ❌ |
| Edit profile, thresholds, setup | ❌ | ✅ | ❌ | ❌ |
| Edit schedules and automation (`control`) | ❌ | ✅ | ❌ | ❌ |
| Invite, reassign or remove caretakers | ❌ | ✅ | ❌ | ❌ |
| Promote to co-owner, demote, or remove an owner (≥1 owner kept) | ❌ | ✅ | ❌ | ❌ |
| Read the org's audit log | ✅ all orgs, plus security events | ✅ own org | ❌ | ❌ |
| Edit and approve rules and species defaults | ✅ (audited) | ❌ | ❌ | ❌ |

Every row is enforced twice: once by Firestore and Realtime Database **security rules** (tested in the emulator), and once by the **callables** that perform the change. The app only hides controls; it is never the security boundary.

A **suspended organization** is locked out completely: its Owner, its Caretakers and its devices. Its members can still read the organization document, so the app can say it is suspended. Reactivating it restores access without re-inviting anyone.

## 3. Claiming a device (Owner)

```
Provisioning (factory/team)        Owner (app)                         Server (claimDevice callable)
──────────────────────────         ───────────                         ─────────────────────────────
provision-device.ts                1. Wi-Fi setup: join the
 • deviceId SAQ-XXXX-XXXX             SmartAqua-XXXX hotspot,
 • 8-char claim code                  pick home Wi-Fi (firmware)
 • device Auth account             2. Scan the label QR
 • registry: unclaimed,               smartaqua://claim?d=…&c=…
   HMAC(code) only                    (or type ID + code)
 • QR label printed                3. Name the tank; on the first  ──►  verified email · ≤5 failed tries/hour
                                      claim, optionally name the        device exists · code matches (HMAC,
                                      organization                      constant-time) · status unclaimed
                                                                        ONE Firestore transaction:
                                                                          create org + owner membership (first claim)
                                                                          create aquarium (status "setup")
                                                                          registry → claimed
                                                                          audit log
                                                                        then RTDB: deviceUids, deviceBindings,
                                                                        access mirror
                                   4. Setup wizard (Owner only):
                                      name · L×W×H → volume (working
                                      volume editable, warned if far
                                      off) · filter type/capacity ·
                                      species · fish count + weights
                                      with live bioload preview ·
                                      threshold review ("Custom"
                                      badges) · Finish → status "active"
```

- **Superseded alternative:** PR #8's ID-only `/api/devices/claim` route (`docs/security/spark-device-claiming.md`) is kept as reference and is not used by the app.
- **Claim codes** never exist in the database. Only `HMAC-SHA256(pepper, deviceId:code)` is stored, and the pepper is a Cloud Functions secret (`CLAIM_CODE_PEPPER`) that is never in git.
- **Errors** are shown in plain words: "Invalid code" (wrong code *or* unknown device, deliberately the same), "Already registered, contact the owner", "Too many attempts. Try again in an hour", "This organization is suspended".
- **Retry is safe.** Claiming the same device again as the same Owner finishes any unfinished step and returns the same aquarium.
- Firestore and the Realtime Database cannot share one transaction. The Firestore part is atomic; the RTDB part follows and is idempotent.

## 4. Inviting and removing caretakers (Owner)

**Invite:**
1. The Owner enters the caretaker's email and ticks the tanks they may see (Team page).
2. `createInvite` creates a random 256-bit token and stores **only its SHA-256 hash**, valid for 48 hours. It returns a link `/invite/<token>`.
3. **No email is sent** in this version. The Owner copies the link and shares it (Messenger, SMS…).

**Accept:**
1. The caretaker opens the link, then signs up or logs in. The app keeps the token on that device while they verify their email.
2. `acceptInvite` checks that the token exists, is unused, not revoked and not expired, and that the caller's **verified** email equals the invited email.
3. In one transaction it adds the caretaker membership, adds them to each tank's `caretakerIds`, marks the invite used and writes an audit log.
4. The RTDB access mirror is then updated.

**Offboarding:**
- **Reassign** (`updateCaretakerAssignments`) sets exactly which tanks a caretaker sees.
- **Remove** (`removeMember`) deletes the membership and takes the caretaker off every tank. Access ends **immediately**: Firestore at the commit, and the RTDB mirror before the call returns. Their past actions (commands, applied recommendations, audit entries) stay in the logs.
- **Revoke** (`revokeInvite`) cancels a pending link.
- An organization always keeps at least one Owner (§4a).

## 4a. Co-owners (Sprint 4)

`setMemberRole({ orgId, uid, role })` (Owner only):
- **Promote** a caretaker to `owner`. They see and manage every tank, and their tank assignments are cleared.
- **Demote** an owner to `caretaker`. They start with no tanks until an owner assigns some.

`removeMember` now also removes an owner.

**Both refuse anything that would leave the org with no owner** (`failed-precondition`, "An organization must keep at least one owner").

**Primary owner.** Each aquarium keeps one `ownerId`: the legacy single-owner field the RTDB mirror and older clients use. When the member losing owner rights is a tank's `ownerId`, the tank moves to the acting owner, or to another remaining owner when owners change their own role. The audit log records `movedAquariumIds`.

**Access.**
- Firestore rules already grant every `owner` member.
- The RTDB mirror gets `coOwnerUids { uid: true }` (all owners except `ownerUid`), and the RTDB rules accept it wherever they accept `ownerUid`.
- The mirror is re-synced before the callable returns, so a promotion or demotion takes effect at once.

Every change is audited: `member.promote`, `member.demote`, `member.remove`.

## 5. Why there is an access mirror in the Realtime Database

Realtime Database rules cannot read Firestore. Live readings and device commands live in the Realtime Database, so the access decision is copied there by Cloud Functions only:

```
authorization/aquariums/{aquariumId}
  ownerUid:      <owner uid>
  orgId:         <organization id>
  caretakerUids: { <uid>: true, … }   only caretakers who are still members
  coOwnerUids:   { <uid>: true, … }   the org's other owners (Sprint 4)
  state:         active | suspended | revoked | transitioning
  deviceUids:    { esp32-SAQ-XXXX-XXXX: true }
deviceBindings/{deviceUid}: aquariumId           the device reads only its own entry
```

- The mirror is rewritten by the existing `syncAquariumAuthorization` after every claim, invite acceptance, reassignment, removal and suspension. A Firestore trigger and a daily reconciliation keep it consistent if a write ever bypasses the callables.
- A uid left in `caretakerIds` without a membership gets no access.
- Clients can neither read nor write `authorization/`.

## 6. Data model (Firestore, camelCase)

| Path | Fields | Written by |
|---|---|---|
| `organizations/{orgId}` | name, type (`personal`\|`business`), status (`active`\|`suspended`), createdBy, createdAt | functions |
| `organizations/{orgId}/members/{uid}` | uid, role (`owner`\|`caretaker`), joinedAt, invitedBy, email, displayName | functions |
| `aquariums/{id}` | + `orgId`, `caretakerIds[]`, `status` (`setup`\|`active`), `deviceId`, `deviceUid`. `ownerId` is kept for backward compatibility | claim: functions. Profile: Owner |
| `device_registry/{deviceId}` | claimCodeHash, status (`unclaimed`\|`claimed`\|`revoked`), deviceUid, orgId, aquariumId, claimedBy, claimedAt, createdAt | provisioning, functions |
| `invites/{tokenHash}` | orgId, email (lower-case), role `caretaker`, aquariumIds[], tokenHash, expiresAt (48 h), usedAt, usedBy, revokedAt, createdBy, createdAt | functions |
| `audit_logs/{id}` | actor, action, target, orgId, details, at | functions |
| `claim_attempts/{uid}` | failures[] (timestamps, last hour) | functions |
| `maintenance_actions/{id}` | aquariumId, orgId, type, actionType (`cleaning` when it resets the cycle), resetsCleaningCycle, waterChangePercent, notes, performedAt, performedBy, performedByName, performedByRole, recommendationId, ruleId, createdAt | `logMaintenance` |
| `command_logs/{aquariumId}_{commandId}` | aquariumId, orgId, type, state, requestedBy {uid, displayName}, requestedAt, status (`pending`\|`done`\|`failed`\|`no_response`), executedAt, error, source (`app`\|`schedule`) | functions |
| `users/{uid}/fcmTokens/{id}`, `users/{uid}/notificationPrefs/default` | see `docs/notifications.md` | the user |

- **Audit actions:**
  - `device.claim`
  - `invite.create`, `invite.accept`, `invite.revoke`
  - `member.remove`, `member.assignments`, `member.promote`, `member.demote`
  - `maintenance.log`
  - `org.suspend`, `org.reactivate`, `org.migrate`
  - `rule.create|update|approve`, `species.create|update|approve` (with `orgId: null`)
- **Audit viewer (Sprint 4):** owners see their org's log, filterable by action and person. The platform admin sees all orgs plus `security_audit_events`.
- Platform-admin **role** changes keep using the existing `updateUserRoleTrusted` callable, which now also sets or clears the `platformAdmin` claim.
- User suspension keeps using the existing `revokeUserAccount` callable. Both of those write to `security_audit_events`.
- Timestamps on the new documents are epoch milliseconds.

Reads always go through `orgId`. An Owner queries `aquariums where orgId == X`; a Caretaker queries `aquariums where orgId == X and caretakerIds array-contains <uid>`.

## 7. Callables

| Callable | Who | Input |
|---|---|---|
| `claimDevice` | any verified user except a platform admin | `{ deviceId, claimCode, aquariumName, orgName?, orgId? }` |
| `createInvite` | Owner | `{ orgId, email, aquariumIds }` → `{ inviteId, path, expiresAt }` |
| `acceptInvite` | the invited, verified email | `{ token }` |
| `revokeInvite` | Owner | `{ inviteId }` |
| `removeMember` | Owner | `{ orgId, uid }` |
| `updateCaretakerAssignments` | Owner | `{ orgId, uid, aquariumIds }` |
| `setOrganizationStatus` | Platform Admin | `{ orgId, status: 'active'\|'suspended', reason? }` |
| `setMemberRole` | Owner | `{ orgId, uid, role: 'owner'\|'caretaker' }` |
| `logMaintenance` | Owner, assigned caretaker | `{ aquariumId, type, waterChangePercent?, notes?, performedAt, recommendationId? }` |
| `saveRuleConfig` / `approveRuleConfig` | Platform Admin | `{ kind: 'rule'\|'species', id, data }` / `{ kind, id }` |

Sources: `functions/src/orgAccess.ts`, `maintenance.ts`, `commandLog.ts`, `notifications.ts`, `ruleAdmin.ts`. Tests:
- `npm run test:org-access` (callables, including co-owners)
- `test:sprint4-functions` (maintenance, command log, notifications, rules editor)
- `test:firestore-org-rules` and `test:rtdb-org-rules` (isolation)
- `test:migrate-orgs`
- `test:sprint3-e2e` and `test:sprint4-e2e` (full flows on the emulator suite)
- `test:smoke` (Playwright, the app in a browser)

## 8. Operations

**Provision devices:** `npm run provision:device -- --count 2` (emulator by default; `--project <id>` asks you to type the ID).
- It writes labels to `provisioning-output/<deviceId>/` (`qr.png`, `label.svg`, `claim.json`) and credentials to `firmware/secrets/<deviceId>.h`. All of these are gitignored.
- The pepper comes from env `CLAIM_CODE_PEPPER` or `functions/.secret.local`.
- Before go-live, set the secret with `firebase functions:secrets:set CLAIM_CODE_PEPPER`. Codes provisioned with one pepper never match under another.

**Migrate existing data:** `npm run migrate:orgs -- --dry-run`, then without `--dry-run`. See `docs/migration-live.md` step 7.

**Not yet:**
- invite email sending (Sprint 5)
- deleting an organization (future)
- the mobile app (it still queries by `ownerId`, which the new rules deny). It must be updated before go-live (`docs/migration-live.md` §7a).

**Notifications:** see `docs/notifications.md`.

## 9. Reports and Storage (Sprint 5)

- **Who:** a report is generated by an owner or an assigned caretaker of the tank (`generateMonitoringReport`, the same `requireAquariumMember` check as maintenance logging), or by the weekly and monthly schedules. Platform admins can read reports but not generate them.
- **Firestore:** `monitoring_reports` are read through `canReadAquariumData(aquarium_id)` and written only by functions (ORG-15).
- **Storage:** `reports/{orgId}/{aquariumId}/{reportId}.pdf|.csv`. Read is allowed when the aquarium's own `orgId` equals the path's org and the caller is an owner member, or a caretaker member listed in `caretakerIds`, of an org that is not suspended. Platform admins (verified email, `platformAdmin` claim) can also read. Nobody writes from a client (STORAGE-01..06).
- **Why `orgStatus` is on member docs:** Cloud Storage rules can read at most **two** Firestore documents per request. The rule reads the aquarium and the caller's member doc, so `setOrganizationStatus` copies the org's status onto every member doc. Member docs are server-written only.
- **Known gap:** the Storage rule checks `email_verified` on the token, not the per-user verification policy, and it does not read `security_user_blocks` (that would be a third document). A blocked user's Auth tokens are revoked by `revokeUserAccount`, so this matters only until the token expires (at most 1 hour).

## 10. Multi-factor authentication (Sprint 5)

### Policy

| Role | MFA | Method |
|---|---|---|
| Platform admin | **Required** (once switched on) | Authenticator app (TOTP, RFC 6238) |
| Owner / co-owner | Optional (recommended) | Authenticator app (TOTP) |
| Caretaker | Optional | Authenticator app (TOTP) |
| Device (ESP32) | Not applicable: a separate device account, no interactive sign-in | — |

SMS codes are **not** offered: they cost money per message and are the weaker factor (SIM swap).

### How it works

- **Enrollment** is in Settings → Two-step verification. The app gets a TOTP secret from Firebase and shows it as a QR code and as a setup key. The user enters the 6-digit code; Firebase checks it and stores the factor.
- **Sign-in:** after a correct password, Firebase answers `auth/multi-factor-auth-required`. The login page asks for the 6-digit code and completes the sign-in. The ID token then carries `firebase.sign_in_second_factor: "totp"`.
- **Admin gate, client:** a platform admin with no TOTP factor sees only the enrollment screen until they enroll (`src/utils/mfa.ts` `mfaRequirement`).
- **Admin gate, server:** when the functions parameter `REQUIRE_PLATFORM_ADMIN_MFA=true`, every callable refuses a platform-admin token that did not sign in with TOTP (`functions/src/mfaPolicy.ts`).
- **Follow-up (not yet done):** require `sign_in_second_factor == 'totp'` in `isPlatformAdmin()` in `firestore.rules` and `storage.rules`, so admin reads are enforced by the rules too. That has to wait until every admin has enrolled. Until then, admin reads are gated in the app only.
- **Recovery:** the user keeps the setup key (or a second device, or the authenticator app's cloud backup). Without one, support verifies the person's identity out of band, then removes the factor in Console → Authentication → Users → Multi-factor. The user signs in with their password and enrolls again. Each removal should be recorded in the audit log by the admin who performed it.
- **Flags:** `NEXT_PUBLIC_MFA_TOTP_ENABLED` (off until go-live, `docs/migration-live.md` §8). `NEXT_PUBLIC_MFA_TOTP_MOCK` is emulator-only: it works only together with `NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true`, accepts the code `123456`, and is used by the Playwright smoke tests.

### Tested so far

| What | How | Status |
|---|---|---|
| Policy (required/optional/disabled), code format, enrollment and sign-in flows, error messages | `tests/unit/mfa.test.mjs` with a fake Firebase SDK (6 tests) | Passing |
| Server gate for admin callables | `functions/test/mfaPolicy.test.ts` (3 tests) | Passing |
| Settings enrollment UI, wrong-code message, recovery guidance, admin gate | Playwright on the emulator mock (`npm run test:smoke`) | Passing |
| Real TOTP with Firebase (QR → authenticator app → code → challenge at next sign-in) | **Not possible in the Auth emulator** | **Verify after deploy** (below) |

### Verify after deploy (manual, real phone)

1. With a test owner account: Settings → Two-step verification → Set up. Scan the QR with Google Authenticator. Enter the code. Expect "(on)".
2. Sign out and sign in. Expect the code prompt after the password. A wrong code shows "That code is not right". The right code signs you in.
3. In the browser console, decode the ID token (`await auth.currentUser.getIdTokenResult()`). Expect `claims.firebase.sign_in_second_factor === 'totp'`.
4. With a platform admin account that has no factor: expect the enrollment screen and no admin pages until enrolled.
5. After setting `REQUIRE_PLATFORM_ADMIN_MFA=true`: an admin signed in **without** TOTP (for example in a session started before enrollment) gets "Platform administrators must sign in with two-step verification" when suspending an org. After signing in again with TOTP, the action works.
6. Recovery drill: remove the test owner's factor in the console, sign in with the password only, and enroll again.
7. Record the date and the tester's name in `AUDIT.md`.

### ISO/IEC 27001 mapping (A.9 Access control, 2013 numbering; A.5.15–A.5.18 and A.8.5 in the 2022 edition)

| Control | How SmartAqua Pro meets it |
|---|---|
| A.9.1.1 Access control policy | This document: roles (§1), permission matrix (§2), MFA policy (above) |
| A.9.1.2 Access to networks and network services | Firebase services only over HTTPS/TLS; RTDB, Firestore and Storage rules deny by default |
| A.9.2.1 User registration and de-registration | Sign-up with email verification; `removeMember` and `revokeUserAccount`; `audit_logs` |
| A.9.2.2 User access provisioning | Access only through a claim code (owner) or an invite (caretaker); assignments per tank |
| A.9.2.3 Management of privileged access rights | Platform admin = `platformAdmin` custom claim, set only by the migration or an admin script; **MFA required**; read-only on tank data; admin actions audited |
| A.9.2.4 Management of secret authentication information | Passwords handled only by Firebase Auth; TOTP secrets held by Firebase and the user's app (shown once at enrollment); claim codes stored only as HMAC |
| A.9.2.5 Review of user access rights | Owners see members and assignments on the Team page; the admin audit log lists org changes |
| A.9.2.6 Removal or adjustment of access rights | Removing a caretaker or co-owner, suspending an org and revoking a user take effect in the rules and the RTDB mirror immediately |
| A.9.3.1 Use of secret authentication information | Recovery guidance on the enrollment screen; no sharing of device credentials (per-device accounts) |
| A.9.4.1 Information access restriction | Org- and tank-scoped Firestore, RTDB and Storage rules, tested with emulator isolation suites |
| A.9.4.2 Secure log-on procedures | Email verification, login rate limit, TOTP second factor, generic "Invalid code" for claims |
| A.9.4.3 Password management system | Firebase Auth password policy and reset by email |
| A.9.4.4 Use of privileged utility programs | Operator scripts default to the emulator; a real project needs `--project` plus the typed project ID |
