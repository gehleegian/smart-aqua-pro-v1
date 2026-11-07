import { useEffect, useMemo, useState } from 'react';
import { ScrollText } from 'lucide-react';
import Badge from '../components/ui/Badge';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { useOrg } from '../hooks/useOrg';
import { auditActionLabel, listAllAudit, listOrgAudit, type AuditEntry } from '../services/auditService';
import { listOrganizationsForAdmin, listOrgAquariums, listTeam } from '../services/orgService';
import { getAllUsers } from '../services/userService';

/**
 * FR22 (Sprint 4). Owners: their organization's audit log. Platform admin:
 * every organization plus the security audit events. Filter by action and by
 * person. Read-only; entries are written only by Cloud Functions.
 */
export default function AuditLog({ platformAdmin = false }: { platformAdmin?: boolean; onNavigate?: (page: string) => void }) {
  const { active, isOwner } = useOrg();
  const orgId = active?.orgId ?? '';
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [action, setAction] = useState('all');
  const [actor, setActor] = useState('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (platformAdmin) {
          const [all, users, orgs] = await Promise.all([listAllAudit(), getAllUsers(), listOrganizationsForAdmin()]);
          if (cancelled) return;
          setEntries(all);
          setNames(Object.fromEntries(users.map((user) => [user.id ?? '', user.name || user.email])));
          setOrgNames(Object.fromEntries(orgs.map((org) => [org.id, org.name])));
        } else if (orgId) {
          const [own, team] = await Promise.all([listOrgAudit(orgId), listOrgAquariums(orgId).then((tanks) => listTeam(orgId, tanks))]);
          if (cancelled) return;
          setEntries(own);
          setNames(Object.fromEntries(team.map((member) => [member.uid, member.displayName])));
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'The audit log could not be loaded.');
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [orgId, platformAdmin]);

  const actions = useMemo(() => [...new Set((entries ?? []).map((entry) => entry.action))].sort(), [entries]);
  const actors = useMemo(() => [...new Set((entries ?? []).map((entry) => entry.actor))].filter(Boolean), [entries]);
  const shown = (entries ?? []).filter((entry) => (action === 'all' || entry.action === action) && (actor === 'all' || entry.actor === actor));
  const who = (uid: string) => names[uid] ?? (uid ? `${uid.slice(0, 8)}…` : 'System');

  if (!platformAdmin && !isOwner) return <StatusMessage variant="warning">Only an organization owner can read the audit log.</StatusMessage>;

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <ScrollText className="h-5 w-5 text-teal-300" aria-hidden="true" /> {platformAdmin ? 'Audit log (all organizations)' : 'Audit log'}
        </h3>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Filter by action" value={action} onChange={(event) => setAction(event.target.value)}
            className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-1.5 text-sm text-slate-100">
            <option value="all" className="bg-slate-900">All actions</option>
            {actions.map((item) => <option key={item} value={item} className="bg-slate-900">{auditActionLabel(item)}</option>)}
          </select>
          <select aria-label="Filter by person" value={actor} onChange={(event) => setActor(event.target.value)}
            className="rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-1.5 text-sm text-slate-100">
            <option value="all" className="bg-slate-900">Everyone</option>
            {actors.map((uid) => <option key={uid} value={uid} className="bg-slate-900">{who(uid)}</option>)}
          </select>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? <div className="p-6"><StatusMessage variant="error">{error}</StatusMessage></div> : null}
        {entries === null && !error ? <p className="px-6 py-4 text-sm text-slate-400">Loading…</p> : null}
        {entries !== null && shown.length === 0 ? <p className="px-6 py-4 text-sm text-slate-400">No entries match.</p> : null}
        <ul className="divide-y divide-slate-700/40">
          {shown.map((entry) => (
            <li key={`${entry.source}-${entry.id}`} className="flex flex-wrap items-start justify-between gap-2 px-6 py-3">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-sm text-white">
                  <span className="font-medium">{who(entry.actor)}</span> {auditActionLabel(entry.action).toLowerCase()}
                  {entry.source === 'security' ? <Badge variant="warning">Security</Badge> : null}
                  {platformAdmin && entry.orgId ? <Badge>{orgNames[entry.orgId] ?? entry.orgId}</Badge> : null}
                </p>
                <p className="truncate text-xs text-slate-400">{entry.target}</p>
              </div>
              <time className="text-xs text-slate-400" dateTime={new Date(entry.at).toISOString()}>{new Date(entry.at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** The platform admin's page: every organization plus security events. */
export function AdminAuditLog() {
  return <AuditLog platformAdmin />;
}
