import { useState } from 'react';
import QRCode from 'qrcode';
import { KeyRound, ShieldCheck, ShieldAlert } from 'lucide-react';
import { auth } from '../../firebase';
import { currentUserFactors, mfaEnabled, mfaFlows, mfaMockMode } from '../../services/mfaService';
import { hasTotpFactor, MfaFlowError, type EnrolledFactor, type TotpSecretLike } from '../../utils/mfa';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Button from '../ui/Button';
import StatusMessage from '../ui/StatusMessage';
import TotpCodeForm from '../auth/TotpCodeForm';

// Sprint 5: two-step verification with an authenticator app (TOTP).
// Required for platform admins, optional for owners and caretakers
// (src/utils/mfa.ts mfaRequirement; docs/access-model.md MFA section).

export function RecoveryGuidance() {
  return (
    <div className="space-y-1 rounded-lg border border-slate-600/40 bg-slate-900/30 px-4 py-3 text-xs text-slate-300">
      <p className="font-semibold text-slate-200">If you lose your phone</p>
      <ul className="list-disc space-y-1 pl-4">
        <li>Keep the setup key shown during setup somewhere safe (a password manager), or set up the same account on a second device now. Either lets you add the app back.</li>
        <li>Most authenticator apps can back up to the cloud. Turn that on if yours supports it.</li>
        <li>If you have no backup, contact SmartAqua support or your platform administrator. After confirming who you are, they remove the second factor in the Firebase console (Authentication, Users, your account, Multi-factor). You then sign in with your password and set up a new app.</li>
      </ul>
    </div>
  );
}

export default function MfaSettings({ required = false, onEnrolled }: { required?: boolean; onEnrolled?: () => void }) {
  const [factors, setFactors] = useState<EnrolledFactor[]>(() => (mfaEnabled ? currentUserFactors() : []));
  const [pending, setPending] = useState<{ secret: TotpSecretLike; secretKey: string; qr: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  if (!mfaEnabled) {
    return (
      <Card>
        <CardHeader><h2 className="flex items-center gap-2 text-base font-semibold text-white"><KeyRound className="h-4 w-4" aria-hidden="true" /> Two-step verification</h2></CardHeader>
        <CardContent>
          <p className="text-sm text-slate-300">Two-step verification with an authenticator app is not switched on for this deployment yet. It becomes available after the go-live step that enables it (Identity Platform with TOTP).</p>
        </CardContent>
      </Card>
    );
  }

  const enrolled = hasTotpFactor(factors);
  const start = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await mfaFlows.startEnrollment(user, user.email ?? user.uid);
      setPending({ secret: result.secret, secretKey: result.secretKey, qr: await QRCode.toDataURL(result.otpauthUrl, { margin: 1, width: 220 }) });
    } catch (err) {
      setError(err instanceof MfaFlowError ? err.message : 'Two-step verification could not be started.');
    } finally {
      setBusy(false);
    }
  };
  const verify = async (code: string) => {
    const user = auth.currentUser;
    if (!user || !pending) return;
    setBusy(true);
    setError('');
    try {
      setFactors(await mfaFlows.finishEnrollment(user, pending.secret, code));
      setPending(null);
      setNotice('Two-step verification is on. Next time you sign in, you will also enter a code from your authenticator app.');
      onEnrolled?.();
    } catch (err) {
      setError(err instanceof MfaFlowError ? err.message : 'That code could not be checked.');
    } finally {
      setBusy(false);
    }
  };
  const remove = async (factorUid: string) => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      setFactors(await mfaFlows.unenroll(user, factorUid));
      setNotice('The authenticator app was removed.');
    } catch (err) {
      setError(err instanceof MfaFlowError ? err.message : 'It could not be removed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          {enrolled ? <ShieldCheck className="h-4 w-4 text-emerald-300" aria-hidden="true" /> : <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden="true" />}
          Two-step verification {enrolled ? '(on)' : '(off)'}
        </h2>
        <p className="text-sm text-slate-300">
          {required ? 'Required for platform administrators.' : 'Optional. Recommended for owners.'} Uses an authenticator app such as Google Authenticator or Microsoft Authenticator. No text messages are sent.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {mfaMockMode ? <StatusMessage variant="warning">Emulator mock: no real authenticator is involved. The code is 123456.</StatusMessage> : null}
        <div aria-live="polite" className="space-y-2">
          {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
          {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}
        </div>
        {factors.length > 0 ? (
          <ul className="divide-y divide-slate-700/50 text-sm">
            {factors.map((factor) => (
              <li key={factor.uid} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="text-slate-100">{factor.displayName ?? 'Authenticator app'} <span className="text-xs text-slate-400">({factor.factorId.toUpperCase()}{factor.enrollmentTime ? `, added ${factor.enrollmentTime}` : ''})</span></span>
                {!required ? (
                  <Button variant="ghost" size="sm" disabled={busy} onClick={() => void remove(factor.uid)}>Remove</Button>
                ) : <span className="text-xs text-slate-400">Required: ask support to replace it</span>}
              </li>
            ))}
          </ul>
        ) : null}
        {!enrolled && !pending ? (
          <Button onClick={() => void start()} disabled={busy}>Set up authenticator app</Button>
        ) : null}
        {pending ? (
          <div className="grid gap-4 md:grid-cols-[240px_1fr]">
            <div className="space-y-2">
              {/* A data: URL generated in the browser; next/image adds nothing here. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending.qr} width={220} height={220} alt="QR code to add SmartAqua Pro to your authenticator app" className="rounded bg-white p-2" />
            </div>
            <div className="space-y-3 text-sm text-slate-200">
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open your authenticator app and scan the QR code.</li>
                <li>Can&apos;t scan? Enter this setup key instead: <code className="select-all break-all rounded bg-slate-900/60 px-1.5 py-0.5 font-mono">{pending.secretKey}</code></li>
                <li>Type the 6-digit code the app shows.</li>
              </ol>
              <TotpCodeForm submitLabel={busy ? 'Checking...' : 'Verify and turn on'} busy={busy} onSubmit={(code) => void verify(code)} />
              <Button variant="ghost" size="sm" onClick={() => setPending(null)}>Cancel</Button>
            </div>
          </div>
        ) : null}
        <RecoveryGuidance />
      </CardContent>
    </Card>
  );
}
