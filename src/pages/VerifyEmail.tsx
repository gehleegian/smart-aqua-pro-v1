import { useState } from 'react';
import { CheckCircle2, Mail } from 'lucide-react';
import type { UserData } from '../types/user';
import {
  confirmEmailVerification,
  resendVerificationEmail,
} from '../services/authService';

export default function VerifyEmail({
  email,
  onVerified,
  onSignOut,
}: {
  email: string;
  onVerified: (user: UserData) => void;
  onSignOut: () => Promise<void>;
}) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);

  const handleCheck = async () => {
    try {
      setChecking(true);
      setError('');
      setMessage('');
      const profile = await confirmEmailVerification();

      if (!profile) {
        setError('Your email is not verified yet. Open the verification link, then try again.');
        return;
      }

      onVerified(profile);
    } catch (checkError) {
      setError(checkError instanceof Error ? checkError.message : 'Unable to check verification.');
    } finally {
      setChecking(false);
    }
  };

  const handleResend = async () => {
    try {
      setResending(true);
      setError('');
      await resendVerificationEmail();
      setMessage('A new verification email was sent. Please check your inbox and spam folder.');
    } catch (resendError) {
      setError(
        resendError instanceof Error
          ? resendError.message
          : 'Unable to resend the verification email.'
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-8 text-slate-100">
      <div className="w-full max-w-lg rounded-3xl border border-cyan-400/20 bg-slate-900/90 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-cyan-400/10 text-cyan-300">
          <Mail size={30} />
        </div>
        <h1 className="text-2xl font-bold">Verify your email</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          We sent a verification link to <strong className="text-white">{email}</strong>. Open
          the link before accessing your aquariums.
        </p>

        {message && (
          <div className="mt-5 flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/10 p-3 text-left text-sm text-emerald-200">
            <CheckCircle2 className="mt-0.5 shrink-0" size={17} />
            {message}
          </div>
        )}

        {error && (
          <div className="mt-5 rounded-xl border border-red-400/25 bg-red-400/10 p-3 text-left text-sm text-red-200">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleCheck()}
          disabled={checking}
          className="mt-6 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {checking ? 'Checking...' : 'I Have Verified My Email'}
        </button>
        <button
          type="button"
          onClick={() => void handleResend()}
          disabled={resending}
          className="mt-3 w-full rounded-xl border border-cyan-400/25 px-4 py-3 font-semibold text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resending ? 'Sending...' : 'Resend Verification Email'}
        </button>
        <button
          type="button"
          onClick={() => void onSignOut()}
          className="mt-4 text-sm font-semibold text-slate-400 hover:text-white"
        >
          Use a different account
        </button>
      </div>
    </div>
  );
}
