import { X, Mail, Phone, Shield, Clock3, UserRound } from 'lucide-react';
import Button from '../ui/Button';
import { Card } from '../ui/Card';
import type { UserData } from '../../types/user';

type ProfileModalProps = {
  open: boolean;
  profile: UserData | null;
  fullName: string;
  contactNumber: string;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onChangeFullName: (value: string) => void;
  onChangeContactNumber: (value: string) => void;
};

function formatDisplayValue(value?: string) {
  return value && value.trim() ? value : 'Not set';
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
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6">
      <Card className="w-full max-w-2xl overflow-hidden border-slate-700 shadow-2xl shadow-black/40">
        <div className="flex items-center justify-between border-b border-slate-700/60 px-6 py-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Profile</h3>
            <p className="text-sm text-slate-400">Update your account details.</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-4">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Full Name</label>
              <input
                value={fullName}
                onChange={(event) => onChangeFullName(event.target.value)}
                placeholder="Enter your full name"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-slate-200 placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-300">Contact Number</label>
              <input
                value={contactNumber}
                onChange={(event) => onChangeContactNumber(event.target.value)}
                placeholder="Enter your contact number"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-slate-200 placeholder-slate-500 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button type="button" onClick={onSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-slate-700/70 bg-slate-900/60 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-200">
                <UserRound className="h-4 w-4 text-cyan-400" />
                Account Details
              </div>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Mail className="h-4 w-4" />
                    Email
                  </span>
                  <span className="text-right text-slate-200">{formatDisplayValue(profile?.email)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Shield className="h-4 w-4" />
                    Role
                  </span>
                  <span className="text-right text-slate-200">{formatDisplayValue(profile?.role)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <UserRound className="h-4 w-4" />
                    Account Status
                  </span>
                  <span className="text-right text-slate-200">
                    {formatDisplayValue(profile?.accountStatus || 'active')}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Phone className="h-4 w-4" />
                    Contact
                  </span>
                  <span className="text-right text-slate-200">
                    {formatDisplayValue(contactNumber || profile?.contactNumber)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-slate-500">
                    <Clock3 className="h-4 w-4" />
                    Updated
                  </span>
                  <span className="text-right text-slate-200">
                    {formatDisplayValue(profile?.updatedAt)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
