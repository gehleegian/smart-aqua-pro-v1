import type { Firestore } from 'firebase-admin/firestore';
import { requireAquariumMember, requireVerifiedActor, type Actor } from './aquariumAccess.js';
import { MutationError } from './trustedMutations.js';
import { confirmedHardware, parseHardwareInventory, type HardwareSetupState } from './shared/hardwareInventory.js';

/** Registry remains server-written. Owners confirm only their own bound device. */
export async function deviceHardwareSetup(
  dependencies: { firestore: Firestore; now?: () => number }, actor: Actor,
  input: { aquariumId: unknown; mode: unknown; inventory?: unknown; confirmed?: unknown },
): Promise<HardwareSetupState> {
  requireVerifiedActor(actor);
  if (typeof input.aquariumId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.aquariumId)) {
    throw new MutationError('invalid-argument', 'Aquarium is invalid.');
  }
  if (input.mode !== 'read' && input.mode !== 'confirm') throw new MutationError('invalid-argument', 'Invalid hardware setup operation.');
  const { firestore } = dependencies;
  return firestore.runTransaction(async tx => {
    const access = await requireAquariumMember(firestore, actor.uid, input.aquariumId as string, tx);
    if (access.role !== 'owner') throw new MutationError('permission-denied', 'Only an owner can confirm device hardware.');
    const profile = await tx.get(firestore.doc(`users/${actor.uid}`));
    if (!profile.exists || profile.get('role') !== 'User') throw new MutationError('permission-denied', 'An owner account is required.');
    const deviceId = access.aquarium.get('deviceId');
    if (typeof deviceId !== 'string' || !/^SAQ-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(deviceId)) {
      throw new MutationError('failed-precondition', 'This aquarium has no registered device.');
    }
    const registryRef = firestore.doc(`device_registry/${deviceId}`);
    const registry = await tx.get(registryRef);
    if (!registry.exists || registry.get('aquariumId') !== input.aquariumId ||
      (registry.get('status') || registry.get('state')) !== 'claimed' ||
      !access.aquarium.get('deviceUid') || registry.get('deviceUid') !== access.aquarium.get('deviceUid')) {
      throw new MutationError('failed-precondition', 'The device binding must be active before confirming hardware.');
    }
    const known = confirmedHardware(deviceId);
    let saved = null;
    try { saved = parseHardwareInventory({ sensors: registry.get('sensorInventory'), equipment: registry.get('equipmentInventory') ?? [] }); }
    catch { /* Legacy entries have no inventory; no quantities are invented. */ }
    const confirmed = saved !== null && typeof registry.get('hardwareConfirmedAt') === 'number';
    const current: HardwareSetupState = { deviceId, inventory: saved || known,
      confirmed: confirmed || known !== null, source: saved ? 'registry' : known ? 'owner-confirmed' : null };
    if (input.mode === 'read' || known) return current;
    if (input.confirmed !== true) throw new MutationError('invalid-argument', 'Confirm the installed hardware checklist first.');
    let inventory;
    try { inventory = parseHardwareInventory(input.inventory); }
    catch (error) { throw new MutationError('invalid-argument', error instanceof Error ? error.message : 'Invalid hardware inventory.'); }
    if (confirmed) {
      if (JSON.stringify(inventory) !== JSON.stringify(saved)) throw new MutationError('failed-precondition', 'Hardware was already confirmed. Contact support to correct it.');
      return current;
    }
    if (access.aquarium.get('status') !== 'setup') {
      throw new MutationError('failed-precondition', 'Hardware confirmation is only available during new-device setup.');
    }
    const now = dependencies.now?.() ?? Date.now();
    tx.update(registryRef, { sensorInventory: inventory.sensors, equipmentInventory: inventory.equipment,
      hardwareConfirmedAt: now, hardwareConfirmedBy: actor.uid });
    tx.create(firestore.collection('audit_logs').doc(), { actor: actor.uid, action: 'device.hardware.confirm',
      target: `device_registry/${deviceId}`, orgId: access.orgId, at: now,
      details: { aquariumId: input.aquariumId, inventory } });
    return { deviceId, inventory, confirmed: true, source: 'registry' };
  });
}
