# SmartAqua Pro: Access Model (Organizations, Device Claiming, Caretakers)

**Status:** implemented and tested on the emulator only (Sprint 3, `feat/device-pipeline`). Nothing is deployed. This model replaces the manuscript's two-role Admin/User model; §1–§5 are written so the team can paste them into Chapter 2.

---

## 1. Roles

SmartAqua Pro has three roles. An account can hold a different role in different organizations.

| Role | How someone gets it | Scope |
|---|---|---|
| **Platform Admin** | The existing `Admin` account role, mapped to the `platformAdmin: true` Firebase Auth custom claim | The whole system, **read-only**, plus suspending and reactivating organizations and user accounts |
| **Organization Owner** | Signs up on their own. Their **first successful device claim creates their organization** (a personal one named after them, or a name they type such as "Davao Pet Shop") | Every aquarium in their organization, its profiles, thresholds, schedules and team |
| **Caretaker** | **Only** by accepting an Owner's invite link | Only the aquariums the Owner assigned to them |

A new account that has no organization and no accepted invite can access nothing. The app shows two ways in: **Add your first device** or **Waiting for an invite**. Open sign-up is therefore safe.

An **organization** is the unit of ownership and isolation. An aquarium belongs to exactly one organization, and data from different organizations is never mixed.

## 2. Permission matrix

✅ allowed · ❌ denied · "assigned" means the aquarium lists the caretaker in `caretakerIds`.

| Action | Platform Admin | Owner | Caretaker | No organization |
|---|---|---|---|---|
| View organization list (all orgs) | ✅ | ❌ | ❌ | ❌ |
| Suspend or reactivate an organization | ✅ (audited) | ❌ | ❌ | ❌ |
| Create an organization or assign devices | ❌ | ✅ by claiming a device | ❌ | ✅ first claim creates one |
| Claim (add) a device | ❌ | ✅ | ❌ (not into the org they care for) | ✅ |
| View aquarium profile, live readings, history | ✅ all (read-only) | ✅ every tank in the org | ✅ assigned tanks | ❌ |
| View alerts, recommendations, maintenance, reports | ✅ all (read-only) | ✅ | ✅ assigned tanks | ❌ |
| Mark alert read; apply or dismiss a recommendation | ❌ | ✅ | ✅ assigned tanks | ❌ |
| Send a device command (feed now, light, filter) | ❌ | ✅ | ✅ assigned tanks | ❌ |
| Edit profile, thresholds, setup | ❌ | ✅ | ❌ | ❌ |
| Edit schedules and automation (`control`) | ❌ | ✅ | ❌ | ❌ |
| Invite, reassign or remove caretakers | ❌ | ✅ | ❌ | ❌ |
| Read the org's audit log | ✅ | ✅ own org | ❌ | ❌ |

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
- An organization always keeps at least one Owner; an Owner cannot be removed.

## 5. Why there is an access mirror in the Realtime Database

Realtime Database rules cannot read Firestore. Live readings and device commands live in the Realtime Database, so the access decision is copied there by Cloud Functions only:

```
authorization/aquariums/{aquariumId}
  ownerUid:      <owner uid>
  orgId:         <organization id>
  caretakerUids: { <uid>: true, … }   only caretakers who are still members
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

- **Audit actions:** `device.claim`, `invite.create`, `invite.accept`, `invite.revoke`, `member.remove`, `member.assignments`, `org.suspend`, `org.reactivate`, `org.migrate`.
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

Source: `functions/src/orgAccess.ts`. Tests:
- `npm run test:org-access` (callables)
- `test:firestore-org-rules` and `test:rtdb-org-rules` (isolation)
- `test:migrate-orgs`
- `test:sprint3-e2e` (the full flow on the emulator suite)

## 8. Operations

**Provision devices:** `npm run provision:device -- --count 2` (emulator by default; `--project <id>` asks you to type the ID).
- It writes labels to `provisioning-output/<deviceId>/` (`qr.png`, `label.svg`, `claim.json`) and credentials to `firmware/secrets/<deviceId>.h`. All of these are gitignored.
- The pepper comes from env `CLAIM_CODE_PEPPER` or `functions/.secret.local`.
- Before go-live, set the secret with `firebase functions:secrets:set CLAIM_CODE_PEPPER`. Codes provisioned with one pepper never match under another.

**Migrate existing data:** `npm run migrate:orgs -- --dry-run`, then without `--dry-run`. See `docs/migration-live.md` step 7.

**Not yet:**
- invite email sending
- promoting a caretaker to co-owner (one Owner per org today)
- deleting an organization
- the mobile app (it still queries by `ownerId`, which the new rules deny; mobile sync is a later sprint)
