import { useEffect, useMemo, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import AuthShell, {
  authInputClassName,
  authLabelClassName,
  authLinkClassName,
  authSubmitClassName,
} from '../components/auth/AuthShell';
import { registerUser } from '../services/authService';
import { getAuthErrorMessage } from '../utils/authErrors';
import { formatAuthRateLimitDuration, getAuthRateLimitStatus } from '../utils/authRateLimit';

export default function Signup({
  onSignup,
  onGoToLogin,
}: {
  onSignup: (message: string) => void;
  onGoToLogin: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const rateLimitStatus = useMemo(() => getAuthRateLimitStatus('signup', now), [now]);
  const rateLimitMessage = rateLimitStatus.blocked
    ? `Too many sign-up attempts. Try again in ${formatAuthRateLimitDuration(
        rateLimitStatus.retryAfterMs
      )}.`
    : '';

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (rateLimitStatus.blocked) {
      setError(rateLimitMessage);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const verificationEmailSent = await registerUser(name, email, password);
      const message = verificationEmailSent
        ? 'Account created. Check your inbox to verify your email, then sign in.'
        : 'Account created, but the verification email could not be sent. Sign in to request a new one.';

      setSuccess(message);

      setTimeout(() => {
        onSignup(message);
      }, 1500);
    } catch (err: unknown) {
      console.error('Signup failed:', err);
      setError(getAuthErrorMessage(err, 'Signup failed.'));
    } finally {
      setLoading(false);
    }
  };

  const signupDisabled = loading || rateLimitStatus.blocked;

  return (
    <AuthShell onBack={onGoToLogin}>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Create your account</h1>
        <p className="mt-1 text-sm text-slate-300">Create your account to continue.</p>
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

        {!error && rateLimitMessage && (
          <div className="rounded-lg border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            {rateLimitMessage}
          </div>
        )}

        {success && (
          <div className="rounded-lg border border-emerald-300/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {success}
          </div>
        )}
      </div>

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSignup();
        }}
      >
        <div className="mb-4">
          <label htmlFor="signup-name" className={authLabelClassName}>
            Full name
          </label>
          <input
            id="signup-name"
            type="text"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your full name"
            className={authInputClassName}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="signup-email" className={authLabelClassName}>
            Email address
          </label>
          <input
            id="signup-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className={authInputClassName}
          />
        </div>

        <div className="mb-4">
          <label htmlFor="signup-password" className={authLabelClassName}>
            Password
          </label>
          <div className="relative">
            <input
              id="signup-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a password"
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

        <div className="mb-6">
          <label htmlFor="signup-confirm-password" className={authLabelClassName}>
            Confirm password
          </label>
          <input
            id="signup-confirm-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirm your password"
            className={authInputClassName}
          />
        </div>

        <button type="submit" disabled={signupDisabled} className={authSubmitClassName}>
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading
            ? 'Creating account...'
            : rateLimitStatus.blocked
              ? `Try again in ${formatAuthRateLimitDuration(rateLimitStatus.retryAfterMs)}`
              : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-300">
        Already have an account?{' '}
        <button type="button" onClick={onGoToLogin} className={authLinkClassName}>
          Sign in
        </button>
      </p>
    </AuthShell>
  );
}
