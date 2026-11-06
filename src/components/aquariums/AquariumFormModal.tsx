import { useId, useState } from 'react';
import { validateDeviceId } from '../../services/deviceClaimContracts';
import { X } from 'lucide-react';
import type {
  AquariumFormData,
  AquariumFormMode,
} from '../../types/aquariumManagement';
import type { UserRole } from '../../types/user';
import {
  getAquariumFormSubmitLabel,
  getAquariumFormTitle,
  getFormBioloadCalculation,
  INDOOR_GOLDFISH_PRESET,
} from '../../utils/aquariumManagementHelpers';
import {
  formatBiomass,
  formatEstimatedBioload,
} from '../../utils/aquariumProfileCalculations';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Modal from '../ui/Modal';

interface AquariumFormModalProps {
  formData: AquariumFormData;
  formMode: AquariumFormMode;
  saving: boolean;
  error: string;
  currentUserRole: UserRole;
  selectedOwnerName: string;
  onClose: () => void;
  onSave: () => void;
  onFieldChange: <Field extends keyof AquariumFormData>(
    field: Field,
    value: AquariumFormData[Field]
  ) => void;
  onFishWeightChange: (index: number, value: string) => void;
}

export function AquariumFormModal({
  formData,
  formMode,
  saving,
  error,
  currentUserRole,
  selectedOwnerName,
  onClose,
  onSave,
  onFieldChange,
  onFishWeightChange,
}: AquariumFormModalProps) {
  const titleId = useId();
  const [profileStep, setProfileStep] = useState(formMode === 'edit');
  const [deviceError, setDeviceError] = useState('');
  const bioloadCalculation = getFormBioloadCalculation(formData);
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    if (!profileStep) {
      const message = validateDeviceId(formData.deviceId);
      setDeviceError(message);
      if (!message) setProfileStep(true);
      return;
    }
    onSave();
  };
  const applyIndoorPreset = () => {
    onFieldChange('minTemp', INDOOR_GOLDFISH_PRESET.minTemp);
    onFieldChange('maxTemp', INDOOR_GOLDFISH_PRESET.maxTemp);
    onFieldChange('minPh', INDOOR_GOLDFISH_PRESET.minPh);
    onFieldChange('maxPh', INDOOR_GOLDFISH_PRESET.maxPh);
    onFieldChange('minLevel', INDOOR_GOLDFISH_PRESET.minLevel);
    onFieldChange('minQuality', INDOOR_GOLDFISH_PRESET.minQuality);
  };

  return (
    <Modal labelledBy={titleId} onClose={() => { if (!saving) onClose(); }} className="max-w-3xl overflow-hidden p-0">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="flex max-h-[92vh] w-full flex-col overflow-hidden"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-semibold text-white">{getAquariumFormTitle(formMode)}</h2>
            {currentUserRole === 'Admin' && selectedOwnerName ? (
              <p className="mt-1 text-sm text-slate-400">Owner: {selectedOwnerName}</p>
            ) : null}
          </div>
          <button type="button" aria-label="Close aquarium setup" disabled={saving} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5">
          {!profileStep ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-300">Step 1 of 2: enter the unique device ID printed on your enclosure.</p>
              <Input label="Device ID" placeholder="SAQ-7K3M-9R2X" maxLength={13}
                autoComplete="off" spellCheck={false} value={formData.deviceId}
                onChange={event => { setDeviceError(''); onFieldChange('deviceId', event.target.value); }} />
              <p className="text-xs text-slate-400">Device availability is checked when you save. An unclaimed device is linked to the first eligible account that registers its ID. Keep the ID private until setup is complete.</p>
            </div>
          ) : (
          <>
          {formMode === 'create' ? <p className="mb-4 text-sm text-slate-300">Step 2 of 2: aquarium profile for {formData.deviceId.toUpperCase()}. No readings or equipment state are assumed until the device reports them.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Aquarium Name" value={formData.name} disabled={saving} onChange={(event) => onFieldChange('name', event.target.value)} />
            <Input label="Aquarium Type" value={formData.tankType} readOnly disabled />
            <Input label="Fish Species" value={formData.species} readOnly disabled />
            <Input label="Fish Quantity" type="number" min="1" step="1" value={formData.fishCount} disabled={saving} onChange={(event) => onFieldChange('fishCount', event.target.value)} />
            <Input label="Tank Length (cm)" type="number" min="0" step="any" value={formData.tankLengthCm} disabled={saving} onChange={(event) => onFieldChange('tankLengthCm', event.target.value)} />
            <Input label="Tank Width (cm)" type="number" min="0" step="any" value={formData.tankWidthCm} disabled={saving} onChange={(event) => onFieldChange('tankWidthCm', event.target.value)} />
            <Input label="Tank Height (cm)" type="number" min="0" step="any" value={formData.tankHeightCm} disabled={saving} onChange={(event) => onFieldChange('tankHeightCm', event.target.value)} />
            <Input label="Operational Water Volume (L)" type="number" min="0" step="any" value={formData.workingWaterVolumeLiters} disabled={saving} onChange={(event) => onFieldChange('workingWaterVolumeLiters', event.target.value)} />
            <label className="flex flex-col gap-1 text-sm text-slate-300">
              <span>Filtration System Installed</span>
              <select
                value={formData.hasFiltrationSystem}
                disabled={saving}
                required
                onChange={(event) =>
                  onFieldChange(
                    'hasFiltrationSystem',
                    event.target.value as AquariumFormData['hasFiltrationSystem']
                  )
                }
                className="rounded-lg border border-slate-600 bg-slate-950/60 px-3 py-2.5 text-white outline-none transition focus:border-teal-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">Select Yes or No</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            {formData.fishWeightsG.length > 0 ? (
              <fieldset className="grid gap-4 rounded-lg border border-slate-600/40 bg-slate-950/25 p-4 sm:col-span-2 sm:grid-cols-2">
                <legend className="px-2 text-sm font-medium text-slate-200">
                  Individual Goldfish Weights
                </legend>
                {formData.fishWeightsG.map((weight, index) => (
                  <Input
                    key={index}
                    label={`Fish ${index + 1} Weight (g)`}
                    type="number"
                    min="0.01"
                    step="any"
                    value={weight}
                    disabled={saving}
                    onChange={(event) => onFishWeightChange(index, event.target.value)}
                  />
                ))}
              </fieldset>
            ) : null}
            <div className="rounded-lg border border-slate-600/40 bg-slate-950/35 px-4 py-3 sm:col-span-2">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-sm font-medium text-slate-200">Total Fish Biomass</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatBiomass(bioloadCalculation?.totalFishBiomassG)}
                  </p>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-200">Estimated Bioload</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {formatEstimatedBioload(bioloadCalculation?.estimatedBioloadGL)}
                  </p>
                </div>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Calculated automatically from total Goldfish weight and operational water volume. Filtration does not change this calculation.
              </p>
            </div>
            <div className="rounded-lg border border-teal-500/30 bg-teal-500/10 px-4 py-3 sm:col-span-2">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-teal-100">Indoor Goldfish aquarium preset</p>
                  <p className="mt-1 text-xs leading-5 text-slate-300">
                    New profiles start at 20-24 C and pH 6.5-7.5 for an ordinary home aquarium, not breeding or commercial production. Water level and TDS start at the current system defaults and must be adjusted after sensor calibration. All values remain editable.
                  </p>
                </div>
                <Button type="button" variant="secondary" size="sm" disabled={saving} className="shrink-0" onClick={applyIndoorPreset}>
                  Apply indoor preset
                </Button>
              </div>
            </div>
            <Input label="Minimum Temp C" type="number" value={formData.minTemp} disabled={saving} onChange={(event) => onFieldChange('minTemp', event.target.value)} />
            <Input label="Maximum Temp C" type="number" value={formData.maxTemp} disabled={saving} onChange={(event) => onFieldChange('maxTemp', event.target.value)} />
            <Input label="Minimum pH" type="number" min="0" max="14" step="any" value={formData.minPh} disabled={saving} onChange={(event) => onFieldChange('minPh', event.target.value)} />
            <Input label="Maximum pH" type="number" min="0" max="14" step="any" value={formData.maxPh} disabled={saving} onChange={(event) => onFieldChange('maxPh', event.target.value)} />
            <Input label="Minimum Water Level %" type="number" value={formData.minLevel} disabled={saving} onChange={(event) => onFieldChange('minLevel', event.target.value)} />
            <Input label="Minimum TDS Purity %" type="number" value={formData.minQuality} disabled={saving} onChange={(event) => onFieldChange('minQuality', event.target.value)} />
          </div>
          </>
          )}
        </div>

        {error || deviceError ? (
          <div
            role="alert"
            aria-live="assertive"
            className="mx-6 mb-1 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200"
          >
            {deviceError || error}
          </div>
        ) : null}

        <div className="flex flex-col-reverse gap-3 border-t border-slate-700 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          {profileStep && formMode === 'create' ? <Button type="button" variant="secondary" disabled={saving} onClick={() => setProfileStep(false)}>Back to device</Button> : null}
          <Button type="submit" disabled={saving}>
            {profileStep ? getAquariumFormSubmitLabel(formMode, saving) : 'Continue to aquarium setup'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
