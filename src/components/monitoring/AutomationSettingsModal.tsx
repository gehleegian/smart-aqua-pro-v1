import { Plus, Trash2, X } from 'lucide-react';
import type { AutomationSettings } from '../../types/aquarium';
import Button from '../ui/Button';
import Input from '../ui/Input';

interface AutomationSettingsModalProps {
  aquariumName: string;
  draft: AutomationSettings;
  error: string;
  saving: boolean;
  onAddFeedingTime: () => void;
  onClose: () => void;
  onDraftChange: <Field extends keyof AutomationSettings>(
    field: Field,
    value: AutomationSettings[Field]
  ) => void;
  onRemoveFeedingTime: (index: number) => void;
  onSave: () => void;
  onUpdateFeedingTime: (index: number, value: string) => void;
}

export function AutomationSettingsModal({
  aquariumName,
  draft,
  error,
  saving,
  onAddFeedingTime,
  onClose,
  onDraftChange,
  onRemoveFeedingTime,
  onSave,
  onUpdateFeedingTime,
}: AutomationSettingsModalProps) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm">
      <button type="button" aria-label="Close modal" className="absolute inset-0 cursor-default" onClick={onClose} />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-700 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Automation Settings</h2>
            <p className="mt-1 text-sm text-slate-400">{aquariumName}</p>
          </div>
          <button type="button" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" onClick={onClose}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          {error ? (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          ) : null}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-slate-300">Feeding Times</label>
              <Button type="button" size="sm" variant="secondary" onClick={onAddFeedingTime}>
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>
            {draft.feedingTimes.map((time, index) => (
              <div key={`${time}-${index}`} className="flex gap-2">
                <input
                  type="time"
                  value={time}
                  disabled={saving}
                  onChange={(event) => onUpdateFeedingTime(index, event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-slate-200"
                />
                <Button type="button" variant="danger" disabled={saving || draft.feedingTimes.length === 1} onClick={() => onRemoveFeedingTime(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Light On" type="time" value={draft.lightOnTime} disabled={saving} onChange={(event) => onDraftChange('lightOnTime', event.target.value)} />
            <Input label="Light Off" type="time" value={draft.lightOffTime} disabled={saving} onChange={(event) => onDraftChange('lightOffTime', event.target.value)} />
            <Input label="Filtration Start" type="time" value={draft.filtrationStartTime} disabled={saving} onChange={(event) => onDraftChange('filtrationStartTime', event.target.value)} />
            <Input label="Runtime Hours" type="number" min="1" max="24" value={draft.filtrationRuntimeHours} disabled={saving} onChange={(event) => onDraftChange('filtrationRuntimeHours', Number(event.target.value))} />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-slate-700 px-6 py-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      </form>
    </div>
  );
}
