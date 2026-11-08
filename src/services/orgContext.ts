// Non-React store for the signed-in user's organizations and the active one.
// Services (aquariumService, deviceService) read it to scope queries and to
// skip owner-only writes for caretakers; the UI reads it through useOrg().
// Firestore and RTDB rules enforce the same model; this only shapes the UI.

export type OrgRole = 'owner' | 'caretaker';
export type OrgStatus = 'active' | 'suspended';

export interface OrgSummary {
  id: string;
  name: string;
  type: 'personal' | 'business';
  status: OrgStatus;
}

export interface Membership {
  orgId: string;
  role: OrgRole;
  joinedAt: number;
  org: OrgSummary;
}

type Listener = () => void;

const ACTIVE_ORG_KEY = 'smartAquaActiveOrg';
let memberships: Membership[] = [];
let activeOrgId: string | null = null;
let currentUid: string | null = null;
const listeners = new Set<Listener>();

function readStoredOrg() {
  try {
    return window.localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    return null;
  }
}

function storeOrg(orgId: string | null) {
  try {
    if (orgId) window.localStorage.setItem(ACTIVE_ORG_KEY, orgId);
    else window.localStorage.removeItem(ACTIVE_ORG_KEY);
  } catch {
    // Browser storage is a convenience only.
  }
}

export function setMemberships(uid: string | null, next: Membership[]) {
  currentUid = uid;
  memberships = next;
  const stored = activeOrgId ?? readStoredOrg();
  activeOrgId = next.some((item) => item.orgId === stored) ? stored : next[0]?.orgId ?? null;
  storeOrg(activeOrgId);
  listeners.forEach((listener) => listener());
}

export function setActiveOrg(orgId: string) {
  if (!memberships.some((item) => item.orgId === orgId)) return;
  activeOrgId = orgId;
  storeOrg(orgId);
  listeners.forEach((listener) => listener());
}

export function clearOrgContext() {
  setMemberships(null, []);
}

export function getMemberships() {
  return memberships;
}

export function getActiveMembership(): Membership | null {
  return memberships.find((item) => item.orgId === activeOrgId) ?? null;
}

export function getCurrentUid() {
  return currentUid;
}

export function isActiveOrgOwner() {
  return getActiveMembership()?.role === 'owner';
}

export function subscribeOrgContext(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- Pending invite token (survives sign-up and the email verification tab)
const INVITE_KEY = 'smartAquaPendingInvite';
const INVITE_TTL_MS = 48 * 60 * 60 * 1000;

export function savePendingInvite(token: string) {
  try {
    window.localStorage.setItem(INVITE_KEY, JSON.stringify({ token, savedAt: Date.now() }));
  } catch {
    // ignore
  }
}

export function readPendingInvite(): string | null {
  try {
    const raw = window.localStorage.getItem(INVITE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown; savedAt?: unknown };
    if (typeof parsed.token !== 'string' || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > INVITE_TTL_MS) {
      window.localStorage.removeItem(INVITE_KEY);
      return null;
    }
    return parsed.token;
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    window.localStorage.removeItem(INVITE_KEY);
  } catch {
    // ignore
  }
}

// ---- Setup wizard target (set after a claim or from "Finish setup")
let setupAquariumId: string | null = null;
export function setSetupTarget(aquariumId: string | null) {
  setupAquariumId = aquariumId;
}
export function getSetupTarget() {
  return setupAquariumId;
}
