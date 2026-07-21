import type { ComponentType, ReactNode } from 'react';
import { Droplets, Eye, Thermometer, Waves } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { MonitoringAquarium, MonitoringOwner } from '../../types/monitoring';
import {
  getInitials,
  getLevelLabel,
  getManualSystemStatus,
  getMonitoringTelemetryMessage,
  getQualityLabel,
  getTemperatureLabel,
} from '../../utils/monitoringHelpers';

export type IconComponent = ComponentType<{ className?: string }>;

type StatCardProps = {
  icon: IconComponent;
  label: string;
  value: ReactNode;
  caption: string;
  iconBg: string;
  iconColor: string;
};

export function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  iconBg,
  iconColor,
}: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{caption}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

type OwnerCardProps = {
  owner: MonitoringOwner;
  onView: (owner: MonitoringOwner) => void;
};

export function OwnerCard({ owner, onView }: OwnerCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-white">{getInitials(owner.name)}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">{owner.name}</h3>
              <p className="text-xs text-slate-500 truncate">{owner.email}</p>
            </div>
          </div>

          <Badge variant={owner.role === 'Admin' ? 'danger' : 'info'}>{owner.role}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-white">{owner.stats.totalTanks}</p>
            <p className="text-xs text-slate-500">Tanks</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-emerald-400">{owner.stats.healthyTanks}</p>
            <p className="text-xs text-slate-500">Healthy</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-amber-400">{owner.stats.warningTanks}</p>
            <p className="text-xs text-slate-500">Warnings</p>
          </div>
        </div>

        <button
          onClick={() => onView(owner)}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </CardContent>
    </Card>
  );
}

type AquariumOverviewCardProps = {
  aquarium: MonitoringAquarium;
  onView: (aquarium: MonitoringAquarium) => void;
};

export function AquariumOverviewCard({ aquarium, onView }: AquariumOverviewCardProps) {
  const temperatureLabel = aquarium.hasFreshTelemetry
    ? aquarium.hasFreshTemperatureTelemetry
      ? getTemperatureLabel(aquarium.temp, aquarium.minTemp, aquarium.maxTemp)
      : 'No water detected'
    : getMonitoringTelemetryMessage(aquarium);
  const waterStatusLabel = aquarium.hasFreshTelemetry
    ? 'Level'
    : getMonitoringTelemetryMessage(aquarium);
  const qualityStatusLabel = aquarium.hasFreshTelemetry
    ? aquarium.hasFreshPurityTelemetry
      ? 'Purity (TDS)'
      : 'Sensor unavailable'
    : getMonitoringTelemetryMessage(aquarium);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{aquarium.name}</h3>
            <p className="text-sm text-slate-400 mt-1 truncate">
              {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species set'}
            </p>
          </div>
          <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
            {aquarium.healthStatus}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Thermometer className="w-4 h-4 text-orange-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">
              {aquarium.hasFreshTemperatureTelemetry ? `${aquarium.temp}\u00B0C` : '--'}
            </p>
            <p className="text-xs text-slate-500">{temperatureLabel}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Droplets className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">
              {aquarium.hasFreshTelemetry ? `${aquarium.level}%` : '--'}
            </p>
            <p className="text-xs text-slate-500">{waterStatusLabel}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Waves className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">
              {aquarium.hasFreshPurityTelemetry
                ? typeof aquarium.tdsPpm === 'number'
                  ? `${Math.round(aquarium.tdsPpm)} ppm`
                  : `${aquarium.quality}%`
                : '--'}
            </p>
            <p className="text-xs text-slate-500">{qualityStatusLabel}</p>
          </div>
        </div>

        <SystemBadges aquarium={aquarium} className="mt-4" />

        <button
          onClick={() => onView(aquarium)}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </CardContent>
    </Card>
  );
}

export function TankCard({ aquarium }: { aquarium: MonitoringAquarium }) {
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

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species set'}
            </p>
          </div>
          <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
            {aquarium.healthStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <Thermometer className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              {aquarium.hasFreshTemperatureTelemetry ? `${aquarium.temp}\u00B0C` : '--'}
            </p>
            <p className="text-xs text-slate-500">{temperatureLabel}</p>
          </div>
          <div className="text-center">
            <Droplets className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              {aquarium.hasFreshTelemetry ? `${aquarium.level}%` : '--'}
            </p>
            <p className="text-xs text-slate-500">{levelLabel}</p>
          </div>
          <div className="text-center">
            <Waves className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              {aquarium.hasFreshPurityTelemetry
                ? typeof aquarium.tdsPpm === 'number'
                  ? `${Math.round(aquarium.tdsPpm)} ppm`
                  : `${aquarium.quality}%`
                : '--'}
            </p>
            <p className="text-xs text-slate-500">{qualityLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-xs text-slate-500">Temperature Range</p>
            <p className="text-white font-medium">
              {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-xs text-slate-500">Bioload</p>
            <p className="text-white font-medium capitalize">{aquarium.bioload}</p>
          </div>
        </div>

        <SystemBadges aquarium={aquarium} />
      </CardContent>
    </Card>
  );
}

type MonitoringMetricCardProps = {
  icon: IconComponent;
  title: string;
  value: ReactNode;
  iconBg: string;
  iconColor: string;
  children: ReactNode;
};

export function MonitoringMetricCard({
  icon: Icon,
  title,
  value,
  iconBg,
  iconColor,
  children,
}: MonitoringMetricCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm text-slate-400">{title}</p>
            <p className="text-2xl font-bold text-white">{value}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        </div>

        {children}
      </CardContent>
    </Card>
  );
}

function SystemBadges({
  aquarium,
  className = '',
}: {
  aquarium: MonitoringAquarium;
  className?: string;
}) {
  const manualStatus = getManualSystemStatus(aquarium);

  return (
    <div className={`flex items-center gap-2 flex-wrap ${className}`}>
      <Badge variant={manualStatus.feeder === 'Active' ? 'success' : 'default'}>
        Feeder: {manualStatus.feeder}
      </Badge>
      <Badge variant={aquarium.light === 'On' ? 'info' : 'default'}>
        Light: {aquarium.light}
      </Badge>
      <Badge variant={aquarium.filter === 'Active' ? 'success' : 'default'}>
        Filter: {aquarium.filter}
      </Badge>
    </div>
  );
}
