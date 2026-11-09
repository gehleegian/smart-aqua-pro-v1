# SmartAqua Pro: Push Notifications (FR15)

**Status (2026-11-09):** notification functions are deployed in `practice-smartaqua`. Real web push was verified on the local website: registration saved to Aquarium 2's owner, one neutral test was accepted by FCM, and the user confirmed receipt. Android registration was also verified in the installed SmartAqua development APK for Aquarium 1's owner, and the user confirmed receipt of its neutral push test after allowing notifications in phone settings. No aquarium readings or alert records were fabricated. These are transport/receipt checks, not full rule-trigger timing tests. Expo Go does not support Android remote push.

## 1. When a notification is sent

### 12V power interruption (firmware correction, 2026-11-09)

Both aquarium sketches now publish the existing optional `mainsPresent` boolean
from their measured GPIO33 detector, alongside the matching `powerStatus` label.
Previously only the label was published; the rule engine intentionally ignores a
label without a sensed boolean, so it could not open the power-interruption alert.
Aquarium 1 retains its observed analog references and Aquarium 2 retains its
confirmed active-LOW optocoupler polarity. Unknown/ambiguous analog readings or
unconfirmed digital polarity omit the boolean rather than falsely declaring power
present or absent. A fresh telemetry PUT replaces any older signal.

With the enabled `power_interruption` rule, measured absence opens the existing
CRITICAL power alert and requests push to each authorized recipient's registered
web/Android tokens. User preferences and aquarium muting still apply. Repeated
samples during one outage do not repeatedly push; restoration uses the existing
three-normal-sample alert-resolution policy. No new database field, rule threshold,
authorization permission or backend deployment is required for this firmware fix.

The updated sketch must be uploaded to each ESP32 before this takes effect.
The ESP32 and its Internet connection must remain powered (for example through an
already provided independent/backup supply) to report loss of the monitored 12V
rail. If the ESP32 or router loses power too, immediate outage reporting is not
possible; the existing 60-second heartbeat window plus a once-per-minute check can
instead request a device-offline alert. FCM/OS delivery latency is additional.
Do not infer a confirmed mains outage from connectivity loss alone.

Offline control-flow and emulator push tests are not a physical power-loss receipt
test. A supervised test must confirm `mainsPresent=false`, the power alert's
`notifyRequestedAt`, sender results and visible receipt on both devices, then
restoration. No upload, live outage, equipment command or test push is triggered by
editing these files. Other sensor calculations and relay/feeder behavior are unchanged.

Verification on 2026-11-09: all 225 web unit tests and all 14 local Sprint 4
emulator tests passed, including both detector types through alert creation,
web/Android fake delivery, duplicate suppression, restoration and opt-out. Both
repository firmware builds with their real private settings and both static
contracts passed. No physical power-loss receipt test or upload was performed.
Read-only live checks found the power rule enabled and device alerts unmuted/on
for both owners; the latest stored device payloads still lacked `mainsPresent`.
Aquarium 1's owner had web/Android registrations; Aquarium 2's owner had web only.
Those are existing registration records, not fresh delivery/permission checks.

The rules engine already decides when an alert should notify. It sets `notifyRequestedAt` on the alert in `alert_records`:
- when the alert **opens**;
- when it **escalates** (WARNING → CRITICAL).

A **repeat** reading never sets it (dedup and cooldown in `planAlertChanges`), so repeats never notify.

The `notifyAlertRecord` trigger (on every `alert_records` write) sends **once per `notifyRequestedAt` value**:
- It claims the send in a transaction (`notifiedForRequestAt`), so a retried trigger cannot send twice.
- It does not send for a resolved alert.
- It does not send a request older than 15 minutes (`NOTIFY_MAX_AGE_MS`), such as backfilled history.

**Cleaning reminders:** `notifyCleaningReminder` fires when a `cleaning_due` or `cleaning_due_early` recommendation is created, once per recommendation.

## 2. Who receives it

For the alert's aquarium (`aquariumRecipients`, `functions/src/aquariumAccess.ts`):
- **every owner** of its organization, co-owners included;
- **the caretakers assigned to that tank** (`caretakerIds`) who are still caretaker members.

Never anyone else: not other orgs, not unassigned caretakers, not the platform admin. A **suspended** org has no recipients. A legacy aquarium without an org notifies its `ownerId`.

Then each person's preferences apply (§3), and the message goes to every browser token they registered (§4).

## 3. Preferences: `users/{uid}/notificationPrefs/default`

| Field | Values | Default | Effect |
|---|---|---|---|
| `minSeverity` | `warning` \| `critical` | `warning` | `critical` skips WARNING alerts |
| `mutedAquariumIds` | aquarium IDs (≤ 100) | `[]` | nothing from those tanks; alerts still show in the app |
| `deviceAlerts` | bool | `true` | off: skip device offline and power alerts (`parameter` `device` or `power`) |
| `cleaningReminders` | bool | `true` | off: skip cleaning reminders |

Users edit these in **Settings → Alerts and notifications**. Only the user can read or write their own preferences (Firestore rules).

## 4. Tokens: `users/{uid}/fcmTokens/{sha256(token)[:40]}`

`{ token, platform: web | ios-pwa | android | ios, userAgent: "Chrome on macOS", createdAt, lastSeenAt }`.

- **Written by the user's own browser** after they press **Turn on alerts**. The permission prompt is never shown on page load.
- `lastSeenAt` is refreshed on each app start if alerts are already on.
- **Invalid tokens are deleted automatically:** when FCM answers `registration-token-not-registered` or `invalid-registration-token`, the function deletes that token doc.
- "Turn off alerts here" deletes this browser's token.
- The UI checks the saved registration, not just OS permission. An explicit turn-off is remembered per account/device so startup refresh does not undo it. Authentication and sign-out behavior are unchanged by the registration fix.
- Web registration waits until its service worker is activated before subscribing (first installation is asynchronous).
- Only the user can read their tokens. Functions read them to send.

## 5. The message and what is recorded

- **Title:** `CRITICAL: <tank name>` or `Warning: <tank name>`.
- **Body:** `<parameter>: <alert title>. <first sentence of the rule's recommended action>`.
- **Link:** `/?tank=<aquariumId>`. The service worker opens it, and the app shows that tank's dashboard. Members only ever see tanks they may see.
- **Data:** `{ kind, aquariumId, alertId, severity, parameter }`.

**Recorded on the alert:**
- `notifiedAt`, `notifiedCount` (one per send event);
- `lastNotification { at, recipients, delivered, failed, skippedByPrefs }`;
- `notifyFailures` (running count), `lastNotifyError`.

**The sender is an interface** (`NotificationSender` in `functions/src/notifications.ts`):

| Where | Sender |
|---|---|
| Production | `createFcmSender`: Admin SDK `messaging.sendEach`, batches of 500 |
| Functions emulator / `npm run demo` | `createOutboxSender`: writes `dev_notification_outbox/*` (clients cannot read it) |
| Unit tests | a fake that records what it was given (`functions/test/sprint4.test.ts`, NOTIFY-01..04) |

## 6. Testing real delivery after deploying

**Prerequisites:** `docs/migration-live.md` §7f (VAPID public key in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`, functions deployed).

The VAPID key is build-time public configuration. Restart local Next.js after setting it. For Vercel, configure the variable there and redeploy; changing `.env.local` does not update the deployed site. "No active Service Worker" means the worker has not activated yet; the registration service now waits up to 15 seconds and reports an activation error instead of subscribing too early.

A neutral test sent directly to one registered token verifies transport without creating an alert. An FCM message ID confirms acceptance, not a visible popup: record the recipient's confirmation separately. The 2026-11-09 web and Android tests had both. Full rule-trigger-to-notification timing and notification-tap navigation remain separate checks.

1. **Desktop Chrome:** log in as an owner → Settings → **Turn on alerts** → allow. Check that `users/<uid>/fcmTokens/*` has a doc (Firebase console).
2. **iPhone (iOS 16.4+):** open the site in Safari → Share → **Add to Home Screen** → open it from the icon → log in → Settings → Turn on alerts.
3. **Trigger an alert** on a test tank:
   - Wait for a real abnormal reading, **or**, on a test project only, write one telemetry update with an out-of-range value as the device.
   - Do not do this on Aquarium 1 while it has fish.
4. **Expect:** a notification within **≤ 10 s** (the manuscript target). Clicking it opens the tank's dashboard. The alert doc shows `notifiedAt` and `lastNotification.delivered ≥ 1`.
5. Send the same reading again: **no second notification** (repeat).
6. Settings → Alert level **Critical only**, then cause a WARNING: no notification, and `skippedByPrefs` counts it.
7. Uninstall the PWA or clear the site data, then trigger again: `lastNotifyError` shows `registration-token-not-registered`, and the token doc is gone.

Record the delivery times for the evaluation chapter.

## 7. Not done (later)

- **Email notifications** (Sprint 5).
- **Native iOS push:** requires APNs configuration and is not enabled. Android receipt was confirmed in the native development APK, not Expo Go; standalone release packaging and full rule-trigger timing remain separate checks.
- **Quiet hours.**
