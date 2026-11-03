import { ArrowLeft, Waves } from 'lucide-react';
import UnderwaterBackground from '../ui/UnderwaterBackground';

export const authInputClassName =
  'auth-input w-full rounded-lg border border-slate-600/50 bg-slate-950/45 px-4 py-3 text-sm text-slate-50 placeholder-slate-400 transition-colors hover:border-slate-500 focus:border-teal-300 focus:outline-2 focus:outline-offset-1 focus:outline-teal-300/60';
export const authLabelClassName = 'mb-2 block text-sm font-medium text-slate-200';
export const authLinkClassName =
  'rounded font-semibold text-teal-200 transition-colors hover:text-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-60';
export const authSubmitClassName =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-teal-950/20 transition-colors hover:bg-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-60';

export default function AuthShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center px-4 py-20 sm:py-12">
      <UnderwaterBackground />

      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-lg bg-slate-950/55 px-3 py-2 text-sm font-medium text-slate-50 backdrop-blur-sm transition-colors hover:bg-slate-900/80 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal-500/15 ring-1 ring-teal-300/30">
            <Waves className="h-6 w-6 text-teal-200" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-white">SmartAqua Pro</p>
            <p className="text-xs text-teal-300">IoT-Based Aquarium Management System</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-600/35 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/30 backdrop-blur sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
