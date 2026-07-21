import { Activity, Clock, Cpu, Fish, Info, Pencil, Waves, Wind } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { AutomationSettings } from '../../types/aquarium';
import type {
  ManualActionDisplay,
  SystemField,
  SystemMode,
  MonitoringAquarium,
} from '../../types/monitoring';
import {
  formatAutomationTime,
  formatAutomationTimes,
} from '../../utils/monitoringHelpers';
import type { IconComponent } from './MonitoringCards';

type SystemToggleProps = {
  active: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
};

export function SystemToggle({ active, disabled, label, onToggle }: SystemToggleProps) {
  return (
    <button
      type="button"
      aria-label={`Toggle ${label}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      className={`w-12 h-6 rounded-full transition-all duration-200 ${
        active ? 'bg-cyan-600' : 'bg-slate-600'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${
          active ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

type ManualSystemButtonProps = {
  icon: IconComponent;
  title: string;
  action: ManualActionDisplay;
  iconColor: string;
  onClick: () => void;
  badgeLabel?: string;
};

function ManualSystemButton({
  icon: Icon,
  title,
  action,
  iconColor,
  onClick,
  badgeLabel,
}: ManualSystemButtonProps) {
  const statusColor =
    action.tone === 'busy'
      ? 'text-cyan-300'
      : action.tone === 'waiting'
      ? 'text-amber-300'
      : 'text-slate-400';

  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-lg bg-slate-900/70 flex items-center justify-center flex-shrink-0">
            <Icon className={`w-5 h-5 ${iconColor}`} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold text-white truncate">{title}</p>
              {badgeLabel ? (
                <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300">
                  {badgeLabel}
                </span>
              ) : null}
            </div>
            <p className={`text-xs mt-1 ${statusColor}`}>{action.status}</p>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={onClick}
        disabled={action.disabled}
        className={`mt-4 w-full rounded-lg px-3 py-2 text-center text-sm font-medium transition-all ${
          action.disabled
            ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
            : 'bg-cyan-600 hover:bg-cyan-700 text-white shadow-lg shadow-cyan-600/20'
        }`}
      >
        {action.buttonLabel}
      </button>
    </div>
  );
}

type SystemStatusCardProps = {
  aquarium: MonitoringAquarium;
  automationEnabled: boolean;
  automationSettings: AutomationSettings;
  manualActions: Record<SystemField, ManualActionDisplay>;
  mode: SystemMode;
  savingAutomation: boolean;
  savingAutomationEnabled: boolean;
  savingMode: boolean;
  savingSystemKey: string;
  systemError: string;
  onAutomationToggle: () => void;
  onManualAction: (field: SystemField) => void;
  onModeChange: (mode: SystemMode) => void;
  onOpenAutomationEditor: () => void;
  onSystemToggle: (field: SystemField) => void;
};

const manualControls: Array<{
  field: SystemField;
  icon: IconComponent;
  title: string;
  iconColor: string;
}> = [
  { field: 'feeder', icon: Fish, title: 'Manual Feeding', iconColor: 'text-cyan-400' },
  { field: 'light', icon: Activity, title: 'Light', iconColor: 'text-yellow-400' },
  { field: 'filter', icon: Waves, title: 'Filtration', iconColor: 'text-emerald-400' },
];

export function SystemStatusCard({
  aquarium,
  automationEnabled,
  automationSettings,
  manualActions,
  mode,
  savingAutomation,
  savingAutomationEnabled,
  savingMode,
  systemError,
  onAutomationToggle,
  onManualAction,
  onModeChange,
  onOpenAutomationEditor,
}: SystemStatusCardProps) {
  const filterIsScheduledNow = automationEnabled && isFiltrationScheduledNow(automationSettings);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" />
            System Status
          </h3>

          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-900/70 p-1">
            {(['manual', 'automation'] as SystemMode[]).map((systemMode) => (
              <button
                key={systemMode}
                type="button"
                onClick={() => onModeChange(systemMode)}
                disabled={savingMode}
                className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition-all ${
                  mode === systemMode
                    ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-600/20'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                } ${savingMode ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {savingMode && mode === systemMode ? 'Saving...' : systemMode}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {systemError && (
          <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            {systemError}
          </div>
        )}

        {mode === 'manual' ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {manualControls.map((control) => (
              <ManualSystemButton
                key={control.field}
                icon={control.icon}
                title={control.title}
                action={
                  control.field === 'filter' &&
                  aquarium.filter === 'Active' &&
                  filterIsScheduledNow
                    ? {
                        ...manualActions.filter,
                        status: 'Automation filter is running',
                        buttonLabel: 'Stop Filtration',
                      }
                    : manualActions[control.field]
                }
                iconColor={control.iconColor}
                badgeLabel={
                  control.field === 'filter' &&
                  aquarium.filter === 'Active' &&
                  filterIsScheduledNow
                    ? 'Automation Active'
                    : undefined
                }
                onClick={() => onManualAction(control.field)}
              />
            ))}
          </div>
        ) : (
          <AutomationControls
            automationEnabled={automationEnabled}
            automationSettings={automationSettings}
            savingAutomation={savingAutomation}
            savingAutomationEnabled={savingAutomationEnabled}
            onAutomationToggle={onAutomationToggle}
            onOpenAutomationEditor={onOpenAutomationEditor}
          />
        )}
      </CardContent>
    </Card>
  );
}

type AutomationControlsProps = Pick<
  SystemStatusCardProps,
  | 'automationEnabled'
  | 'automationSettings'
  | 'savingAutomation'
  | 'savingAutomationEnabled'
  | 'onAutomationToggle'
  | 'onOpenAutomationEditor'
>;

function AutomationControls({
  automationEnabled,
  automationSettings,
  savingAutomation,
  savingAutomationEnabled,
  onAutomationToggle,
  onOpenAutomationEditor,
}: AutomationControlsProps) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-sm font-semibold text-white">Automation Mode</p>
          <p className="text-xs text-slate-500 mt-1">
            {automationEnabled
              ? 'Scheduled feeding and filtration follow the saved automation settings. Filter activity will still appear in Manual mode so you can stop it there if needed.'
              : 'Automation is paused. Switch to Manual mode for direct control.'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-2">
            <span className="text-xs font-medium text-slate-300">
              {savingAutomationEnabled ? 'Saving...' : automationEnabled ? 'On' : 'Off'}
            </span>
            <SystemToggle
              active={automationEnabled}
              disabled={savingAutomationEnabled || savingAutomation}
              label="automation mode"
              onToggle={onAutomationToggle}
            />
          </div>

          <button
            type="button"
            onClick={onOpenAutomationEditor}
            className="flex items-center gap-2 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <Pencil className="w-4 h-4" />
            Settings
          </button>
        </div>
      </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
        <div className="rounded-lg bg-slate-800/60 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock className="w-4 h-4 text-cyan-400" />
            Feeding
          </div>
          <p className="text-sm font-medium text-white mt-2">
            {formatAutomationTimes(automationSettings.feedingTimes)}
          </p>
        </div>

        <div className="rounded-lg bg-slate-800/60 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Info className="w-4 h-4 text-amber-400" />
            Lighting
          </div>
          <p className="text-sm font-medium text-white mt-2">
            {formatAutomationTime(automationSettings.lightOnTime)} to{' '}
            {formatAutomationTime(automationSettings.lightOffTime)}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Light follows the scheduled start and end time
          </p>
        </div>

        <div className="rounded-lg bg-slate-800/60 p-3">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Wind className="w-4 h-4 text-emerald-400" />
            Filtration
          </div>
          <p className="text-sm font-medium text-white mt-2">
            {automationSettings.filtrationStartTime} for {automationSettings.filtrationRuntimeHours}{' '}
            {automationSettings.filtrationRuntimeHours === 1 ? 'hour' : 'hours'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Filter activity still appears in the Manual tab so you can stop it there if needed
          </p>
        </div>
      </div>
    </div>
  );
}

function isFiltrationScheduledNow(automationSettings: AutomationSettings) {
  const timeText = automationSettings.filtrationStartTime;

  if (!timeText || timeText.length !== 5 || timeText.charAt(2) !== ':') {
    return false;
  }

  const startHour = Number(timeText.slice(0, 2));
  const startMinute = Number(timeText.slice(3, 5));
  const runtimeHours = Number(automationSettings.filtrationRuntimeHours);

  if (
    !Number.isFinite(startHour) ||
    !Number.isFinite(startMinute) ||
    !Number.isFinite(runtimeHours) ||
    startHour < 0 ||
    startHour > 23 ||
    startMinute < 0 ||
    startMinute > 59 ||
    runtimeHours <= 0
  ) {
    return false;
  }

  const now = new Date();
  const currentMinutes = (now.getHours() * 60) + now.getMinutes();
  const startMinutes = (startHour * 60) + startMinute;
  const runtimeMinutes = runtimeHours * 60;

  if (runtimeMinutes >= 1440) {
    return true;
  }

  const endMinutes = startMinutes + runtimeMinutes;

  if (endMinutes < 1440) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  const wrappedEndMinutes = endMinutes - 1440;
  return currentMinutes >= startMinutes || currentMinutes < wrappedEndMinutes;
}
