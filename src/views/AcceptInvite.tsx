import { useState } from 'react';
import { MailCheck } from 'lucide-react';
import { auth } from '../firebase';
import Button from '../components/ui/Button';
import StatusMessage from '../components/ui/StatusMessage';
import { Card, CardContent } from '../components/ui/Card';
import { acceptInvite, refreshOrgContext } from '../services/orgService';
import { clearPendingInvite, readPendingInvite, setActiveOrg } from '../services/orgContext';

/** Shown after sign-in when an /invite/<token> link was opened. */
export default function AcceptInvite({ onNavigate }: { onNavigate: (page: string) => void }) {
  const [token] = useState(() => readPendingInvite());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const email = auth.currentUser?.email ?? '';

  const accept = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      const result = await acceptInvite(token);
      clearPendingInvite();
      const uid = auth.currentUser?.uid;
      if (uid) await refreshOrgContext(uid);
      setActiveOrg(result.orgId);
      onNavigate('dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The invite could not be accepted.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="space-y-3 p-6">
          <p className="text-slate-300">No invite is waiting. Open the invite link the owner sent you.</p>
          <Button variant="secondary" onClick={() => onNavigate('dashboard')}>Go to dashboard</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="space-y-4 p-8 text-center">
        <MailCheck className="mx-auto h-10 w-10 text-teal-300" aria-hidden="true" />
        <h3 className="text-xl font-semibold text-white">You&apos;ve been invited as a caretaker</h3>
        <p className="text-sm text-slate-300">
          Accepting gives <span className="font-medium text-white">{email}</span> access to the tanks the owner chose. You&apos;ll be able to monitor them, send device commands and act on recommendations.
        </p>
        {error && <StatusMessage variant="error">{error}</StatusMessage>}
        <div className="flex justify-center gap-3">
          <Button onClick={() => void accept()} disabled={busy}>{busy ? 'Accepting…' : 'Accept invite'}</Button>
          <Button variant="ghost" onClick={() => { clearPendingInvite(); onNavigate('dashboard'); }} disabled={busy}>Not now</Button>
        </div>
      </CardContent>
    </Card>
  );
}
