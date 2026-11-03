import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  Eye,
  EyeOff,
  Gauge,
  LockKeyhole,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { loginUser } from '../services/authService';
import {
  isVerificationPolicyUnavailableError,
  VERIFICATION_POLICY_UNAVAILABLE_MESSAGE,
} from '../services/emailVerificationPolicyService';
import type { UserData } from '../types/user';
import {
  formatAuthRateLimitDuration,
  getAuthRateLimitStatus,
  isAuthRateLimitError,
} from '../utils/authRateLimit';

function getFirebaseAuthErrorCode(error: unknown): string {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function getLoginError(error: unknown) {
  if (isAuthRateLimitError(error)) return error.message;
  if (isVerificationPolicyUnavailableError(error)) {
    return VERIFICATION_POLICY_UNAVAILABLE_MESSAGE;
  }

  const messages: Record<string, string> = {
    'auth/invalid-credential': 'The email or password is incorrect.',
    'auth/user-not-found': 'No account was found for this email address.',
    'auth/wrong-password': 'The email or password is incorrect.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
    'auth/user-disabled': 'This Firebase Authentication account has been disabled.',
  };

  return messages[getFirebaseAuthErrorCode(error)] ?? 'Unable to sign in. Please try again.';
}

export default function Login({
  onLogin,
  onGoToSignup,
  onGoBack,
  infoMessage = '',
  externalError = '',
}: {
  onLogin: (user: UserData) => void;
  onGoToSignup: () => void;
  onGoBack: () => void;
  infoMessage?: string;
  externalError?: string;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rateLimitStatus = useMemo(() => getAuthRateLimitStatus('login', now), [now]);
  const rateLimitMessage = rateLimitStatus.blocked
    ? `Too many sign-in attempts. Try again in ${formatAuthRateLimitDuration(
        rateLimitStatus.retryAfterMs
      )}.`
    : '';

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email address and password.');
      return;
    }
    if (rateLimitStatus.blocked) {
      setError(rateLimitMessage);
      return;
    }

    try {
      setLoading(true);
      setError('');
      const userProfile = await loginUser(email.trim(), password);

      if (!userProfile) {
        setError('Please verify your email before accessing SmartAqua Pro.');
        return;
      }

      onLogin(userProfile);
    } catch (loginError) {
      setError(getLoginError(loginError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(8,145,178,0.17),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.14),transparent_32%)]" />

      <button
        type="button"
        onClick={onGoBack}
        className="relative z-10 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-white"
      >
        <ArrowLeft size={17} />
        Back to home
      </button>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl items-center justify-center py-8">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/90 shadow-2xl shadow-black/35 backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]">
          <section className="border-b border-slate-700/80 bg-gradient-to-br from-cyan-950/80 via-slate-900 to-blue-950/70 p-8 lg:border-b-0 lg:border-r lg:p-12">
            <img src="/smartaqua-logo.png" alt="SmartAqua Pro" className="h-16 w-16 object-contain" />
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
              SmartAqua Pro
            </p>
            <h1 className="mt-3 max-w-sm text-3xl font-bold leading-tight text-white sm:text-4xl">
              Secure aquarium management access
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
              Sign in to monitor assigned aquariums, review alerts, and manage authorized equipment controls.
            </p>

            <div className="mt-9 space-y-5">
              <LoginFeature icon={<ShieldCheck size={19} />} title="Account-protected access" text="Firebase authentication and verified email requirements protect each account." />
              <LoginFeature icon={<Gauge size={19} />} title="Owner-specific dashboard" text="Users access only the aquarium information assigned to their account." />
              <LoginFeature icon={<BellRing size={19} />} title="Monitoring and alerts" text="Review supported aquarium conditions, alerts, and system status." />
            </div>
          </section>

          <section className="flex items-center p-6 sm:p-9 lg:p-12">
            <form
              className="mx-auto w-full max-w-lg"
              onSubmit={(event) => {
                event.preventDefault();
                void handleLogin();
              }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                Authorized access
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">Welcome back</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Enter the same SmartAqua Pro account used on web or mobile.
              </p>

              <div className="mt-7 space-y-5">
                {(error || externalError) && (
                  <LoginNotice tone="error">{error || externalError}</LoginNotice>
                )}
                {!error && !externalError && infoMessage && (
                  <LoginNotice tone="info">{infoMessage}</LoginNotice>
                )}
                {!error && !externalError && !infoMessage && rateLimitMessage && (
                  <LoginNotice tone="warning">{rateLimitMessage}</LoginNotice>
                )}

                <LoginField label="Email address" icon={<Mail size={18} />}>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="name@gmail.com"
                    autoComplete="email"
                    className="formal-input pl-11"
                  />
                </LoginField>

                <LoginField label="Password" icon={<LockKeyhole size={18} />}>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value);
                      if (error) setError('');
                    }}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="formal-input px-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-cyan-300"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </LoginField>

                <button
                  type="submit"
                  disabled={loading || rateLimitStatus.blocked}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/30 transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? 'Signing in securely...'
                    : rateLimitStatus.blocked
                      ? `Try again in ${formatAuthRateLimitDuration(rateLimitStatus.retryAfterMs)}`
                      : 'Sign in'}
                </button>
              </div>

              <div className="my-7 flex items-center gap-4">
                <div className="h-px flex-1 bg-slate-700" />
                <span className="text-xs font-medium uppercase tracking-wider text-slate-500">New user</span>
                <div className="h-px flex-1 bg-slate-700" />
              </div>

              <button
                type="button"
                onClick={onGoToSignup}
                className="w-full rounded-xl border border-slate-700 px-4 py-3 text-sm font-semibold text-cyan-200 transition hover:border-cyan-500/40 hover:bg-cyan-400/5"
              >
                Create a verified account
              </button>

              <p className="mt-7 text-center text-xs leading-5 text-slate-500">
                Access is limited by account role and aquarium ownership permissions.
              </p>
            </form>
          </section>
        </div>
      </main>
    </div>
  );
}

function LoginFeature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">
        {icon}
      </div>
      <div>
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-1 text-xs leading-5 text-slate-400">{text}</p>
      </div>
    </div>
  );
}

function LoginField({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">
          {icon}
        </span>
        {children}
      </span>
    </label>
  );
}

function LoginNotice({
  tone,
  children,
}: {
  tone: 'error' | 'info' | 'warning';
  children: React.ReactNode;
}) {
  const styles = {
    error: 'border-red-400/25 bg-red-400/10 text-red-200',
    info: 'border-cyan-400/25 bg-cyan-400/10 text-cyan-100',
    warning: 'border-amber-400/25 bg-amber-400/10 text-amber-200',
  };

  return <div className={`rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>{children}</div>;
}
