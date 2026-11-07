import type { DocumentSnapshot, Firestore, Transaction } from 'firebase-admin/firestore';
import { MutationError } from './trustedMutations.js';

/**
 * Server-side twin of the Firestore rules' memberAccess() (docs/access-model.md):
 * an org aquarium is reachable by any owner member of an active org and by a
 * caretaker member listed in caretakerIds; a legacy (no orgId) aquarium only by
 * its ownerId. Never trust a client-supplied aquariumId without this.
 */
export type AquariumAccess = {
  aquarium: DocumentSnapshot;
  orgId: string | null;
  role: 'owner' | 'caretaker';
};

export type Actor = {
  uid: string;
  email: string | null;
  emailVerified: boolean;
  platformAdmin: boolean;
};

export function requireVerifiedActor(actor: Actor) {
  if (!actor.emailVerified || !actor.email) {
    throw new MutationError('permission-denied', 'Verify your email address first.');
  }
  if (actor.platformAdmin) {
    throw new MutationError('permission-denied', 'Platform administrators have read-only access to aquariums.');
  }
}

export async function requireAquariumMember(
  firestore: Firestore,
  uid: string,
  aquariumId: string,
  transaction?: Transaction
): Promise<AquariumAccess> {
  const read = (path: string) => (transaction ? transaction.get(firestore.doc(path)) : firestore.doc(path).get());
  const aquarium = await read(`aquariums/${aquariumId}`);
  if (!aquarium.exists) throw new MutationError('not-found', 'Aquarium not found.');
  const orgId = typeof aquarium.get('orgId') === 'string' ? (aquarium.get('orgId') as string) : null;
  if (!orgId) {
    if (aquarium.get('ownerId') === uid) return { aquarium, orgId: null, role: 'owner' };
    throw new MutationError('permission-denied', 'You do not have access to this aquarium.');
  }
  const [org, member] = await Promise.all([read(`organizations/${orgId}`), read(`organizations/${orgId}/members/${uid}`)]);
  if (!org.exists || org.get('status') !== 'active') {
    throw new MutationError('failed-precondition', 'This organization is suspended. Contact SmartAqua support.');
  }
  const role = member.exists ? member.get('role') : null;
  if (role === 'owner') return { aquarium, orgId, role };
  const caretakerIds = (aquarium.get('caretakerIds') as unknown[] | undefined) ?? [];
  if (role === 'caretaker' && caretakerIds.includes(uid)) return { aquarium, orgId, role };
  throw new MutationError('permission-denied', 'You do not have access to this aquarium.');
}

/**
 * Who should hear about an aquarium: every owner of its (active) org plus the
 * caretakers assigned to it who are still caretaker members. Legacy aquarium:
 * its ownerId. A suspended org has no recipients.
 */
export async function aquariumRecipients(firestore: Firestore, aquarium: Record<string, unknown>) {
  const orgId = typeof aquarium.orgId === 'string' ? aquarium.orgId : null;
  if (!orgId) {
    return typeof aquarium.ownerId === 'string' && aquarium.ownerId ? [{ uid: aquarium.ownerId, role: 'owner' as const }] : [];
  }
  const org = await firestore.doc(`organizations/${orgId}`).get();
  if (!org.exists || org.get('status') !== 'active') return [];
  const caretakerIds = Array.isArray(aquarium.caretakerIds) ? aquarium.caretakerIds.filter((id): id is string => typeof id === 'string') : [];
  const [owners, ...caretakers] = await Promise.all([
    firestore.collection(`organizations/${orgId}/members`).where('role', '==', 'owner').get(),
    ...caretakerIds.map((uid) => firestore.doc(`organizations/${orgId}/members/${uid}`).get()),
  ]);
  return [
    ...owners.docs.map((doc) => ({ uid: doc.id, role: 'owner' as const })),
    ...caretakers.filter((doc) => doc.exists && doc.get('role') === 'caretaker').map((doc) => ({ uid: doc.id, role: 'caretaker' as const })),
  ];
}
