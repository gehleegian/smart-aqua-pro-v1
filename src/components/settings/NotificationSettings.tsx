import { useEffect, useState } from 'react';
import { Bell, BellRing, Share, Smartphone } from 'lucide-react';
import Button from '../ui/Button';
import StatusMessage from '../ui/StatusMessage';
import Toggle from '../ui/Toggle';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { auth } from '../../firebase';
import { getAquariumsByOwner } from '../../services/aquariumService';
import { disablePush, enablePush, pushAvailability, pushEnabledHere, type PushAvailability } from '../../services/pushService';
import { DEFAULT_PREFS, loadNotificationPrefs, saveNotificationPrefs, type NotificationPrefs } from '../../services/notificationPrefsService';

const UNAVAILABLE: Record<Exclude<PushAvailability, { available: true }>['reason'], string> = {
  'ios-not-installed': 'On iPhone and iPad, alerts only work for SmartAqua added to the Home Screen.',
  unsupported: 'This browser does not support push notifications.',
  'not-configured': 'Push is not configured for this deployment yet (missing VAPID key).',
  emulator: 'Push notifications cannot be sent from the local emulator. In the demo, what would be sent is recorded in dev_notification_outbox.',
  denied: 'Notifications are blocked for this site. Allow them in the browser settings, then try again.',
};

/** FR15: turn on push alerts in this browser and choose what to receive. */
export function NotificationSettings() {
  const [availability, setAvailability] = useState<PushAvailability | null>(null);
  const [enabled, setEnabled] = useState(() => pushEnabledHere());
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [tanks, setTanks] = useState<Array<{ id: string; name: string }>>([]);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void pushAvailability().then((value) => { if (!cancelled) setAvailability(value); });
    void loadNotificationPrefs().then((value) => { if (!cancelled) setPrefs(value); }).catch(() => undefined);
    const uid = auth.currentUser?.uid;
    if (uid) {
      void getAquariumsByOwner(uid)
        .then((items) => { if (!cancelled) setTanks(items.map((item) => ({ id: item.id, name: item.name }))); })
        .catch(() => undefined);
    }
    return () => { cancelled = true; };
  }, []);

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setMessage(null);
    try {
      await action();
      setMessage({ kind: 'success', text: success });
    } catch (error) {
      setMessage({ kind: 'error', text: error instanceof Error ? error.message : 'That did not work. Try again.' });
    } finally {
      setBusy('');
    }
  };

  const update = (next: NotificationPrefs) => {
    setPrefs(next);
    void run('prefs', () => saveNotificationPrefs(next), 'Preferences saved.');
  };

  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
          <Bell className="h-5 w-5 text-amber-400" aria-hidden="true" /> Alerts and notifications
        </h3>
      </CardHeader>
      <CardContent className="space-y-5">
        {message ? <StatusMessage variant={message.kind}>{message.text}</StatusMessage> : null}

        <div className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-white"><BellRing className="h-4 w-4 text-teal-300" aria-hidden="true" /> Push alerts on this device</p>
          <p className="mt-1 text-xs text-slate-400">
            You get a notification when an alert opens or gets worse on a tank you can see, never for repeats.
            The browser asks for permission only after you press the button.
          </p>
          {availability && !availability.available ? (
            <p className="mt-3 text-sm text-amber-200">{UNAVAILABLE[availability.reason]}</p>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {enabled ? (
              <Button size="sm" variant="secondary" disabled={busy !== ''} onClick={() => void run('push', async () => { await disablePush(); setEnabled(false); }, 'Alerts turned off on this device.')}>
                Turn off alerts here
              </Button>
            ) : (
              <Button size="sm" disabled={busy !== '' || !availability?.available} onClick={() => void run('push', async () => { await enablePush(); setEnabled(true); }, 'Alerts are on for this device.')}>
                {busy === 'push' ? 'Turning on…' : 'Turn on alerts'}
              </Button>
            )}
          </div>
          <div className="mt-4 rounded-lg border border-slate-600/20 bg-slate-950/30 p-3 text-xs text-slate-300">
            <p className="flex items-center gap-2 font-medium text-slate-200"><Smartphone className="h-3.5 w-3.5" aria-hidden="true" /> iPhone or iPad (iOS 16.4 or later)</p>
            <ol className="mt-1 list-decimal space-y-0.5 pl-5">
              <li>Open SmartAqua in <strong>Safari</strong>.</li>
              <li>Tap <Share className="inline h-3 w-3" aria-label="Share" /> Share, then <strong>Add to Home Screen</strong>.</li>
              <li>Open SmartAqua from the new Home Screen icon, log in, and press <strong>Turn on alerts</strong> here.</li>
            </ol>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="block text-white">Alert level</span>
              <span className="block text-xs text-slate-400">Critical only, or warnings too.</span>
            </span>
            <select value={prefs.minSeverity} disabled={busy === 'prefs'}
              onChange={(event) => update({ ...prefs, minSeverity: event.target.value === 'critical' ? 'critical' : 'warning' })}
              className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-1.5 text-sm text-slate-100">
              <option value="warning" className="bg-slate-900">Warning and critical</option>
              <option value="critical" className="bg-slate-900">Critical only</option>
            </select>
          </label>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white">Device offline and power</p>
              <p className="text-xs text-slate-400">When a device stops reporting or mains power is lost.</p>
            </div>
            <Toggle checked={prefs.deviceAlerts} label="Device offline and power alerts" onChange={() => update({ ...prefs, deviceAlerts: !prefs.deviceAlerts })} />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-white">Cleaning reminders</p>
              <p className="text-xs text-slate-400">When a tank&apos;s cleaning is due.</p>
            </div>
            <Toggle checked={prefs.cleaningReminders} label="Cleaning reminders" onChange={() => update({ ...prefs, cleaningReminders: !prefs.cleaningReminders })} />
          </div>
          {tanks.length > 0 ? (
            <fieldset>
              <legend className="text-sm text-white">Mute a tank</legend>
              <p className="text-xs text-slate-400">No notifications from muted tanks. Alerts still show in the app.</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {tanks.map((tank) => (
                  <label key={tank.id} className="flex items-center gap-2 rounded-lg border border-slate-600/30 bg-slate-900/30 px-3 py-2 text-sm text-slate-200">
                    <input type="checkbox" className="accent-teal-500" checked={prefs.mutedAquariumIds.includes(tank.id)}
                      onChange={(event) => update({
                        ...prefs,
                        mutedAquariumIds: event.target.checked ? [...prefs.mutedAquariumIds, tank.id] : prefs.mutedAquariumIds.filter((id) => id !== tank.id),
                      })} />
                    Mute {tank.name}
                  </label>
                ))}
              </div>
            </fieldset>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
