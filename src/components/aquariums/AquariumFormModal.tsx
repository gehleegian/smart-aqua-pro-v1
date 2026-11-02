import { useId } from 'react';
import { X } from 'lucide-react';
import type {
  AquariumFormData,
  AquariumFormMode,
} from '../../types/aquariumManagement';
import type { UserRole } from '../../types/user';
import {
  getAquariumFormSubmitLabel,
  getAquariumFormTitle,
} from '../../utils/aquariumManagementHelpers';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

interface AquariumFormModalProps {
  formData: AquariumFormData;
  formMode: AquariumFormMode;
  saving: boolean;
  currentUserRole: UserRole;
  selectedOwnerName: string;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: <Field extends keyof AquariumFormData>(
    field: Field,
    value: AquariumFormData[Field]
  ) => void;
}

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
  const titleId = useId();
  const bioloadId = useId();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <Modal labelledBy={titleId} onClose={onClose} className="max-w-2xl">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">{getAquariumFormTitle(formMode)}</h2>
            {currentUserRole === 'Admin' && selectedOwnerName ? (
              <p className="mt-1 text-sm text-slate-400">Owner: {selectedOwnerName}</p>
            ) : null}
          </div>
          <button type="button" aria-label="Close" className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 px-6 py-5 sm:grid-cols-2">
          <Input label="Aquarium Name" value={formData.name} disabled={saving} onChange={(event) => onFieldChange('name', event.target.value)} />
          <Input label="Species" value={formData.species} placeholder="Guppy, Tetra" disabled={saving} onChange={(event) => onFieldChange('species', event.target.value)} />
          <div className="space-y-1">
            <label htmlFor={bioloadId} className="block text-sm font-medium text-slate-200">Bioload</label>
            <select
              id={bioloadId}
              value={formData.bioload}
              disabled={saving}
              onChange={(event) => onFieldChange('bioload', event.target.value as AquariumFormData['bioload'])}
              className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-slate-200"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <Input label="Minimum Water Level %" type="number" value={formData.minLevel} disabled={saving} onChange={(event) => onFieldChange('minLevel', event.target.value)} />
          <Input label="Minimum Temp °C" type="number" value={formData.minTemp} disabled={saving} onChange={(event) => onFieldChange('minTemp', event.target.value)} />
          <Input label="Maximum Temp °C" type="number" value={formData.maxTemp} disabled={saving} onChange={(event) => onFieldChange('maxTemp', event.target.value)} />
          <Input label="Minimum TDS Purity %" type="number" value={formData.minQuality} disabled={saving} onChange={(event) => onFieldChange('minQuality', event.target.value)} />
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-700 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {getAquariumFormSubmitLabel(formMode, saving)}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
