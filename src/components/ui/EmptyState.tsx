import type { LucideIcon } from 'lucide-react';

export default function EmptyState({
  icon: Icon,
  message,
  children,
}: {
  icon: LucideIcon;
  message: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 px-6 py-16 text-center">
      <Icon className="h-8 w-8 text-slate-400" aria-hidden="true" />
      <p className="text-sm text-slate-300">{message}</p>
      {children}
    </div>
  );
}
