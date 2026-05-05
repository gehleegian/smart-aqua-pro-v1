interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <div onClick={onClick} className={`bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl ${onClick ? 'cursor-pointer' : ''} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }: CardProps) {
  return (
    <div className={`px-6 py-4 border-b border-slate-700/50 ${className}`}>
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
    <div className={`px-6 py-4 border-t border-slate-700/50 ${className}`}>
      {children}
    </div>
  );
}