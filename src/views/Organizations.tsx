import { useCallback, useEffect, useState } from 'react';
import { Ban, Building2, RotateCcw } from 'lucide-react';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import ConfirmModal from '../components/ui/ConfirmModal';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { listOrganizationsForAdmin, setOrganizationStatus, type AdminOrgRow } from '../services/orgService';

/**
 * Platform admin: every organization, read-only, plus suspend/reactivate
 * (audited, through the setOrganizationStatus callable). Admins do not create
 * orgs or assign devices.
 */
export default function Organizations() {
  const [rows, setRows] = useState<AdminOrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<AdminOrgRow | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      setRows(await listOrganizationsForAdmin());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Organizations could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Same deferral as the other page controllers (react-hooks/set-state-in-effect).
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const changeStatus = async (row: AdminOrgRow) => {
    const next = row.status === 'active' ? 'suspended' : 'active';
    setBusy(row.id);
    setError('');
    try {
      await setOrganizationStatus(row.id, next);
      setNotice(`${row.name} is now ${next}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The status could not be changed.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="space-y-6">
      {error && <StatusMessage variant="error">{error}</StatusMessage>}
      {notice && <StatusMessage variant="success">{notice}</StatusMessage>}
      <Card>
        <CardHeader>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white"><Building2 className="h-5 w-5 text-teal-300" aria-hidden="true" /> Organizations</h3>
          <p className="mt-1 text-sm text-slate-400">Owners create organizations by claiming their first device. Suspending one locks out its owner, caretakers and devices until it is reactivated.</p>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs text-slate-400">
              <tr>
                <th className="px-6 py-3 font-medium">Name</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Members</th>
                <th className="px-6 py-3 font-medium">Aquariums</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/40">
              {loading && <tr><td className="px-6 py-4 text-slate-300" colSpan={6}>Loading…</td></tr>}
              {!loading && rows.length === 0 && <tr><td className="px-6 py-4 text-slate-400" colSpan={6}>No organizations yet.</td></tr>}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-6 py-3 text-white">{row.name}<p className="text-xs text-slate-500">{row.id}</p></td>
                  <td className="px-6 py-3 capitalize text-slate-300">{row.type}</td>
                  <td className="px-6 py-3 tabular-nums text-slate-300">{row.memberCount}</td>
                  <td className="px-6 py-3 tabular-nums text-slate-300">{row.aquariumCount}</td>
                  <td className="px-6 py-3"><Badge variant={row.status === 'active' ? 'success' : 'danger'}>{row.status === 'active' ? 'Active' : 'Suspended'}</Badge></td>
                  <td className="px-6 py-3 text-right">
                    <Button size="sm" variant={row.status === 'active' ? 'danger' : 'secondary'} disabled={busy === row.id} onClick={() => setPending(row)}>
                      {row.status === 'active' ? <><Ban className="h-3.5 w-3.5" aria-hidden="true" /> Suspend</> : <><RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reactivate</>}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
      {pending && (
        <ConfirmModal
          title={pending.status === 'active' ? `Suspend ${pending.name}?` : `Reactivate ${pending.name}?`}
          description={pending.status === 'active'
            ? 'Its owner, caretakers and devices lose access immediately. This is recorded in the audit log.'
            : 'Access is restored for its owner, caretakers and devices. This is recorded in the audit log.'}
          confirmLabel={pending.status === 'active' ? 'Suspend' : 'Reactivate'}
          danger={pending.status === 'active'}
          onConfirm={() => {
            const row = pending;
            setPending(null);
            void changeStatus(row);
          }}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}
