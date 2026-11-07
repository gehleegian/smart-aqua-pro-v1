# SmartAqua Pro: Push Notifications (FR15)

**Status:** implemented and tested on the emulator with a fake sender (Sprint 4, `feat/device-pipeline`). **Real FCM delivery is not verified:** it needs a deployed project (§6). Nothing is deployed.

## 1. When a notification is sent

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

`{ token, platform: web | ios-pwa | android, userAgent: "Chrome on macOS", createdAt, lastSeenAt }`.

- **Written by the user's own browser** after they press **Turn on alerts**. The permission prompt is never shown on page load.
- `lastSeenAt` is refreshed on each app start if alerts are already on.
- **Invalid tokens are deleted automatically:** when FCM answers `registration-token-not-registered` or `invalid-registration-token`, the function deletes that token doc.
- "Turn off alerts here" deletes this browser's token.
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
- **Mobile app push:** the Android/iOS native app registers its own FCM tokens with `platform: android` and the same doc shape. That is part of mobile sync.
- **Quiet hours.**
