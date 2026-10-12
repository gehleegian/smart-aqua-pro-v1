import { type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export default function Input({ label, error, className = '', ...props }: InputProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label className="block text-sm font-medium text-slate-200">{label}</label>
      )}
      <input
        className={`w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-slate-100 placeholder-slate-400 transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-teal-400/70 ${error ? 'border-red-500' : ''} ${className}`}
        {...props}
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
