import { ArrowLeft, Waves } from 'lucide-react';

export const authInputClassName =
  'auth-input w-full rounded-lg border border-slate-700 bg-black px-4 py-3 text-sm text-slate-50 placeholder-slate-400 transition-colors hover:border-slate-500 focus:border-teal-300 focus:outline-2 focus:outline-offset-1 focus:outline-teal-300/60';
export const authLabelClassName = 'mb-2 block text-sm font-medium text-slate-200';
export const authLinkClassName =
  'rounded font-semibold text-teal-200 transition-colors hover:text-teal-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-60';
export const authSubmitClassName =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 disabled:cursor-not-allowed disabled:opacity-60';

export default function AuthShell({
  onBack,
  children,
}: {
  onBack: () => void;
  children: React.ReactNode;
}) {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-black px-4 py-20 sm:py-12">

      <button
        type="button"
        onClick={onBack}
        className="absolute left-4 top-4 z-10 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-900 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-300 sm:left-6 sm:top-6"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <div className="relative z-10 w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-teal-600">
            <Waves className="h-6 w-6 text-teal-950" aria-hidden="true" />
          </div>
          <div>
            <p className="text-lg font-bold leading-tight text-white">SmartAqua Pro</p>
            <p className="text-xs text-slate-400">IoT-Based Aquarium Management System</p>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-700 bg-slate-900 p-6 sm:p-8">
          {children}
        </div>
      </div>
    </main>
  );
}
