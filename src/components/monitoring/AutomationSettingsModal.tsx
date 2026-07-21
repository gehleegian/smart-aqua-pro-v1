import { Fish, Info, Plus, Trash2, Wind, X } from 'lucide-react';
import type { AutomationSettings } from '../../types/aquarium';

type UpdateAutomationDraft = <Field extends keyof AutomationSettings>(
  field: Field,
  value: AutomationSettings[Field]
) => void;

type AutomationSettingsModalProps = {
  aquariumName: string;
  draft: AutomationSettings;
  error: string;
  saving: boolean;
  onAddFeedingTime: () => void;
  onClose: () => void;
  onDraftChange: UpdateAutomationDraft;
  onRemoveFeedingTime: (index: number) => void;
  onSave: () => void;
  onUpdateFeedingTime: (index: number, value: string) => void;
};

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
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
      <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl shadow-black/30">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-semibold text-white">Edit Automation</h2>
            <p className="text-sm text-slate-400 mt-1">{aquariumName}</p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="space-y-5">
          <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Fish className="w-5 h-5 text-cyan-400" />
                <h3 className="text-sm font-semibold text-white">Feeding Schedule</h3>
              </div>

              <button
                type="button"
                onClick={onAddFeedingTime}
                className="w-9 h-9 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white flex items-center justify-center transition-all"
                aria-label="Add feeding time"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              {draft.feedingTimes.map((feedingTime, index) => (
                <div key={`${feedingTime}-${index}`} className="flex items-end gap-3">
                  <div className="flex-1">
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Feeding time {index + 1}
                    </label>
                    <input
                      type="time"
                      value={feedingTime}
                      onChange={(event) => onUpdateFeedingTime(index, event.target.value)}
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFeedingTime(index)}
                    disabled={draft.feedingTimes.length === 1}
                    className="w-10 h-10 rounded-lg bg-slate-700 hover:bg-red-600 disabled:opacity-50 disabled:hover:bg-slate-700 disabled:cursor-not-allowed text-slate-300 hover:text-white flex items-center justify-center transition-all"
                    aria-label={`Remove feeding time ${index + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2">
              <Info className="w-5 h-5 text-amber-400" />
              <h3 className="text-sm font-semibold text-white">Lighting Schedule</h3>
            </div>
            <p className="mt-3 text-sm text-slate-400">
              Set the start time and end time for the aquarium light schedule.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  Start Time
                </label>
                <input
                  type="time"
                  value={draft.lightOnTime}
                  onChange={(event) => onDraftChange('lightOnTime', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">
                  End Time
                </label>
                <input
                  type="time"
                  value={draft.lightOffTime}
                  onChange={(event) => onDraftChange('lightOffTime', event.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-700/50 px-4 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
            <div className="flex items-center gap-2 mb-4">
              <Wind className="w-5 h-5 text-emerald-400" />
              <h3 className="text-sm font-semibold text-white">Filtration Settings</h3>
            </div>

            <p className="mb-4 text-sm text-slate-400">
              These values control the automatic filtration window. You can still
              override filtration from Monitoring if you need to stop it early or
              start it manually.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Start time
                </label>
                <input
                  type="time"
                  value={draft.filtrationStartTime}
                  onChange={(event) =>
                    onDraftChange('filtrationStartTime', event.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Runtime hours
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={draft.filtrationRuntimeHours}
                  onChange={(event) =>
                    onDraftChange('filtrationRuntimeHours', Number(event.target.value))
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 pt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-slate-300 rounded-lg text-sm font-medium transition-all"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
