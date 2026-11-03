import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { registerUser } from '../services/authService';
import {
  formatAuthRateLimitDuration,
  getAuthRateLimitStatus,
  isAuthRateLimitError,
} from '../utils/authRateLimit';

function getFirebaseErrorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : '';
}

function getSignupError(error: unknown) {
  if (isAuthRateLimitError(error)) return error.message;

  const messages: Record<string, string> = {
    'auth/email-already-in-use': 'An account already uses this email address. Sign in instead.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/weak-password': 'Use a stronger password with at least six characters.',
    'auth/too-many-requests': 'Too many attempts. Please wait before trying again.',
  };

  const code = getFirebaseErrorCode(error);
  if (messages[code]) return messages[code];
  return error instanceof Error ? error.message : 'Unable to create the account.';
}

export default function Signup({
  onVerificationRequired,
  onGoToLogin,
}: {
  onVerificationRequired: () => void;
  onGoToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const rateLimitStatus = useMemo(() => getAuthRateLimitStatus('signup', now), [now]);

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !password || !confirmPassword) {
      setError('Complete all account fields.');
      return;
    }
    if (password.length < 6) {
      setError('Password must contain at least six characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (rateLimitStatus.blocked) {
      setError(
        `Too many requests. Try again in ${formatAuthRateLimitDuration(
          rateLimitStatus.retryAfterMs
        )}.`
      );
      return;
    }

    try {
      setLoading(true);
      setError('');
      await registerUser(name, email, password);
      onVerificationRequired();
    } catch (signupError) {
      setError(getSignupError(signupError));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_20%,rgba(8,145,178,0.17),transparent_34%),radial-gradient(circle_at_85%_80%,rgba(37,99,235,0.14),transparent_32%)]" />

      <button
        type="button"
        onClick={onGoToLogin}
        className="relative z-10 inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 hover:text-white"
      >
        <ArrowLeft size={17} />
        Back to sign in
      </button>

      <main className="relative z-10 mx-auto flex min-h-[calc(100vh-96px)] max-w-6xl items-center justify-center py-8">
        <div className="grid w-full overflow-hidden rounded-3xl border border-slate-700/80 bg-slate-900/90 shadow-2xl shadow-black/35 backdrop-blur-xl lg:grid-cols-[0.9fr_1.1fr]">
          <section className="border-b border-slate-700/80 bg-gradient-to-br from-cyan-950/80 via-slate-900 to-blue-950/70 p-8 lg:border-b-0 lg:border-r lg:p-12">
            <img src="/smartaqua-logo.png" alt="SmartAqua Pro" className="h-16 w-16 object-contain" />
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-cyan-300">
              SmartAqua Pro
            </p>
            <h1 className="mt-3 max-w-sm text-3xl font-bold leading-tight text-white sm:text-4xl">
              Create a secure caretaker account
            </h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-slate-300">
              Create your account, then verify the email address before accessing aquarium data.
            </p>

            <div className="mt-9 space-y-5">
              <Feature icon={<ShieldCheck size={19} />} title="Verified identity" text="Firebase confirms ownership through a verification link sent after registration." />
              <Feature icon={<LockKeyhole size={19} />} title="Protected access" text="Aquariums remain unavailable until the Firebase account is verified." />
              <Feature icon={<KeyRound size={19} />} title="One shared account" text="Use the same verified email and password on the web and mobile app." />
            </div>
          </section>

          <section className="p-6 sm:p-9 lg:p-12">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleSignup();
              }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300">
                User / Caretaker registration
              </p>
              <h2 className="mt-3 text-3xl font-bold text-white">Create account</h2>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                Enter your account details. A verification link will be sent to your email.
              </p>

              <div className="mt-7 space-y-5">
                {error && <Notice>{error}</Notice>}

                <Field label="Full name" icon={<UserRound size={18} />}>
                  <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder="Enter your full name" autoComplete="name" className="formal-input pl-11" />
                </Field>
                <Field label="Email address" icon={<Mail size={18} />}>
                  <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@gmail.com" autoComplete="email" className="formal-input pl-11" />
                </Field>
                <Field label="Password" icon={<LockKeyhole size={18} />}>
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least six characters" autoComplete="new-password" className="formal-input px-11" />
                  <PasswordToggle visible={showPassword} onClick={() => setShowPassword((visible) => !visible)} />
                </Field>
                <Field label="Confirm password" icon={<LockKeyhole size={18} />}>
                  <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat your password" autoComplete="new-password" className="formal-input px-11" />
                </Field>

                <button
                  type="submit"
                  disabled={loading || rateLimitStatus.blocked}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-cyan-950/30 transition hover:from-cyan-400 hover:to-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? 'Creating account...'
                    : rateLimitStatus.blocked
                      ? `Try again in ${formatAuthRateLimitDuration(rateLimitStatus.retryAfterMs)}`
                      : 'Create account and send verification'}
                </button>
              </div>
            </form>

            <p className="mt-8 text-center text-xs leading-5 text-slate-500">
              Access is limited by account role and aquarium ownership permissions.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-300">{icon}</div>
      <div><p className="text-sm font-semibold text-white">{title}</p><p className="mt-1 text-xs leading-5 text-slate-400">{text}</p></div>
    </div>
  );
}

function Field({ label, icon, children }: { label: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-200">{label}</span>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500">{icon}</span>
        {children}
      </span>
    </label>
  );
}

function PasswordToggle({ visible, onClick }: { visible: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={visible ? 'Hide password' : 'Show password'} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-cyan-300">
      {visible ? <EyeOff size={18} /> : <Eye size={18} />}
    </button>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">{children}</div>;
}
