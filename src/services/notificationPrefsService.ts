import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

// users/{uid}/notificationPrefs/default. Read by the notification functions;
// missing = the defaults below.
export type NotificationPrefs = {
  minSeverity: 'warning' | 'critical';
  mutedAquariumIds: string[];
  deviceAlerts: boolean;
  cleaningReminders: boolean;
};

export const DEFAULT_PREFS: NotificationPrefs = { minSeverity: 'warning', mutedAquariumIds: [], deviceAlerts: true, cleaningReminders: true };

function ref() {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  return doc(db, 'users', uid, 'notificationPrefs', 'default');
}

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  const data = (await getDoc(ref())).data();
  return {
    minSeverity: data?.minSeverity === 'critical' ? 'critical' : 'warning',
    mutedAquariumIds: Array.isArray(data?.mutedAquariumIds) ? data.mutedAquariumIds.filter((id: unknown): id is string => typeof id === 'string') : [],
    deviceAlerts: data?.deviceAlerts !== false,
    cleaningReminders: data?.cleaningReminders !== false,
  };
}

export async function saveNotificationPrefs(prefs: NotificationPrefs) {
  await setDoc(ref(), { ...prefs, mutedAquariumIds: [...new Set(prefs.mutedAquariumIds)].slice(0, 100), updatedAt: Date.now() });
}
