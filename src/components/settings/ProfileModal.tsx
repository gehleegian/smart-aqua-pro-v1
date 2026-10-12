import { useEffect } from 'react';
import { Mail, Phone, Shield, UserRound, X } from 'lucide-react';
import Button from '../ui/Button';
import Input from '../ui/Input';
import type { UserData } from '../../types/user';

interface ProfileModalProps {
  open: boolean;
  profile: UserData | null;
  fullName: string;
  contactNumber: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeFullName: (value: string) => void;
  onChangeContactNumber: (value: string) => void;
}

export default function ProfileModal({
  open,
  profile,
  fullName,
  contactNumber,
  saving,
  onClose,
  onSave,
  onChangeFullName,
  onChangeContactNumber,
}: ProfileModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, open]);

  if (!open) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        aria-label="Close profile modal"
        onClick={onClose}
      />

      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl shadow-slate-950/50"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div>
            <h2 id="profile-modal-title" className="flex items-center gap-2 text-lg font-semibold text-white">
              <UserRound className="h-5 w-5 text-teal-200" />
              Edit Profile
            </h2>
            <p className="mt-1 text-sm text-slate-400">Update your account details.</p>
          </div>
          <button
            type="button"
            className="rounded-lg p-2 text-slate-400 transition hover:bg-slate-800 hover:text-white"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <Input
            label="Full Name"
            value={fullName}
            placeholder="Enter your full name"
            autoComplete="name"
            disabled={saving}
            onChange={(event) => onChangeFullName(event.target.value)}
          />

          <Input
            label="Contact Number"
            value={contactNumber}
            placeholder="Enter your contact number"
            autoComplete="tel"
            disabled={saving}
            onChange={(event) => onChangeContactNumber(event.target.value)}
          />

          <div className="grid gap-3 rounded-lg border border-slate-700/70 bg-slate-800/40 p-4 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Mail className="h-3.5 w-3.5" />
                Email
              </p>
              <p className="truncate text-slate-200">{profile?.email || 'Not available'}</p>
            </div>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500">
                <Shield className="h-3.5 w-3.5" />
                Role
              </p>
              <p className="text-slate-200">{profile?.role || 'User'}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-700 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            <Phone className="h-4 w-4" />
            {saving ? 'Saving...' : 'Save Profile'}
          </Button>
        </div>
      </form>
    </div>
  );
}
