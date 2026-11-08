import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { setMemberships, type Membership, type OrgRole, type OrgStatus, type OrgSummary } from './orgContext';

// Sprint 3 access model (docs/access-model.md). Reads go straight to
// Firestore under the org-scoped rules; every write is a callable.

export interface TeamMember {
  uid: string;
  role: OrgRole;
  email: string | null;
  displayName: string;
  joinedAt: number;
  aquariumIds: string[];
}

export interface PendingInvite {
  id: string;
  email: string;
  aquariumIds: string[];
  expiresAt: number;
  createdAt: number;
}

export interface OrgAquariumOption {
  id: string;
  name: string;
  status: string;
  caretakerIds: string[];
}

export interface AdminOrgRow extends OrgSummary {
  createdAt: number;
  createdBy: string;
  memberCount: number;
  aquariumCount: number;
}

function readOrg(id: string, data: Record<string, unknown> | undefined): OrgSummary {
  return {
    id,
    name: typeof data?.name === 'string' ? data.name : 'Organization',
    type: data?.type === 'business' ? 'business' : 'personal',
    status: data?.status === 'suspended' ? 'suspended' : 'active',
  };
}

export async function loadMemberships(uid: string): Promise<Membership[]> {
  const snapshot = await getDocs(query(collectionGroup(db, 'members'), where('uid', '==', uid)));
  const memberships = await Promise.all(
    snapshot.docs.map(async (member) => {
      const orgId = member.ref.parent.parent?.id ?? '';
      const role = member.get('role');
      if (!orgId || (role !== 'owner' && role !== 'caretaker')) return null;
      const org = await getDoc(doc(db, 'organizations', orgId));
      return {
        orgId,
        role,
        joinedAt: Number(member.get('joinedAt') ?? 0),
        org: readOrg(orgId, org.data()),
      } satisfies Membership;
    })
  );
  return memberships
    .filter((item): item is Membership => item !== null)
    .sort((left, right) => (left.role === right.role ? left.joinedAt - right.joinedAt : left.role === 'owner' ? -1 : 1));
}

export async function listOrgAquariums(orgId: string): Promise<OrgAquariumOption[]> {
  const snapshot = await getDocs(query(collection(db, 'aquariums'), where('orgId', '==', orgId)));
  return snapshot.docs
    .map((entry) => ({
      id: entry.id,
      name: typeof entry.get('name') === 'string' ? entry.get('name') : 'Unnamed aquarium',
      status: typeof entry.get('status') === 'string' ? entry.get('status') : 'active',
      caretakerIds: Array.isArray(entry.get('caretakerIds')) ? entry.get('caretakerIds') : [],
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function listTeam(orgId: string, aquariums: OrgAquariumOption[]): Promise<TeamMember[]> {
  const snapshot = await getDocs(collection(db, 'organizations', orgId, 'members'));
  return snapshot.docs
    .map((entry) => ({
      uid: entry.id,
      role: entry.get('role') === 'owner' ? 'owner' : 'caretaker',
      email: typeof entry.get('email') === 'string' ? entry.get('email') : null,
      displayName: typeof entry.get('displayName') === 'string' ? entry.get('displayName') : entry.id,
      joinedAt: Number(entry.get('joinedAt') ?? 0),
      aquariumIds: aquariums.filter((aquarium) => aquarium.caretakerIds.includes(entry.id)).map((aquarium) => aquarium.id),
    }) satisfies TeamMember)
    .sort((left, right) => (left.role === right.role ? left.displayName.localeCompare(right.displayName) : left.role === 'owner' ? -1 : 1));
}

export async function listPendingInvites(orgId: string): Promise<PendingInvite[]> {
  const snapshot = await getDocs(query(collection(db, 'invites'), where('orgId', '==', orgId)));
  const now = Date.now();
  return snapshot.docs
    .filter((entry) => !entry.get('usedAt') && !entry.get('revokedAt') && Number(entry.get('expiresAt')) > now)
    .map((entry) => ({
      id: entry.id,
      email: String(entry.get('email') ?? ''),
      aquariumIds: Array.isArray(entry.get('aquariumIds')) ? entry.get('aquariumIds') : [],
      expiresAt: Number(entry.get('expiresAt')),
      createdAt: Number(entry.get('createdAt') ?? 0),
    }))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function listOrganizationsForAdmin(): Promise<AdminOrgRow[]> {
  const [orgs, aquariums] = await Promise.all([
    getDocs(collection(db, 'organizations')),
    getDocs(collection(db, 'aquariums')),
  ]);
  const aquariumCount = new Map<string, number>();
  aquariums.docs.forEach((entry) => {
    const orgId = entry.get('orgId');
    if (typeof orgId === 'string') aquariumCount.set(orgId, (aquariumCount.get(orgId) ?? 0) + 1);
  });
  const rows = await Promise.all(
    orgs.docs.map(async (entry) => {
      const members = await getDocs(collection(db, 'organizations', entry.id, 'members'));
      return {
        ...readOrg(entry.id, entry.data()),
        createdAt: Number(entry.get('createdAt') ?? 0),
        createdBy: String(entry.get('createdBy') ?? ''),
        memberCount: members.size,
        aquariumCount: aquariumCount.get(entry.id) ?? 0,
      } satisfies AdminOrgRow;
    })
  );
  return rows.sort((left, right) => left.name.localeCompare(right.name));
}

// ---- Callables (functions/src/orgAccess.ts) --------------------------------

async function call<T>(name: string, data: Record<string, unknown>): Promise<T> {
  try {
    const result = await httpsCallable<Record<string, unknown>, T>(functions, name)(data);
    return result.data;
  } catch (error) {
    // HttpsError messages are written for people ("Invalid code.").
    const message = error instanceof Error ? error.message : '';
    throw new Error(message && message !== 'internal' ? message : 'Something went wrong. Try again.');
  }
}

export type ClaimResult = { orgId: string; aquariumId: string; deviceId: string; orgCreated: boolean };

export function claimDevice(input: { deviceId: string; claimCode: string; aquariumName: string; orgName?: string; orgId?: string }) {
  return call<ClaimResult>('claimDevice', input);
}

export function createInvite(input: { orgId: string; email: string; aquariumIds: string[] }) {
  return call<{ inviteId: string; token: string; path: string; expiresAt: number }>('createInvite', input);
}

export function acceptInvite(token: string) {
  return call<{ orgId: string; aquariumIds: string[] }>('acceptInvite', { token });
}

export function revokeInvite(inviteId: string) {
  return call<{ inviteId: string }>('revokeInvite', { inviteId });
}

export function removeMember(orgId: string, uid: string) {
  return call<{ removed: boolean }>('removeMember', { orgId, uid });
}

/** Sprint 4 co-owners: promote a caretaker to owner or demote an owner (≥1 owner always). */
export function setMemberRole(orgId: string, uid: string, role: OrgRole) {
  return call<{ changed: boolean; primaryOwnerMoved: string[] }>('setMemberRole', { orgId, uid, role });
}

export function updateCaretakerAssignments(orgId: string, uid: string, aquariumIds: string[]) {
  return call<{ changed: string[] }>('updateCaretakerAssignments', { orgId, uid, aquariumIds });
}

export function setOrganizationStatus(orgId: string, status: OrgStatus, reason?: string) {
  return call<{ status: OrgStatus }>('setOrganizationStatus', { orgId, status, ...(reason ? { reason } : {}) });
}

export function inviteLink(path: string) {
  return typeof window === 'undefined' ? path : `${window.location.origin}${path}`;
}

/** Loads the user's memberships into the org store (call after sign-in and after a claim/accept). */
export async function refreshOrgContext(uid: string) {
  setMemberships(uid, await loadMemberships(uid));
}
