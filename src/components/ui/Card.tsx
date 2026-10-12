interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`rounded-xl border border-slate-600/35 bg-slate-800/45 shadow-sm shadow-slate-950/10 backdrop-blur-sm ${onClick ? 'cursor-pointer transition hover:border-teal-300/45 hover:bg-slate-800/60' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`border-b border-slate-600/30 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}

export function CardContent({ children, className = '', onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`px-6 py-4 ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardFooter({ children, className = '' }: CardProps) {
  return (
    <div className={`border-t border-slate-600/30 px-6 py-4 ${className}`}>
      {children}
    </div>
  );
}
