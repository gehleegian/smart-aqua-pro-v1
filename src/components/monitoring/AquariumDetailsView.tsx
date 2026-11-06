import { ArrowLeft, RefreshCw, Settings } from 'lucide-react';
import { formatWaterLevel } from '../../utils/monitoringAssessmentCore';
import { getSensorDisplay } from '../../utils/sensorDisplay';
import { getCommandStatusText } from '../../types/device';
import type { AutomationSettings } from '../../types/aquarium';
import type {
  AssessmentSeverity,
  ManualActionDisplay,
  MonitoringAquarium,
  SystemField,
  SystemMode,
} from '../../types/monitoring';
import {
  formatAutomationTimes,
  formatAutomationTime,
} from '../../utils/monitoringHelpers';
import {
  formatBiomass,
  formatEstimatedBioload,
} from '../../utils/aquariumProfileCalculations';
import Badge from '../ui/Badge';
import { DraftThresholdsBadge, ParameterStatusBadge } from '../condition/ConditionBadges';
import { RecommendationsPanel } from '../condition/RecommendationsPanel';
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
  controlsDisabled: boolean;
  onAutomationToggle: () => void;
  onBack: () => void;
  onManualAction: (field: SystemField) => void;
  onModeChange: (mode: SystemMode) => void;
  onOpenAutomationEditor: () => void;
  /** Sprint 3: false for a caretaker (commands only; schedules are owner-only). */
  canManage?: boolean;
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
  controlsDisabled,
  onAutomationToggle,
  onBack,
  onManualAction,
  onModeChange,
  onOpenAutomationEditor,
  canManage = true,
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

      {aquarium.telemetrySource === 'simulated' ? (
        <div className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
          SIMULATED DATA — for software testing only. These readings are not from sensors and cannot trigger equipment controls.
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
              <p className="mt-1 text-sm text-slate-400">{aquarium.species.join(', ')}</p>
            </div>
            <Badge variant={getSeverityVariant(aquarium.assessment.overallSeverity)}>
              {aquarium.telemetrySource} · {aquarium.assessment.overallSeverity}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            {(() => {
              const live = aquarium.hasFreshTelemetry;
              const readings = [
                { label: 'Temperature', display: getSensorDisplay(aquarium.sensorValidity, 'temperature', live, () => `${aquarium.temp.toFixed(1)} C`) },
                { label: 'Water Level', display: getSensorDisplay(aquarium.sensorValidity, 'waterLevel', live, () => formatWaterLevel(aquarium.level)) },
                {
                  label: 'TDS Quality',
                  display: getSensorDisplay(aquarium.sensorValidity, 'tds', live, () =>
                    typeof aquarium.tdsPpm === 'number' ? `${Math.round(aquarium.tdsPpm)} ppm` : '--'),
                },
                { label: 'pH Level', display: getSensorDisplay(aquarium.sensorValidity, 'ph', live, () => typeof aquarium.ph === 'number' ? aquarium.ph.toFixed(1) : '--') },
                { label: 'Turbidity', display: getSensorDisplay(aquarium.sensorValidity, 'turbidity', live, () => typeof aquarium.turbidity === 'number' ? `${aquarium.turbidity.toFixed(0)} NTU` : '--') },
              ];
              return readings.map(({ label, display }) => (
                <Reading key={label} label={label} value={display.value} status={display.status} />
              ));
            })()}
            <Reading
              label="Power Status"
              value={aquarium.hasFreshPowerTelemetry ? aquarium.powerStatus || '--' : '--'}
              status={aquarium.hasFreshPowerTelemetry ? 'Live telemetry' : 'Waiting for telemetry'}
            />
            <Reading
              label="Estimated Bioload"
              value={formatEstimatedBioload(aquarium.estimatedBioloadGL)}
              status={
                aquarium.estimatedBioloadGL === undefined
                  ? 'Complete the aquarium profile'
                  : 'Profile derived'
              }
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">Condition Assessment</h3>
              <p className="mt-1 text-sm text-slate-400">
                Rule-based assessment ({aquarium.assessment.ruleVersion}). Guidance only; maintenance actions require your review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <DraftThresholdsBadge draft={aquarium.assessment.draft} />
              <Badge variant={getSeverityVariant(aquarium.assessment.overallSeverity)}>
                {aquarium.assessment.overallSeverity}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {aquarium.assessment.parameters.map((item) => (
              <div key={item.parameter} className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <ParameterStatusBadge item={item} />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.message}</p>
              </div>
            ))}
          </div>
          <details className="mt-4 text-sm text-slate-400">
            <summary className="cursor-pointer">Assessment limits and calibration</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {aquarium.assessment.ruleNotes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </details>
          {aquarium.assessment.recommendations.length > 0 ? (
            <div className="mt-4 rounded-lg border border-slate-600/20 bg-slate-950/35 p-4">
              <p className="text-sm font-medium text-white">Maintenance recommendations</p>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-300">
                {aquarium.assessment.recommendations.map((recommendation) => (
                  <li key={recommendation}>{recommendation}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {aquarium.telemetrySource !== 'simulated' ? <RecommendationsPanel aquariumId={aquarium.id} /> : null}

      <Card>
        <CardHeader>
          <div>
            <h3 className="text-lg font-semibold text-white">Aquarium Profile</h3>
            <p className="mt-1 text-sm text-slate-400">
              Structural details used to identify this aquarium. These values do not alter sensor classification rules.
            </p>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <ProfileRow label="Aquarium type" value={aquarium.tankType || 'Profile incomplete'} />
            <ProfileRow
              label="Tank dimensions"
              value={
                aquarium.tankLengthCm !== undefined &&
                aquarium.tankWidthCm !== undefined &&
                aquarium.tankHeightCm !== undefined
                  ? `${aquarium.tankLengthCm} × ${aquarium.tankWidthCm} × ${aquarium.tankHeightCm} cm`
                  : 'Profile incomplete'
              }
            />
            <ProfileRow
              label="Operational water volume"
              value={
                aquarium.workingWaterVolumeLiters !== undefined
                  ? `${aquarium.workingWaterVolumeLiters} L`
                  : 'Profile incomplete'
              }
            />
            <ProfileRow
              label="Filtration system installed"
              value={
                aquarium.hasFiltrationSystem === true
                  ? 'Yes'
                  : aquarium.hasFiltrationSystem === false
                    ? 'No'
                    : 'Profile incomplete'
              }
            />
            <ProfileRow label="Fish species" value={aquarium.species.join(', ') || 'Profile incomplete'} />
            <ProfileRow
              label="Fish quantity"
              value={aquarium.fishCount !== undefined ? String(aquarium.fishCount) : 'Profile incomplete'}
            />
            <ProfileRow label="Total fish biomass" value={formatBiomass(aquarium.totalFishBiomassG)} />
            <ProfileRow label="Estimated bioload" value={formatEstimatedBioload(aquarium.estimatedBioloadGL)} />
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Manual Controls</h3>
          </CardHeader>
          <CardContent>
            {controlsDisabled ? (
              <p className="mb-4 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                Controls are disabled while simulated telemetry is active.
              </p>
            ) : null}
            <div className="mb-4 flex rounded-lg border border-slate-600/40 bg-slate-900/45 p-1">
              {(['manual', 'automation'] as SystemMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={savingMode || controlsDisabled || !canManage}
                  title={canManage ? undefined : 'Only the owner changes the mode'}
                  onClick={() => onModeChange(mode)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm ${
                    systemMode === mode ? 'bg-teal-600 text-white' : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {aquarium.commandStatus !== 'none' ? (
              <p
                className={`mb-4 rounded-lg border px-3 py-2 text-xs ${
                  aquarium.commandStatus === 'done'
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-100'
                    : aquarium.commandStatus === 'pending'
                      ? 'border-slate-500/30 bg-slate-800/40 text-slate-200'
                      : 'border-amber-400/30 bg-amber-400/10 text-amber-100'
                }`}
                role="status"
              >
                Last command: {getCommandStatusText(aquarium.commandStatus)}
              </p>
            ) : null}
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
                    disabled={controlsDisabled || manualActions[field].disabled || Boolean(savingSystemKey)}
                    onClick={() => (systemMode === 'manual' || !canManage ? onManualAction(field) : onSystemToggle(field))}
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
              {canManage ? (
                <Button size="sm" variant="secondary" disabled={controlsDisabled} onClick={onOpenAutomationEditor}>
                  <Settings className="h-4 w-4" />
                  Edit
                </Button>
              ) : (
                <span className="text-xs text-slate-400">Owner only</span>
              )}
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
            {canManage && (
              <Button className="mt-5 w-full" disabled={controlsDisabled || savingAutomationEnabled || savingAutomation} onClick={onAutomationToggle}>
                {automationEnabled ? 'Disable Automation' : 'Enable Automation'}
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function getSeverityVariant(severity: AssessmentSeverity) {
  if (severity === 'normal') return 'success' as const;
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'default' as const;
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

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-4">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-200">{value}</dd>
    </div>
  );
}
