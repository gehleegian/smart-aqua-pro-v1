import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';

/** One 6-digit authenticator code (TOTP). Used at sign-in and when enrolling. */
export default function TotpCodeForm({
  submitLabel,
  busy,
  onSubmit,
  inputClassName,
  buttonClassName,
  help = 'Open your authenticator app and enter the 6-digit code for SmartAqua Pro.',
}: {
  submitLabel: string;
  busy: boolean;
  onSubmit: (code: string) => void;
  inputClassName?: string;
  buttonClassName?: string;
  help?: string;
}) {
  const id = useId();
  const [code, setCode] = useState('');
  return (
    <form
      noValidate
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(code);
      }}
    >
      <label htmlFor={id} className="block text-sm font-medium text-slate-200">Authenticator code</label>
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9 ]*"
        maxLength={7}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        aria-describedby={`${id}-help`}
        placeholder="123 456"
        className={inputClassName ?? 'w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 font-mono text-lg tracking-widest text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400/70'}
      />
      <p id={`${id}-help`} className="text-xs text-slate-400">{help}</p>
      <button
        type="submit"
        disabled={busy}
        className={buttonClassName ?? 'inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-500 disabled:opacity-50'}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {submitLabel}
      </button>
    </form>
  );
}
