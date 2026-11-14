import { collection, onSnapshot } from 'firebase/firestore';
import { onValue, ref } from 'firebase/database';
import { auth, db, rtdb } from '../firebase';
import { getCurrentUserProfile } from './userService';
import { assertCurrentEmailAccess } from './emailVerificationPolicyService';
import { inventoryDevice, inventoryTelemetry, joinInventory,
  type InventoryDevice, type InventoryRow, type InventoryTelemetry } from '../utils/deviceInventory';

export type DeviceInventorySnapshot = {
  rows: InventoryRow[]; telemetry: Record<string, InventoryTelemetry | null>;
  errors: Record<string, string>; connected: boolean; clockOffset: number;
};

/** Admin-only, read-only. Never subscribe to commands, controls, or history. */
export function subscribeToDeviceInventory(onData: (data: DeviceInventorySnapshot) => void,
  onError: (error: Error) => void) {
  let closed = false;
  let devices: InventoryDevice[] = [];
  let tanks: { id: string; name: string; ownerId: string; ownerName: string }[] = [];
  let users: { id: string; name: string; email: string }[] = [];
  let connected = false;
  let clockOffset = 0;
  const telemetry: DeviceInventorySnapshot['telemetry'] = {};
  const errors: Record<string, string> = {};
  const ready = new Set<string>();
  const subscriptions: (() => void)[] = [];
  const deviceSubscriptions = new Map<string, () => void>();
  const emit = () => {
    if (!closed && ready.size === 3) onData({ rows: joinInventory(devices, tanks, users),
      telemetry: { ...telemetry }, errors: { ...errors }, connected, clockOffset });
  };
  const close = () => {
    closed = true;
    subscriptions.forEach(stop => stop());
    deviceSubscriptions.forEach(stop => stop());
    deviceSubscriptions.clear();
  };
  const fail = (error: unknown) => {
    if (closed) return;
    close();
    onError(error instanceof Error ? error : new Error('Device inventory could not be loaded.'));
  };
  const syncTelemetry = () => {
    const ids = new Set(devices.filter(device => device.registration === 'claimed' && device.aquariumId)
      .map(device => device.aquariumId));
    for (const [id, stop] of deviceSubscriptions) {
      if (!ids.has(id)) { stop(); deviceSubscriptions.delete(id); delete telemetry[id]; delete errors[id]; }
    }
    for (const id of ids) {
      if (deviceSubscriptions.has(id)) continue;
      let active = true;
      const unsubscribe = onValue(ref(rtdb, `devices/${id}/telemetry`), snapshot => {
        if (closed || !active) return;
        telemetry[id] = inventoryTelemetry(snapshot.val()); delete errors[id]; emit();
      }, () => {
        if (closed || !active) return;
        telemetry[id] = null; errors[id] = 'Live status could not be read.'; emit();
      });
      deviceSubscriptions.set(id, () => { active = false; unsubscribe(); });
    }
  };
  void (async () => {
    const user = auth.currentUser;
    if (!user) throw new Error('Sign in as an administrator to view device inventory.');
    await assertCurrentEmailAccess(user);
    if (closed) return;
    const profile = await getCurrentUserProfile(user.uid);
    if (profile?.role !== 'Admin' || auth.currentUser?.uid !== user.uid) throw new Error('Admin access is required.');
    if (closed) return;
    subscriptions.push(auth.onAuthStateChanged(current => {
      if (current?.uid !== user.uid) fail(new Error('Your session changed. Sign in again.'));
    }));
    subscriptions.push(onValue(ref(rtdb, '.info/connected'), snapshot => {
      connected = snapshot.val() === true; emit();
    }, fail));
    subscriptions.push(onValue(ref(rtdb, '.info/serverTimeOffset'), snapshot => {
      const value = snapshot.val();
      clockOffset = typeof value === 'number' && Number.isFinite(value) ? value : 0; emit();
    }, fail));
    subscriptions.push(onSnapshot(collection(db, 'device_registry'), snapshot => {
      if (closed) return;
      devices = snapshot.docs.map(doc => inventoryDevice(doc.id, doc.data()));
      ready.add('devices'); syncTelemetry(); emit();
    }, fail));
    subscriptions.push(onSnapshot(collection(db, 'aquarium_directory'), snapshot => {
      if (closed) return;
      tanks = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, name: string(data.name), ownerId: string(data.ownerId), ownerName: string(data.ownerName) };
      }); ready.add('tanks'); emit();
    }, fail));
    subscriptions.push(onSnapshot(collection(db, 'users'), snapshot => {
      if (closed) return;
      users = snapshot.docs.map(doc => {
        const data = doc.data();
        return { id: doc.id, name: string(data.full_name) || string(data.name), email: string(data.email) };
      }); ready.add('users'); emit();
    }, fail));
  })().catch(fail);
  return close;
}

function string(value: unknown) { return typeof value === 'string' ? value : ''; }
