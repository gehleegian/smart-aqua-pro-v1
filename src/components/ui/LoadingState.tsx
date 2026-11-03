import { Loader2 } from 'lucide-react';

export default function LoadingState({ label }: { label: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-slate-300">
      <Loader2 className="h-5 w-5 animate-spin text-teal-200" aria-hidden="true" />
      {label}
    </div>
  );
}
