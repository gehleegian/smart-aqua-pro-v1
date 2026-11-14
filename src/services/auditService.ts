import { collection, getDocs, limit, orderBy, query, where, type Timestamp } from 'firebase/firestore';
import { db } from '../firebase';

// FR22 audit viewer (Sprint 4). audit_logs: org actions (claims, invites,
// members, maintenance, org status, rule edits). security_audit_events: the
// trusted mutations (roles, account revocation, transfers); admin only.
export type AuditEntry = {
  id: string;
  source: 'org' | 'security';
  actor: string;
  action: string;
  target: string;
  orgId: string | null;
  details: Record<string, unknown>;
  at: number;
};

const LIMIT = 300;

function toMillis(value: unknown) {
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object' && 'toMillis' in value) return (value as Timestamp).toMillis();
  return 0;
}

export async function listOrgAudit(orgId: string): Promise<AuditEntry[]> {
  const snapshot = await getDocs(query(collection(db, 'audit_logs'), where('orgId', '==', orgId), orderBy('at', 'desc'), limit(LIMIT)));
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id, source: 'org', actor: String(data.actor ?? ''), action: String(data.action ?? ''), target: String(data.target ?? ''),
      orgId: typeof data.orgId === 'string' ? data.orgId : null, details: (data.details as Record<string, unknown>) ?? {}, at: toMillis(data.at),
    };
  });
}

/** Platform admin: every org's audit log plus the security audit events. */
export async function listAllAudit(): Promise<AuditEntry[]> {
  const [org, security] = await Promise.all([
    getDocs(query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(LIMIT))),
    getDocs(query(collection(db, 'security_audit_events'), orderBy('recordedAt', 'desc'), limit(LIMIT))),
  ]);
  return [
    ...org.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id, source: 'org' as const, actor: String(data.actor ?? ''), action: String(data.action ?? ''), target: String(data.target ?? ''),
        orgId: typeof data.orgId === 'string' ? data.orgId : null, details: (data.details as Record<string, unknown>) ?? {}, at: toMillis(data.at),
      };
    }),
    ...security.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id, source: 'security' as const, actor: String(data.actorUid ?? ''), action: `${String(data.type ?? 'security')}.${String(data.stage ?? '')}`,
        target: String(data.resourceId ?? ''), orgId: null,
        details: Object.fromEntries(Object.entries(data).filter(([key]) => !['actorUid', 'type', 'stage', 'resourceId', 'recordedAt'].includes(key))),
        at: toMillis(data.recordedAt),
      };
    }),
  ].sort((a, b) => b.at - a.at);
}

const ACTION_LABELS: Record<string, string> = {
  'device.claim': 'Claimed a device',
  'device.hardware.confirm': 'Confirmed installed device hardware',
  'invite.create': 'Created an invite',
  'invite.accept': 'Accepted an invite',
  'invite.revoke': 'Revoked an invite',
  'member.remove': 'Removed a member',
  'member.assignments': 'Changed tank assignments',
  'member.promote': 'Made a member owner',
  'member.demote': 'Made an owner caretaker',
  'maintenance.log': 'Logged maintenance',
  'org.suspend': 'Suspended the organization',
  'org.reactivate': 'Reactivated the organization',
  'org.migrate': 'Migrated to organizations',
  'rule.create': 'Created a rule',
  'rule.update': 'Edited a rule',
  'rule.approve': 'Approved a rule',
  'species.create': 'Created species defaults',
  'species.update': 'Edited species defaults',
  'species.approve': 'Approved species defaults',
};

export function auditActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action;
}
