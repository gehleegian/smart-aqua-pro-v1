import type { ReactNode } from 'react';
import { ArrowLeft, Beaker, Droplets, Gauge, RefreshCw, Thermometer, Waves, Zap } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { AutomationSettings } from '../../types/aquarium';
import type {
  ManualActionDisplay,
  MonitoringAquarium,
  SystemField,
  SystemMode,
} from '../../types/monitoring';
import {
  getLevelLabel,
  getManualSystemStatus,
  getMonitoringTelemetryMessage,
  getPhLabel,
  getQualityLabel,
  getTurbidityLabel,
  getTemperatureLabel,
} from '../../utils/monitoringHelpers';
import { MonitoringMetricCard } from './MonitoringCards';
import { SystemStatusCard } from './SystemControls';

type AquariumDetailsViewProps = {
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
};

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
  const telemetryMessage = getMonitoringTelemetryMessage(aquarium);
  const temperatureLabel = aquarium.hasFreshTelemetry
    ? aquarium.hasFreshTemperatureTelemetry
      ? getTemperatureLabel(aquarium.temp, aquarium.minTemp, aquarium.maxTemp)
      : 'No water detected'
    : telemetryMessage;
  const levelLabel = aquarium.hasFreshTelemetry ? getLevelLabel(aquarium.level) : telemetryMessage;
  const qualityLabel = aquarium.hasFreshTelemetry
    ? aquarium.hasFreshPurityTelemetry
      ? getQualityLabel(aquarium.quality, aquarium.tdsPpm)
      : 'Sensor unavailable'
    : telemetryMessage;
  const phLabel = aquarium.hasFreshTelemetry ? getPhLabel(aquarium.ph) : telemetryMessage;
  const turbidityLabel = aquarium.hasFreshTelemetry
    ? getTurbidityLabel(aquarium.turbidity)
    : telemetryMessage;
  const powerStatusLabel =
    aquarium.telemetryState === 'live'
      ? 'Online'
      : aquarium.telemetryState === 'offline'
        ? 'Offline'
        : 'Waiting';
  const manualSystemStatus = getManualSystemStatus(aquarium);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Aquariums
          </button>
          <div>
            <h2 className="text-xl font-semibold text-white">{aquarium.name}</h2>
            <p className="text-sm text-slate-400 mt-1">Monitoring details and controls</p>
          </div>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
              <p className="text-sm text-slate-400 mt-1">
                Species:{' '}
                {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species set'}
              </p>
            </div>

            <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
              {aquarium.healthStatus}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <MonitoringMetricCard
          icon={Thermometer}
          title="Temperature"
          value={
            aquarium.hasFreshTemperatureTelemetry ? <>{aquarium.temp}&deg;C</> : '--'
          }
          iconBg="bg-orange-500/20"
          iconColor="text-orange-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Range</span>
              <span className="text-slate-300">
                {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
              </span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>{aquarium.hasFreshTelemetry ? 'Status' : 'Live Status'}</span>
              <span
                className={
                  temperatureLabel === 'Normal'
                    ? 'text-emerald-400'
                    : temperatureLabel === 'Device offline'
                      ? 'text-red-400'
                      : 'text-amber-400'
                }
              >
                {temperatureLabel}
              </span>
            </div>
          </div>
        </MonitoringMetricCard>

        <MonitoringMetricCard
          icon={Droplets}
          title="Water Level"
          value={aquarium.hasFreshTelemetry ? `${aquarium.level}%` : '--'}
          iconBg="bg-blue-500/20"
          iconColor="text-blue-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>{aquarium.hasFreshTelemetry ? 'Condition' : 'Live Status'}</span>
              <span className={getLevelTextColor(levelLabel)}>{levelLabel}</span>
            </div>
            {aquarium.hasFreshTelemetry ? (
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${aquarium.level}%` }} />
              </div>
            ) : (
              <p className="text-xs text-slate-500">Waiting for fresh telemetry from the device.</p>
            )}
          </div>
        </MonitoringMetricCard>

        <MonitoringMetricCard
          icon={Waves}
          title="Water Purity (TDS Level)"
          value={
            aquarium.hasFreshPurityTelemetry
              ? typeof aquarium.tdsPpm === 'number'
                ? `${Math.round(aquarium.tdsPpm)} ppm`
                : `${aquarium.quality}%`
              : '--'
          }
          iconBg="bg-emerald-500/20"
          iconColor="text-emerald-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>{aquarium.hasFreshPurityTelemetry ? 'Condition' : 'Live Status'}</span>
              <span className={getQualityTextColor(qualityLabel)}>{qualityLabel}</span>
            </div>
            {aquarium.hasFreshPurityTelemetry ? (
              <>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>Purity score</span>
                  <span>{Math.round(aquarium.quality)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                  <div
                    className="bg-emerald-500 h-2 rounded-full"
                    style={{ width: `${aquarium.quality}%` }}
                  />
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                TDS sensor is not returning a valid in-water reading yet.
              </p>
            )}
          </div>
        </MonitoringMetricCard>

        <MonitoringMetricCard
          icon={Gauge}
          title="Bioload"
          value={<span className="capitalize">{aquarium.bioload}</span>}
          iconBg="bg-cyan-500/20"
          iconColor="text-cyan-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Species Count</span>
              <span className="text-slate-300">{aquarium.species.length}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Feeding</span>
              <span className="text-slate-300">{manualSystemStatus.feeder}</span>
            </div>
          </div>
        </MonitoringMetricCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <MonitoringMetricCard
          icon={Beaker}
          title="pH Level"
          value={aquarium.hasFreshTelemetry && typeof aquarium.ph === 'number' ? aquarium.ph.toFixed(2) : '--'}
          iconBg="bg-violet-500/20"
          iconColor="text-violet-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>{aquarium.hasFreshTelemetry ? 'Condition' : 'Live Status'}</span>
              <span className={getPhTextColor(phLabel)}>{phLabel}</span>
            </div>
            {aquarium.hasFreshTelemetry && typeof aquarium.ph === 'number' ? (
              <p className="text-xs text-slate-500">Ideal range is about 6.5 - 7.8</p>
            ) : (
              <p className="text-xs text-slate-500">Waiting for fresh pH telemetry from the device.</p>
            )}
          </div>
        </MonitoringMetricCard>

        <MonitoringMetricCard
          icon={Waves}
          title="Turbidity"
          value={aquarium.hasFreshTelemetry && typeof aquarium.turbidity === 'number' ? Math.round(aquarium.turbidity) : '--'}
          iconBg="bg-sky-500/20"
          iconColor="text-sky-400"
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>{aquarium.hasFreshTelemetry ? 'Condition' : 'Live Status'}</span>
              <span className={getTurbidityTextColor(turbidityLabel)}>{turbidityLabel}</span>
            </div>
            {aquarium.hasFreshTelemetry && typeof aquarium.turbidity === 'number' ? (
              <p className="text-xs text-slate-500">Lower values generally mean clearer water.</p>
            ) : (
              <p className="text-xs text-slate-500">Waiting for fresh turbidity telemetry from the device.</p>
            )}
          </div>
        </MonitoringMetricCard>

        <MonitoringMetricCard
          icon={Zap}
          title="Power Status"
          value={powerStatusLabel}
          iconBg={
            aquarium.telemetryState === 'live'
              ? 'bg-emerald-500/20'
              : aquarium.telemetryState === 'offline'
                ? 'bg-red-500/20'
                : 'bg-amber-500/20'
          }
          iconColor={
            aquarium.telemetryState === 'live'
              ? 'text-emerald-400'
              : aquarium.telemetryState === 'offline'
                ? 'text-red-400'
                : 'text-amber-400'
          }
        >
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-slate-400">
              <span>Connection</span>
              <span className={getPowerTextColor(aquarium.telemetryState)}>{telemetryMessage}</span>
            </div>
            <p className="text-xs text-slate-500">
              Shows whether the device is currently sending live data to the system.
            </p>
          </div>
        </MonitoringMetricCard>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <SystemStatusCard
          aquarium={aquarium}
          automationEnabled={automationEnabled}
          automationSettings={automationSettings}
          manualActions={manualActions}
          mode={systemMode}
          savingAutomation={savingAutomation}
          savingAutomationEnabled={savingAutomationEnabled}
          savingMode={savingMode}
          savingSystemKey={savingSystemKey}
          systemError={systemError}
          onAutomationToggle={onAutomationToggle}
          onManualAction={onManualAction}
          onModeChange={onModeChange}
          onOpenAutomationEditor={onOpenAutomationEditor}
          onSystemToggle={onSystemToggle}
        />

        <MonitoringSummaryCard aquarium={aquarium} telemetryMessage={telemetryMessage} />
      </div>
    </div>
  );
}

function MonitoringSummaryCard({
  aquarium,
  telemetryMessage,
}: {
  aquarium: MonitoringAquarium;
  telemetryMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">Monitoring Summary</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-4 text-sm">
          <SummaryRow label="Aquarium Name" value={aquarium.name} />
          <SummaryRow label="Owner" value={aquarium.ownerName} />
          <SummaryRow
            label="Temperature Range"
            value={
              <>
                {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
              </>
            }
          />
          <SummaryRow
            label="Health Status"
            value={aquarium.healthStatus}
            valueClassName={
              aquarium.healthStatus === 'healthy'
                ? 'text-emerald-400 font-medium'
                : 'text-amber-400 font-medium'
            }
          />
          <SummaryRow
            label="Live Data"
            value={telemetryMessage}
            valueClassName={
              aquarium.hasFreshTelemetry
                ? 'text-emerald-400 font-medium'
                : 'text-amber-300 font-medium'
            }
          />
          <SummaryRow
            label="Species"
            value={aquarium.species.length > 0 ? aquarium.species.join(', ') : 'None'}
            withBorder={false}
          />
        </div>
      </CardContent>
    </Card>
  );
}

type SummaryRowProps = {
  label: string;
  value: ReactNode;
  valueClassName?: string;
  withBorder?: boolean;
};

function SummaryRow({
  label,
  value,
  valueClassName = 'text-white font-medium',
  withBorder = true,
}: SummaryRowProps) {
  return (
    <div className={`flex justify-between ${withBorder ? 'border-b border-slate-700/50 pb-2' : ''}`}>
      <span className="text-slate-400">{label}</span>
      <span className={valueClassName}>{value}</span>
    </div>
  );
}

function getLevelTextColor(levelLabel: string) {
  if (levelLabel === 'High' || levelLabel === 'Normal') {
    return 'text-emerald-400';
  }

  if (levelLabel === 'No live data') {
    return 'text-amber-300';
  }

  if (levelLabel === 'Device offline') {
    return 'text-red-400';
  }

  return levelLabel === 'Low' ? 'text-amber-400' : 'text-red-400';
}

function getQualityTextColor(qualityLabel: string) {
  if (qualityLabel === 'Healthy') {
    return 'text-emerald-400';
  }

  if (qualityLabel === 'No live data') {
    return 'text-amber-300';
  }

  if (qualityLabel === 'Device offline') {
    return 'text-red-400';
  }

  if (qualityLabel === 'Sensor unavailable') {
    return 'text-amber-300';
  }

  return qualityLabel === 'Moderate' ? 'text-amber-400' : 'text-red-400';
}

function getPhTextColor(label: string) {
  if (label === 'Balanced') {
    return 'text-emerald-400';
  }

  if (label === 'Waiting for telemetry') {
    return 'text-amber-300';
  }

  return label === 'Low' ? 'text-amber-400' : 'text-red-400';
}

function getTurbidityTextColor(label: string) {
  if (label === 'Clear') {
    return 'text-emerald-400';
  }

  if (label === 'Waiting for telemetry') {
    return 'text-amber-300';
  }

  return label === 'Moderate' ? 'text-amber-400' : 'text-red-400';
}

function getPowerTextColor(state: string) {
  if (state === 'Live data') {
    return 'text-emerald-400';
  }

  if (state === 'No live data') {
    return 'text-amber-300';
  }

  return 'text-red-400';
}
