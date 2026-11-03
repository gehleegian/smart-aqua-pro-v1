const variants = {
  error: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
  warning: 'border-amber-400/30 bg-amber-500/10 text-amber-300',
  success: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300',
};

export default function StatusMessage({
  variant,
  children,
}: {
  variant: keyof typeof variants;
  children: React.ReactNode;
}) {
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-4 py-3 text-sm ${variants[variant]}`}
    >
      {children}
    </div>
  );
}
