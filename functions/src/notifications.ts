import { createHash } from 'node:crypto';
import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { Messaging } from 'firebase-admin/messaging';
import { aquariumRecipients } from './aquariumAccess.js';
import { PARAMETER_LABELS } from './shared/monitoringAssessmentCore.js';

/**
 * FR15 push notifications (Sprint 4). See docs/notifications.md.
 *
 * The rules engine already marks when an alert should notify: it sets
 * `notifyRequestedAt` when an alert OPENS or ESCALATES, never on a repeat
 * (dedup/cooldown in planAlertChanges). The alert_records trigger calls
 * notifyAlert, which sends once per notifyRequestedAt to the tank's owners and
 * assigned caretakers, after their notification preferences.
 *
 * FCM cannot be emulated, so delivery sits behind NotificationSender:
 *   - production: createFcmSender (Admin SDK messaging.sendEach)
 *   - Functions emulator: createOutboxSender (writes dev_notification_outbox)
 *   - unit tests: a fake that records what it was given
 */
export type PushMessage = {
  uid: string;
  tokenId: string;
  token: string;
  title: string;
  body: string;
  link: string;
  data: Record<string, string>;
};

export type SendOutcome = { ok: true } | { ok: false; invalidToken: boolean; error: string };

export interface NotificationSender {
  send(messages: PushMessage[]): Promise<SendOutcome[]>;
}

export type NotificationPrefs = {
  minSeverity: 'warning' | 'critical';
  mutedAquariumIds: string[];
  deviceAlerts: boolean;
  cleaningReminders: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = {
  minSeverity: 'warning',
  mutedAquariumIds: [],
  deviceAlerts: true,
  cleaningReminders: true,
};

/** A notify request older than this is not sent (e.g. backfilled or long-retried events). */
export const NOTIFY_MAX_AGE_MS = 15 * 60_000;
const DEVICE_PARAMETERS = new Set(['device', 'power']);
const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
]);

export type NotifyDependencies = {
  firestore: Firestore;
  sender: NotificationSender;
  now?: () => number;
};

export function tokenIdFor(token: string) {
  return createHash('sha256').update(token).digest('hex').slice(0, 40);
}

export function readPrefs(data: Record<string, unknown> | undefined): NotificationPrefs {
  return {
    minSeverity: data?.minSeverity === 'critical' ? 'critical' : 'warning',
    mutedAquariumIds: Array.isArray(data?.mutedAquariumIds)
      ? data.mutedAquariumIds.filter((id): id is string => typeof id === 'string')
      : [],
    deviceAlerts: data?.deviceAlerts !== false,
    cleaningReminders: data?.cleaningReminders !== false,
  };
}

export type NotificationKind = { kind: 'alert'; severity: 'warning' | 'critical'; parameter: string } | { kind: 'cleaning' };

/** Pure: does this person want this notification for this tank? */
export function wantsNotification(prefs: NotificationPrefs, aquariumId: string, what: NotificationKind) {
  if (prefs.mutedAquariumIds.includes(aquariumId)) return false;
  if (what.kind === 'cleaning') return prefs.cleaningReminders;
  if (DEVICE_PARAMETERS.has(what.parameter) && !prefs.deviceAlerts) return false;
  return prefs.minSeverity === 'warning' || what.severity === 'critical';
}

function firstSentence(text: string, max = 140) {
  const sentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  return sentence.length > max ? `${sentence.slice(0, max - 1)}…` : sentence;
}

export function tankLink(aquariumId: string) {
  return `/?tank=${encodeURIComponent(aquariumId)}`;
}

/** Pure: the notification text for an alert. */
export function alertMessage(input: {
  tankName: string;
  aquariumId: string;
  severity: 'warning' | 'critical';
  parameter: string;
  title: string;
  action: string | null;
  alertId: string;
}) {
  const parameter = PARAMETER_LABELS[input.parameter as keyof typeof PARAMETER_LABELS]?.label
    ?? (input.parameter === 'device' ? 'Device' : input.parameter);
  const label = input.severity === 'critical' ? 'CRITICAL' : 'Warning';
  return {
    title: `${label}: ${input.tankName}`,
    body: `${parameter}: ${input.title}${input.action ? `. ${firstSentence(input.action)}` : ''}`,
    link: tankLink(input.aquariumId),
    data: { kind: 'alert', aquariumId: input.aquariumId, alertId: input.alertId, severity: input.severity, parameter: input.parameter },
  };
}

async function deliver(
  dependencies: NotifyDependencies,
  aquariumId: string,
  aquarium: Record<string, unknown>,
  what: NotificationKind,
  content: { title: string; body: string; link: string; data: Record<string, string> }
) {
  const { firestore, sender } = dependencies;
  const recipients = await aquariumRecipients(firestore, aquarium);
  const messages: PushMessage[] = [];
  const skipped: string[] = [];
  for (const recipient of recipients) {
    const [prefsSnap, tokens] = await Promise.all([
      firestore.doc(`users/${recipient.uid}/notificationPrefs/default`).get(),
      firestore.collection(`users/${recipient.uid}/fcmTokens`).get(),
    ]);
    if (!wantsNotification(readPrefs(prefsSnap.data()), aquariumId, what)) {
      skipped.push(recipient.uid);
      continue;
    }
    for (const doc of tokens.docs) {
      const token = doc.get('token');
      if (typeof token === 'string' && token) messages.push({ uid: recipient.uid, tokenId: doc.id, token, ...content });
    }
  }
  const outcomes = messages.length ? await sender.send(messages) : [];
  const failures: Array<{ uid: string; tokenId: string; error: string }> = [];
  let delivered = 0;
  await Promise.all(outcomes.map(async (outcome, index) => {
    const message = messages[index];
    if (outcome.ok) {
      delivered += 1;
      return;
    }
    failures.push({ uid: message.uid, tokenId: message.tokenId, error: outcome.error });
    // Invalid (unregistered, uninstalled, expired) tokens are removed for good.
    if (outcome.invalidToken) await firestore.doc(`users/${message.uid}/fcmTokens/${message.tokenId}`).delete();
  }));
  return {
    recipients: recipients.map((recipient) => recipient.uid),
    targeted: [...new Set(messages.map((message) => message.uid))],
    skippedByPrefs: skipped,
    delivered,
    failures,
  };
}

/**
 * Called by the alert_records trigger on every write. Sends at most once per
 * notifyRequestedAt value (open or escalation), claimed in a transaction so a
 * retried trigger cannot send twice.
 */
export async function notifyAlert(dependencies: NotifyDependencies, alertId: string) {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  const ref = firestore.doc(`alert_records/${alertId}`);
  const claim = await firestore.runTransaction(async (transaction) => {
    const alert = await transaction.get(ref);
    const requestedAt = alert.get('notifyRequestedAt');
    if (!alert.exists || typeof requestedAt !== 'number' || alert.get('status') === 'resolved') return null;
    if (alert.get('notifiedForRequestAt') === requestedAt) return null;
    transaction.update(ref, { notifiedForRequestAt: requestedAt });
    return { data: alert.data() as Record<string, unknown>, requestedAt };
  });
  if (!claim) return { sent: false as const, reason: 'nothing_to_send' };
  if (claim.requestedAt < now - NOTIFY_MAX_AGE_MS) {
    await ref.update({ notifySkipped: 'stale' });
    return { sent: false as const, reason: 'stale' };
  }

  const aquariumId = String(claim.data.aquarium_id ?? '');
  const aquarium = (await firestore.doc(`aquariums/${aquariumId}`).get()).data();
  if (!aquarium) return { sent: false as const, reason: 'unknown_aquarium' };
  const recommendationId = typeof claim.data.recommendationId === 'string' ? claim.data.recommendationId : null;
  const recommendation = recommendationId ? (await firestore.doc(`recommendations/${recommendationId}`).get()).data() : undefined;
  const severity = claim.data.severity === 'critical' ? 'critical' : 'warning';
  const parameter = String(claim.data.parameter ?? 'device');
  const content = alertMessage({
    tankName: String(aquarium.name ?? 'Your aquarium'),
    aquariumId,
    severity,
    parameter,
    title: String(claim.data.type ?? 'Alert'),
    action: typeof recommendation?.action === 'string' ? recommendation.action : null,
    alertId,
  });
  const result = await deliver(dependencies, aquariumId, aquarium, { kind: 'alert', severity, parameter }, content);
  await ref.update({
    notifiedAt: now,
    notifiedCount: FieldValue.increment(1),
    lastNotification: {
      at: now,
      recipients: result.targeted.length,
      delivered: result.delivered,
      failed: result.failures.length,
      skippedByPrefs: result.skippedByPrefs.length,
    },
    ...(result.failures.length
      ? { notifyFailures: FieldValue.increment(result.failures.length), lastNotifyError: result.failures[0].error.slice(0, 200) }
      : {}),
  });
  return { sent: true as const, ...result };
}

/** Cleaning reminders (cleaning_due / cleaning_due_early recommendations), once per recommendation. */
export async function notifyCleaningRecommendation(dependencies: NotifyDependencies, recommendationId: string) {
  const { firestore } = dependencies;
  const now = dependencies.now?.() ?? Date.now();
  const ref = firestore.doc(`recommendations/${recommendationId}`);
  const rec = (await ref.get()).data();
  if (!rec || (rec.ruleId !== 'cleaning_due' && rec.ruleId !== 'cleaning_due_early') || rec.status !== 'pending' || rec.notifiedAt) {
    return { sent: false as const, reason: 'nothing_to_send' };
  }
  if (typeof rec.createdAt === 'number' && rec.createdAt < now - NOTIFY_MAX_AGE_MS) return { sent: false as const, reason: 'stale' };
  const aquariumId = String(rec.aquariumId);
  const aquarium = (await firestore.doc(`aquariums/${aquariumId}`).get()).data();
  if (!aquarium) return { sent: false as const, reason: 'unknown_aquarium' };
  const result = await deliver(dependencies, aquariumId, aquarium, { kind: 'cleaning' }, {
    title: `Cleaning due: ${String(aquarium.name ?? 'Your aquarium')}`,
    body: firstSentence(String(rec.action ?? rec.title ?? 'Time to clean the tank.')),
    link: tankLink(aquariumId),
    data: { kind: 'cleaning', aquariumId, recommendationId },
  });
  await ref.update({ notifiedAt: now, notifiedCount: FieldValue.increment(1) });
  return { sent: true as const, ...result };
}

export function createFcmSender(messaging: Messaging): NotificationSender {
  return {
    async send(messages) {
      const outcomes: SendOutcome[] = [];
      for (let start = 0; start < messages.length; start += 500) {
        const batch = messages.slice(start, start + 500);
        const response = await messaging.sendEach(batch.map((message) => ({
          token: message.token,
          notification: { title: message.title, body: message.body },
          data: { ...message.data, link: message.link },
          webpush: {
            notification: { icon: '/icons/icon-192.png', badge: '/icons/badge-72.png', tag: message.data.alertId ?? message.data.recommendationId },
          },
        })));
        for (const item of response.responses) {
          outcomes.push(item.success ? { ok: true } : {
            ok: false,
            invalidToken: INVALID_TOKEN_CODES.has(item.error?.code ?? ''),
            error: `${item.error?.code ?? 'unknown'}: ${item.error?.message ?? ''}`,
          });
        }
      }
      return outcomes;
    },
  };
}

/** Functions emulator only: FCM cannot be emulated, so record what would be sent. */
export function createOutboxSender(firestore: Firestore): NotificationSender {
  return {
    async send(messages) {
      const batch = firestore.batch();
      for (const message of messages) {
        batch.set(firestore.collection('dev_notification_outbox').doc(), {
          uid: message.uid, tokenId: message.tokenId, title: message.title, body: message.body, link: message.link, data: message.data, at: Date.now(),
        });
      }
      await batch.commit();
      return messages.map(() => ({ ok: true as const }));
    },
  };
}
