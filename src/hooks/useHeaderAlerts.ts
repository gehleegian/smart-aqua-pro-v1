import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { subscribeToVisibleAquariums } from '../services/aquariumService';
import { markAlertRead, subscribeToAlertRecords } from '../services/alertRecordsService';
import { useOrg } from './useOrg';
import type { AquariumAlert } from '../types/alerts';

/**
 * The header bell: active, unread alert_records for the tanks this member can
 * see (org-scoped like every other query). The tank list is live, so tanks
 * assigned or unassigned after sign-in are picked up without a reload.
 */
export function useHeaderAlerts(enabled: boolean) {
  const { active } = useOrg();
  const orgId = active?.orgId ?? '';
  const role = active?.role ?? '';
  const suspended = active?.org.status === 'suspended';
  const [byTank, setByTank] = useState<Record<string, AquariumAlert[]>>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!enabled || !uid || !orgId || suspended) return;
    const alertListeners = new Map<string, () => void>();
    const stopAquariums = subscribeToVisibleAquariums(uid, (aquariums) => {
      const visible = new Map(aquariums.map((aquarium) => [aquarium.id, aquarium]));
      // Drop tanks the member can no longer see, together with their alerts.
      for (const [id, stop] of alertListeners) {
        if (visible.has(id)) continue;
        stop();
        alertListeners.delete(id);
        setByTank((previous) => {
          const next = { ...previous };
          delete next[id];
          return next;
        });
      }
      for (const aquarium of aquariums) {
        if (alertListeners.has(aquarium.id)) continue;
        alertListeners.set(aquarium.id, subscribeToAlertRecords(aquarium, (records) =>
          setByTank((previous) => ({ ...previous, [aquarium.id]: records }))));
      }
    }, (error) => console.warn('Header alerts are unavailable.', error));
    return () => {
      stopAquariums();
      alertListeners.forEach((stop) => stop());
      alertListeners.clear();
      setByTank({});
    };
  }, [enabled, orgId, role, suspended]);

  const alerts = Object.values(byTank)
    .flat()
    .filter((alert) => alert.resolvedAt === null)
    .sort((a, b) => b.lastDetectedAt - a.lastDetectedAt);
  const unread = alerts.filter((alert) => alert.acknowledgedAt === null);
  return {
    alerts,
    unread,
    /** Highest unread severity, so the bell badge separates Critical from Warning. */
    unreadSeverity: unread.some((alert) => alert.type === 'critical') ? 'critical' as const
      : unread.length ? 'warning' as const : null,
    markRead: (id: string) => markAlertRead(id).catch((error) => console.warn('Could not mark the alert read.', error)),
  };
}
