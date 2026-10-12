interface BadgeProps {
  children: React.ReactNode;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'default';
  className?: string;
}

const variants = {
  success: 'bg-emerald-400/15 text-emerald-300 border-emerald-300/25',
  warning: 'bg-amber-400/15 text-amber-300 border-amber-300/25',
  danger: 'bg-rose-400/15 text-rose-300 border-rose-300/25',
  info: 'bg-teal-400/15 text-teal-200 border-teal-300/25',
  default: 'bg-slate-300/10 text-slate-300 border-slate-300/20',
};

export default function Badge({ children, variant = 'default', className = '' }: BadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
