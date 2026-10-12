import { ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import type { AutomationSettings } from '../../types/aquarium';
import type {
  ManualActionDisplay,
  MonitoringAquarium,
  SystemField,
  SystemMode,
} from '../../types/monitoring';
import {
  formatAutomationTimes,
  formatAutomationTime,
  getQualityLabel,
} from '../../utils/monitoringHelpers';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AquariumDetailsViewProps {
  aquarium: MonitoringAquarium;
  automationEnabled: boolean;
  automationSettings: AutomationSettings;
  manualActions: Record<SystemField, ManualActionDisplay>;
  savingAutomation: boolean;
  savingAutomationEnabled: boolean;
  savingMode: boolean;
  savingSystemKey: string;
  systemError: string;
  systemMode: SystemMode;
  onAutomationToggle: () => void;
  onBack: () => void;
  onManualAction: (field: SystemField) => void;
  onModeChange: (mode: SystemMode) => void;
  onOpenAutomationEditor: () => void;
  onRefresh: () => void;
  onSystemToggle: (field: SystemField) => void;
}

export function AquariumDetailsView({
  aquarium,
  automationEnabled,
  automationSettings,
  manualActions,
  savingAutomation,
  savingAutomationEnabled,
  savingMode,
  savingSystemKey,
  systemError,
  systemMode,
  onAutomationToggle,
  onBack,
  onManualAction,
  onModeChange,
  onOpenAutomationEditor,
  onRefresh,
  onSystemToggle,
}: AquariumDetailsViewProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <Button variant="secondary" onClick={onRefresh}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {systemError ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
          {systemError}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{aquarium.species.join(', ')}</p>
            </div>
            <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
              {aquarium.telemetryState}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <Reading
              label="Temperature"
              value={
                aquarium.hasFreshTemperatureTelemetry
                  ? `${aquarium.temp.toFixed(1)} C`
                  : '--'
              }
              status={
                aquarium.hasFreshTemperatureTelemetry
                  ? 'Live telemetry'
                  : 'Waiting for telemetry'
              }
            />
            <Reading
              label="Water Level"
              value={aquarium.hasFreshTelemetry ? `${aquarium.level}%` : '--'}
              status={aquarium.hasFreshTelemetry ? 'Live telemetry' : 'Waiting for telemetry'}
            />
            <Reading
              label="TDS Quality"
              value={
                aquarium.hasFreshPurityTelemetry
                  ? typeof aquarium.tdsPpm === 'number'
                    ? `${Math.round(aquarium.tdsPpm)} ppm`
                    : getQualityLabel(aquarium.quality, aquarium.tdsPpm)
                  : '--'
              }
              status={
                aquarium.hasFreshPurityTelemetry
                  ? getQualityLabel(aquarium.quality, aquarium.tdsPpm)
                  : 'Waiting for telemetry'
              }
            />
            <Reading
              label="pH Level"
              value={
                aquarium.hasFreshPhTelemetry && typeof aquarium.ph === 'number'
                  ? aquarium.ph.toFixed(1)
                  : '--'
              }
              status={aquarium.hasFreshPhTelemetry ? 'Live telemetry' : 'Waiting for telemetry'}
            />
            <Reading
              label="Turbidity"
              value={
                aquarium.hasFreshTurbidityTelemetry && typeof aquarium.turbidity === 'number'
                  ? `${aquarium.turbidity.toFixed(0)} NTU`
                  : '--'
              }
              status={
                aquarium.hasFreshTurbidityTelemetry
                  ? 'Live telemetry'
                  : 'Waiting for telemetry'
              }
            />
            <Reading
              label="Power Status"
              value={aquarium.hasFreshPowerTelemetry ? aquarium.powerStatus || '--' : '--'}
              status={aquarium.hasFreshPowerTelemetry ? 'Live telemetry' : 'Waiting for telemetry'}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Manual Controls</h3>
          </CardHeader>
          <CardContent>
            <div className="mb-4 flex rounded-lg border border-slate-600/40 bg-slate-900/45 p-1">
              {(['manual', 'automation'] as SystemMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={savingMode}
                  onClick={() => onModeChange(mode)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm ${
                    systemMode === mode ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            <div className="space-y-3">
              {(['feeder', 'light', 'filter'] as SystemField[]).map((field) => (
                <div key={field} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
                  <div>
                    <p className="capitalize text-white">{field}</p>
                    <p className="text-xs text-slate-500">{manualActions[field].status}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={manualActions[field].disabled || Boolean(savingSystemKey)}
                    onClick={() => (systemMode === 'manual' ? onManualAction(field) : onSystemToggle(field))}
                  >
                    {manualActions[field].buttonLabel}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white">Automation</h3>
              <Button size="sm" variant="secondary" onClick={onOpenAutomationEditor}>
                <Settings className="h-4 w-4" />
                Edit
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <Row label="Status" value={automationEnabled ? 'Enabled' : 'Disabled'} />
              <Row label="Feeding" value={formatAutomationTimes(automationSettings.feedingTimes)} />
              <Row label="Light On" value={formatAutomationTime(automationSettings.lightOnTime)} />
              <Row label="Light Off" value={formatAutomationTime(automationSettings.lightOffTime)} />
              <Row label="Filtration" value={`${formatAutomationTime(automationSettings.filtrationStartTime)} for ${automationSettings.filtrationRuntimeHours}h`} />
            </div>
            <Button className="mt-5 w-full" disabled={savingAutomationEnabled || savingAutomation} onClick={onAutomationToggle}>
              {automationEnabled ? 'Disable Automation' : 'Enable Automation'}
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Reading({ label, value, status }: { label: string; value: string; status: string }) {
  return (
    <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white">{value}</p>
      <p className="mt-2 text-xs text-slate-500">{status}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-slate-500">{label}</span>
      <span className="text-right text-white">{value}</span>
    </div>
  );
}
