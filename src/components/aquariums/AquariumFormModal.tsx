import { X } from 'lucide-react';
import type { AquariumFormData, AquariumFormMode } from '../../types/aquariumManagement';
import {
  getAquariumFormSubmitLabel,
  getAquariumFormTitle,
} from '../../utils/aquariumManagementHelpers';

type AquariumFormModalProps = {
  formData: AquariumFormData;
  formMode: AquariumFormMode;
  saving: boolean;
  currentUserRole: 'Admin' | 'User';
  selectedOwnerName: string;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: <Field extends keyof AquariumFormData>(
    field: Field,
    value: AquariumFormData[Field]
  ) => void;
};

export function AquariumFormModal({
  formData,
  formMode,
  saving,
  currentUserRole,
  selectedOwnerName,
  onClose,
  onSave,
  onFieldChange,
}: AquariumFormModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-lg rounded-xl border border-slate-700 bg-slate-800 p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">
              {getAquariumFormTitle(formMode)}
            </h2>
            {currentUserRole === 'Admin' && selectedOwnerName && (
              <p className="mt-1 text-sm text-slate-400">Owner: {selectedOwnerName}</p>
            )}
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Aquarium Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(event) => onFieldChange('name', event.target.value)}
              placeholder="e.g., Tropical Tank E"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Fish Species
            </label>
            <input
              type="text"
              value={formData.species}
              onChange={(event) => onFieldChange('species', event.target.value)}
              placeholder="e.g., Guppies, Tetras"
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">
              Bioload Classification
            </label>
            <select
              value={formData.bioload}
              onChange={(event) =>
                onFieldChange('bioload', event.target.value as AquariumFormData['bioload'])
              }
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
            >
              <option value="low">Low - Small, clean species</option>
              <option value="medium">Medium - Moderate waste</option>
              <option value="high">High - Large/messy fish</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Min Temp (&deg;C)
              </label>
              <input
                type="number"
                value={formData.minTemp}
                onChange={(event) => onFieldChange('minTemp', event.target.value)}
                placeholder="24"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Max Temp (&deg;C)
              </label>
              <input
                type="number"
                value={formData.maxTemp}
                onChange={(event) => onFieldChange('maxTemp', event.target.value)}
                placeholder="28"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Water Level Min (%)
              </label>
              <input
                type="number"
                value={formData.minLevel}
                onChange={(event) => onFieldChange('minLevel', event.target.value)}
                placeholder="70"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Water Purity Min (TDS %)
              </label>
              <input
                type="number"
                value={formData.minQuality}
                onChange={(event) => onFieldChange('minQuality', event.target.value)}
                placeholder="80"
                className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>
          </div>

          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-all hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              onClick={onSave}
              disabled={saving}
              className="flex-1 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white transition-all hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {getAquariumFormSubmitLabel(formMode, saving)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
