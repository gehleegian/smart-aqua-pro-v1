import { useId, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className = '', id, ...props }: InputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className="space-y-1">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-200">{label}</label>
      )}
      <input
        id={inputId}
        className={`w-full rounded-lg border border-slate-700 bg-slate-900 px-4 py-2 text-slate-100 placeholder-slate-500 transition-colors focus:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-400/30 ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
