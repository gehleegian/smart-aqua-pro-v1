interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`rounded-2xl border border-slate-700 bg-slate-900 shadow-sm ${onClick ? 'cursor-pointer transition-colors hover:border-teal-400/60' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`border-b border-slate-700 px-5 py-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '', onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`px-5 py-4 sm:px-6 ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '' }: CardProps) {
  return (
    <div className={`border-t border-slate-700 px-5 py-4 sm:px-6 ${className}`}>
      {children}
    </div>
  );
}
