import { useCallback, useEffect, useState } from 'react';
import { Copy, Link2, Pencil, Trash2, UserPlus, X } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmModal from '../components/ui/ConfirmModal';
import Input from '../components/ui/Input';
import Modal from '../components/ui/Modal';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { useOrg } from '../hooks/useOrg';
import {
  createInvite,
  inviteLink,
  listOrgAquariums,
  listPendingInvites,
  listTeam,
  removeMember,
  revokeInvite,
  updateCaretakerAssignments,
  type OrgAquariumOption,
  type PendingInvite,
  type TeamMember,
} from '../services/orgService';

function TankPicker({ aquariums, selected, onChange }: { aquariums: OrgAquariumOption[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-slate-200">Tanks they can see</legend>
      {aquariums.length === 0 && <p className="text-sm text-slate-400">No aquariums yet. Add a device first.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {aquariums.map((aquarium) => (
          <label key={aquarium.id} className="flex items-center gap-2 rounded-lg border border-slate-600/30 bg-slate-900/30 px-3 py-2 text-sm text-slate-200">
            <input
              type="checkbox"
              className="accent-teal-500"
              checked={selected.includes(aquarium.id)}
              onChange={(event) => onChange(event.target.checked ? [...selected, aquarium.id] : selected.filter((id) => id !== aquarium.id))}
            />
            {aquarium.name}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Owner's team page: members and their tanks, invite by link (no email is
 * sent; the owner shares the link), pending invites, reassign, remove.
 * Every change is a callable that also updates the RTDB access mirror.
 */
export default function Team() {
  const { active, isOwner } = useOrg();
  const orgId = active?.orgId ?? '';
  const [aquariums, setAquariums] = useState<OrgAquariumOption[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [inviteTanks, setInviteTanks] = useState<string[]>([]);
  const [createdLink, setCreatedLink] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [editTanks, setEditTanks] = useState<string[]>([]);
  const [removing, setRemoving] = useState<TeamMember | null>(null);

  const load = useCallback(async () => {
    if (!orgId) return;
    try {
      const tanks = await listOrgAquariums(orgId);
      const [team, pending] = await Promise.all([listTeam(orgId, tanks), listPendingInvites(orgId)]);
      setAquariums(tanks);
      setMembers(team);
      setInvites(pending);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The team could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    // Same deferral as the other page controllers (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const tankName = (id: string) => aquariums.find((aquarium) => aquarium.id === id)?.name ?? 'Removed tank';

  const run = async (key: string, action: () => Promise<void>, success: string) => {
    setBusy(key);
    setError('');
    setNotice('');
    try {
      await action();
      setNotice(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work. Try again.');
    } finally {
      setBusy('');
    }
  };

  const handleInvite = () =>
    run('invite', async () => {
      const result = await createInvite({ orgId, email: email.trim(), aquariumIds: inviteTanks });
      setCreatedLink(inviteLink(result.path));
      setEmail('');
      setInviteTanks([]);
    }, 'Invite created. Copy the link and send it to them (Messenger, SMS…).');

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(createdLink);
      setNotice('Link copied.');
    } catch {
      setNotice('Copy failed: select the link and copy it by hand.');
    }
  };

  if (!isOwner) return <StatusMessage variant="warning">Only an organization owner can manage the team.</StatusMessage>;

  return (
    <div className="space-y-6">
      {error && <StatusMessage variant="error">{error}</StatusMessage>}
      {notice && <StatusMessage variant="success">{notice}</StatusMessage>}

      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><UserPlus className="h-5 w-5 text-teal-300" aria-hidden="true" /> Invite a caretaker</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input label="Their email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
          <TankPicker aquariums={aquariums} selected={inviteTanks} onChange={setInviteTanks} />
          <p className="text-xs text-slate-400">The link works once, for this email only, for 48 hours. Caretakers can monitor, send device commands and apply recommendations. They cannot edit profiles, thresholds or schedules.</p>
          <Button onClick={() => void handleInvite()} disabled={busy === 'invite' || !email.trim() || inviteTanks.length === 0}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> {busy === 'invite' ? 'Creating…' : 'Create invite link'}
          </Button>
          {createdLink && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-300/30 bg-teal-500/10 p-3">
              <code className="min-w-0 flex-1 break-all text-xs text-teal-100">{createdLink}</code>
              <Button size="sm" variant="secondary" onClick={() => void copyLink()}><Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy link</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h3 className="text-lg font-semibold text-white">Members</h3></CardHeader>
        <CardContent className="divide-y divide-slate-700/40 p-0">
          {loading && <p className="px-6 py-4 text-slate-300">Loading…</p>}
          {members.map((member) => (
            <div key={member.uid} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium text-white">
                  {member.displayName}
                  <Badge variant={member.role === 'owner' ? 'info' : 'success'}>{member.role === 'owner' ? 'Owner' : 'Caretaker'}</Badge>
                </p>
                <p className="truncate text-sm text-slate-400">{member.email ?? member.uid}</p>
                <p className="mt-1 text-xs text-slate-400">
                  {member.role === 'owner' ? 'All tanks' : member.aquariumIds.length ? member.aquariumIds.map(tankName).join(', ') : 'No tanks assigned'}
                </p>
              </div>
              {member.role === 'caretaker' && (
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => { setEditing(member); setEditTanks(member.aquariumIds); }}>
                    <Pencil className="h-3.5 w-3.5" aria-hidden="true" /> Tanks
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(member)}>
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Remove
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h3 className="text-lg font-semibold text-white">Pending invites</h3></CardHeader>
        <CardContent className="divide-y divide-slate-700/40 p-0">
          {!loading && invites.length === 0 && <p className="px-6 py-4 text-sm text-slate-400">No pending invites.</p>}
          {invites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
              <div>
                <p className="text-white">{invite.email}</p>
                <p className="text-xs text-slate-400">{invite.aquariumIds.map(tankName).join(', ')} · expires {new Date(invite.expiresAt).toLocaleString()}</p>
              </div>
              <Button size="sm" variant="ghost" disabled={busy === invite.id}
                onClick={() => void run(invite.id, async () => { await revokeInvite(invite.id); }, 'Invite revoked.')}>
                <X className="h-3.5 w-3.5" aria-hidden="true" /> Revoke
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {editing && (
        <Modal labelledBy="team-edit-title" onClose={() => setEditing(null)} className="max-w-lg">
          <div className="space-y-4 p-6">
            <h3 id="team-edit-title" className="font-semibold text-white">Tanks for {editing.displayName}</h3>
            <TankPicker aquariums={aquariums} selected={editTanks} onChange={setEditTanks} />
            <div className="flex gap-3">
              <Button disabled={busy === 'assign'} onClick={() => void run('assign', async () => { await updateCaretakerAssignments(orgId, editing.uid, editTanks); setEditing(null); }, 'Tank access updated.')}>Save</Button>
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            </div>
          </div>
        </Modal>
      )}

      {removing && (
        <ConfirmModal
          title={`Remove ${removing.displayName}?`}
          description="Their access to every tank ends immediately. Their past actions stay in the logs."
          confirmLabel="Remove"
          danger
          onConfirm={() => {
            const target = removing;
            setRemoving(null);
            void run(target.uid, async () => { await removeMember(orgId, target.uid); }, `${target.displayName} was removed. Their access ended now; their past actions stay in the logs.`);
          }}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}
