import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { getAquariumsByOwner } from '../services/aquariumService';
import { markAlertRead, subscribeToAlertRecords } from '../services/alertRecordsService';
import { useOrg } from './useOrg';
import type { AquariumAlert } from '../types/alerts';

/**
 * The header bell: active, unread alert_records for the tanks this member can
 * see (org-scoped like every other query). Replaces the hard-coded sample list.
 */
export function useHeaderAlerts(enabled: boolean) {
  const { active } = useOrg();
  const orgId = active?.orgId ?? '';
  const suspended = active?.org.status === 'suspended';
  const [byTank, setByTank] = useState<Record<string, AquariumAlert[]>>({});

  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!enabled || !uid || !orgId || suspended) return;
    let cancelled = false;
    const unsubscribers: Array<() => void> = [];
    getAquariumsByOwner(uid)
      .then((aquariums) => {
        if (cancelled) return;
        for (const aquarium of aquariums) {
          unsubscribers.push(subscribeToAlertRecords(aquarium, (records) =>
            setByTank((previous) => ({ ...previous, [aquarium.id]: records }))));
        }
      })
      .catch((error) => console.warn('Header alerts are unavailable.', error));
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
      setByTank({});
    };
  }, [enabled, orgId, suspended]);

  const alerts = Object.values(byTank)
    .flat()
    .filter((alert) => alert.resolvedAt === null)
    .sort((a, b) => b.lastDetectedAt - a.lastDetectedAt);
  return {
    alerts,
    unread: alerts.filter((alert) => alert.acknowledgedAt === null),
    markRead: (id: string) => markAlertRead(id).catch((error) => console.warn('Could not mark the alert read.', error)),
  };
}
