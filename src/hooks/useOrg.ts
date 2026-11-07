import { useSyncExternalStore } from 'react';
import {
  getActiveMembership,
  getMemberships,
  setActiveOrg,
  subscribeOrgContext,
  type Membership,
} from '../services/orgContext';

type OrgSnapshot = { memberships: Membership[]; active: Membership | null };

let cached: OrgSnapshot = { memberships: [], active: null };
function snapshot(): OrgSnapshot {
  const memberships = getMemberships();
  const active = getActiveMembership();
  if (memberships !== cached.memberships || active !== cached.active) cached = { memberships, active };
  return cached;
}
const serverSnapshot: OrgSnapshot = { memberships: [], active: null };

/** The signed-in user's organizations, the active one, and its role. */
export function useOrg() {
  const { memberships, active } = useSyncExternalStore(subscribeOrgContext, snapshot, () => serverSnapshot);
  return {
    memberships,
    active,
    role: active?.role ?? null,
    isOwner: active?.role === 'owner',
    isCaretaker: active?.role === 'caretaker',
    switchOrg: setActiveOrg,
  };
}
