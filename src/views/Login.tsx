import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthShell, {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authSubmitClassName,
} from '../components/auth/AuthShell';
import TotpCodeForm from '../components/auth/TotpCodeForm';
import {
  completeMfaLogin,
  EmailVerificationRequiredError,
  MfaChallengeRequiredError,
  loginUser,
  requestPasswordReset,
  resendVerificationEmail,
} from '../services/authService';
import type { UserData } from '../types/user';
import { getAuthErrorMessage } from '../utils/authErrors';
import { MfaFlowError } from '../utils/mfa';
import { formatAuthRateLimitDuration, getAuthRateLimitStatus } from '../utils/authRateLimit';

const RESEND_COOLDOWN_MS = 60_000;

export default function Login({
  onLogin,
  onGoToSignup,
  onGoBack,
  infoMessage = '',
  verificationRequired = false,
}: {
  onLogin: (user: UserData) => void;
  onGoToSignup: () => void;
  onGoBack: () => void;
  infoMessage?: string;
  verificationRequired?: boolean;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(verificationRequired);
  const [resending, setResending] = useState(false);
  const [resendAvailableAt, setResendAvailableAt] = useState(0);
  const [sendingReset, setSendingReset] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [mfaChallenge, setMfaChallenge] = useState<MfaChallengeRequiredError['challenge'] | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const rateLimitStatus = useMemo(() => getAuthRateLimitStatus('login', now), [now]);
  const rateLimitMessage = rateLimitStatus.blocked
    ? `Too many sign-in attempts. Try again in ${formatAuthRateLimitDuration(
        rateLimitStatus.retryAfterMs
      )}.`
    : '';
  const resendCooldownSeconds = Math.ceil(Math.max(0, resendAvailableAt - now) / 1000);
  const resendDisabled = resending || resendCooldownSeconds > 0 || rateLimitStatus.blocked;

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill in all fields.');
      return;
    }

    if (rateLimitStatus.blocked) {
      setError(rateLimitMessage);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setNotice('');
      setNeedsVerification(false);

      onLogin(await loginUser(email, password));
    } catch (err: unknown) {
      if (err instanceof MfaChallengeRequiredError) {
        setMfaChallenge(err.challenge);
      } else if (err instanceof MfaFlowError) {
        setError(err.message);
      } else if (err instanceof EmailVerificationRequiredError) {
        setNeedsVerification(true);
      } else {
        console.error('Login failed:', err);
        setError(getAuthErrorMessage(err, 'Login failed.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!email || !password) {
      setError('Enter your email and password to resend the verification email.');
      return;
    }

    try {
      setResending(true);
      setError('');
      setNotice('');

      const result = await resendVerificationEmail(email, password);

      if (result === 'already-verified') {
        setNeedsVerification(false);
        setNotice('Your email is already verified. You can sign in now.');
      } else {
        setResendAvailableAt(Date.now() + RESEND_COOLDOWN_MS);
        setNotice('Verification email sent. Check your inbox.');
      }
    } catch (err: unknown) {
      console.error('Failed to resend verification email:', err);
      setError(getAuthErrorMessage(err, 'Could not resend the verification email.'));
    } finally {
      setResending(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Enter your email address first.');
      return;
    }

    try {
      setSendingReset(true);
      setError('');
      setNotice('');

      await requestPasswordReset(email);

      setNotice('If an account exists for that email, a password reset link has been sent.');
    } catch (err: unknown) {
      console.error('Failed to request password reset:', err);
      setError(getAuthErrorMessage(err, 'Could not request a password reset.'));
    } finally {
      setSendingReset(false);
    }
  };

  const signInDisabled = loading || rateLimitStatus.blocked;

  const handleMfaCode = async (code: string) => {
    if (!mfaChallenge) return;
    try {
      setLoading(true);
      setError('');
      onLogin(await completeMfaLogin(mfaChallenge, code));
    } catch (err: unknown) {
      setError(err instanceof MfaFlowError ? err.message : getAuthErrorMessage(err, 'Login failed.'));
      if (err instanceof MfaFlowError && (err.code === 'auth/totp-challenge-timeout' || err.code === 'auth/code-expired')) {
        setMfaChallenge(null);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell onBack={onGoBack}>
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-white">Welcome back</h1>
            <p className="mt-1 text-sm text-slate-300">
              Sign in to access your aquarium dashboard.
            </p>
          </div>

          <div aria-live="polite" className="empty:hidden mb-5 space-y-3">
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200"
              >
                {error}
              </div>
            )}

            {!error && (notice || infoMessage) && (
              <div className="rounded-lg border border-teal-300/25 bg-teal-500/10 px-4 py-3 text-sm text-teal-100">
                {notice || infoMessage}
              </div>
            )}

            {needsVerification && (
              <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <p className="mb-3">Please verify your email first.</p>
                <button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendDisabled}
                  className="rounded-lg border border-amber-300/40 px-3 py-2 text-xs font-semibold text-amber-200 transition-colors hover:bg-amber-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resending
                    ? 'Sending...'
                    : resendCooldownSeconds > 0
                      ? `Resend available in ${resendCooldownSeconds}s`
                      : 'Resend verification email'}
                </button>
              </div>
            )}

            {!error && rateLimitMessage && (
              <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                {rateLimitMessage}
              </div>
            )}
          </div>

          {mfaChallenge ? (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Two-step verification</h2>
              <TotpCodeForm
                submitLabel={loading ? 'Checking...' : 'Verify and sign in'}
                busy={loading}
                onSubmit={(code) => void handleMfaCode(code)}
                inputClassName={`${authInputClassName} font-mono text-lg tracking-widest`}
                buttonClassName={authSubmitClassName}
              />
              <p className="text-xs text-slate-400">
                Lost your phone? An administrator can remove your second factor after confirming who you are (see Settings → Two-step verification for recovery steps).
              </p>
              <button type="button" className={`${authLinkClassName} text-sm`} onClick={() => { setMfaChallenge(null); setError(''); }}>
                Use a different account
              </button>
            </div>
          ) : (
          <form
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              void handleLogin();
            }}
          >
            <div className="mb-4">
              <label htmlFor="login-email" className={authLabelClassName}>
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={authInputClassName}
              />
            </div>

            <div className="mb-2">
              <label htmlFor="login-password" className={authLabelClassName}>
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className={`${authInputClassName} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Eye className="h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div className="mb-6 text-right">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={sendingReset}
                className={`${authLinkClassName} text-sm`}
              >
                {sendingReset ? 'Sending...' : 'Forgot password?'}
              </button>
            </div>

            <button
              type="submit"
              disabled={signInDisabled}
              className={authSubmitClassName}
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {loading
                ? 'Signing in...'
                : rateLimitStatus.blocked
                  ? `Try again in ${formatAuthRateLimitDuration(rateLimitStatus.retryAfterMs)}`
                  : 'Sign in'}
            </button>
          </form>
          )}

          <p className="mt-6 text-center text-sm text-slate-300">
            Don&apos;t have an account?{' '}
            <button type="button" onClick={onGoToSignup} className={authLinkClassName}>
              Sign up
            </button>
          </p>
    </AuthShell>
  );
}
