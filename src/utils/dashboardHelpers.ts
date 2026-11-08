import { formatWaterLevel } from './monitoringAssessmentCore';
import {
  AlertTriangle,
  Droplets,
  Fish,
  Radio,
  ShieldCheck,
  Thermometer,
  Users,
  Waves,
  Zap,
  Activity,
  Gauge,
  Power,
} from 'lucide-react';
import type { Aquarium } from '../types/aquarium';
import {
  getDeviceTelemetryStatusText,
  getDeviceTelemetryUpdatedAt,
  getFreshTelemetrySnapshot,
  getDeviceTelemetryState,
  getDeviceCommandStatus,
  type DeviceShadow,
} from '../types/device';
import { getSensorDisplay } from './sensorDisplay';
import type {
  DashboardAquarium,
  DashboardData,
  DashboardSummaryCard,
  DashboardTankStat,
  OwnerGroup,
} from '../types/dashboard';
import { assessAquarium, getCustomThresholdKeys, getEffectiveThresholds } from './conditionAssessment';
import type { AquariumEngineState, RuleConfigSnapshot } from '../services/ruleConfigService';

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

export type FreshTelemetrySnapshot = NonNullable<ReturnType<typeof getFreshTelemetrySnapshot>>;

const UNASSESSED = (now = Date.now()) => assessAquarium({
  aquarium: {},
  reading: null,
  source: 'unavailable',
  now,
  ruleConfig: null,
});

export function mapDashboardAquariums(aquariums: Aquarium[]): DashboardAquarium[] {
  return aquariums.map((aquarium) => ({
    ...aquarium,
    status: 'warning',
    assessment: UNASSESSED(),
    telemetrySource: 'unavailable',
    fishCount: aquarium.fishCount ?? 0,
    hasFreshTelemetry: false,
    hasFreshTemperatureTelemetry: false,
    hasFreshPurityTelemetry: false,
    hasFreshPhTelemetry: false,
    hasFreshTurbidityTelemetry: false,
    hasFreshPowerTelemetry: false,
    telemetryState: 'unavailable',
    lastUpdatedAt: null,
    sensorValidity: null,
    commandStatus: 'none',
    thresholds: null,
    engineState: null,
  }));
}

export function mergeDashboardAquariums(
  aquariums: DashboardAquarium[],
  deviceShadows: Record<string, DeviceShadow>,
  now = Date.now(),
  ruleConfig: RuleConfigSnapshot | null = null,
  engineStates: Record<string, AquariumEngineState> = {}
): DashboardAquarium[] {
  return aquariums.map((aquarium) => {
    const telemetry = deviceShadows[aquarium.id]?.telemetry;
    const telemetryState = getDeviceTelemetryState(telemetry, now);
    const snapshot = getFreshTelemetrySnapshot(telemetry, now, aquarium);

    const nextAquarium: Aquarium = {
      ...aquarium,
      temp: snapshot ? snapshot.temperatureC : aquarium.temp,
      level: snapshot ? snapshot.waterLevelPercent : aquarium.level,
      // TDS ppm stands on its own: firmware may send tdsPpm without the legacy purity %.
      tdsPpm: snapshot && typeof snapshot.tdsPpm === 'number' ? snapshot.tdsPpm : aquarium.tdsPpm,
      ph: snapshot?.hasFreshPhTelemetry ? snapshot.ph ?? aquarium.ph : aquarium.ph,
      turbidity: snapshot?.hasFreshTurbidityTelemetry
        ? snapshot.turbidity ?? aquarium.turbidity
        : aquarium.turbidity,
      powerStatus: snapshot?.hasFreshPowerTelemetry
        ? snapshot.powerStatus ?? aquarium.powerStatus
        : aquarium.powerStatus,
      quality: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
      filter: snapshot?.filterState ?? aquarium.filter,
      manualStatus: snapshot?.filterState && aquarium.manualStatus
        ? { ...aquarium.manualStatus, filter: snapshot.filterState }
        : aquarium.manualStatus,
    };
    const assessment = assessAquarium({
      aquarium: nextAquarium as unknown as Record<string, unknown>,
      reading: snapshot && telemetry ? telemetry as unknown as Record<string, unknown> : null,
      source: snapshot ? 'live' : 'unavailable',
      now,
      ruleConfig,
      engineState: engineStates[aquarium.id] ?? null,
    });

    return {
      ...nextAquarium,
      status: assessment.overallSeverity === 'normal' ? 'healthy' : 'warning',
      assessment,
      telemetrySource: snapshot ? 'live' : 'unavailable',
      fishCount: nextAquarium.fishCount ?? 0,
      hasFreshTelemetry: Boolean(snapshot),
      hasFreshWaterLevelTelemetry: Boolean(snapshot?.hasFreshWaterLevelTelemetry),
      waterLevelMessage: snapshot?.waterLevelMessage,
      hasFreshTemperatureTelemetry: Boolean(snapshot?.hasFreshTemperatureTelemetry),
      hasFreshPurityTelemetry: Boolean(snapshot?.hasFreshPurityTelemetry),
      hasFreshPhTelemetry: Boolean(snapshot?.hasFreshPhTelemetry),
      hasFreshTurbidityTelemetry: Boolean(snapshot?.hasFreshTurbidityTelemetry),
      hasFreshPowerTelemetry: Boolean(snapshot?.hasFreshPowerTelemetry),
      telemetryState,
      lastUpdatedAt: getDeviceTelemetryUpdatedAt(telemetry),
      sensorValidity: snapshot?.validity ?? null,
      commandStatus: getDeviceCommandStatus(deviceShadows[aquarium.id], now),
      thresholds: getEffectiveThresholds(nextAquarium as unknown as Record<string, unknown>, ruleConfig),
      customThresholds: getCustomThresholdKeys(
        getEffectiveThresholds(nextAquarium as unknown as Record<string, unknown>, ruleConfig),
        nextAquarium as unknown as Record<string, unknown>,
        ruleConfig
      ),
      engineState: engineStates[aquarium.id] ?? null,
    };
  });
}

export function buildOwnerGroups(aquariums: DashboardAquarium[]): OwnerGroup[] {
  const groups = new Map<string, OwnerGroup>();

  for (const aquarium of aquariums) {
    const key = aquarium.ownerId || 'unknown';

    if (!groups.has(key)) {
      groups.set(key, {
        ownerId: aquarium.ownerId || '',
        ownerName: aquarium.ownerName || 'Unknown Owner',
        aquariums: [],
        warningCount: 0,
      });
    }

    const group = groups.get(key)!;
    group.aquariums.push(aquarium);

    if (aquarium.status === 'warning') {
      group.warningCount += 1;
    }
  }

  return Array.from(groups.values()).sort((a, b) => a.ownerName.localeCompare(b.ownerName));
}

export function getStatsForTank(tank: DashboardAquarium): DashboardTankStat[] {
  if (!tank.hasFreshTelemetry) {
    const message = getDeviceTelemetryStatusText(tank.telemetryState);

    return [
      {
        title: 'Temperature',
        value: '--',
        icon: Thermometer,
        change: message,
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'Water Level',
        value: '--',
        icon: Droplets,
        change: message,
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'Water Purity (TDS)',
        value: '--',
        icon: Waves,
        change: message,
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'System Status',
        value: tank.telemetryState === 'offline' ? 'Offline' : 'No live data',
        icon: Zap,
        change: message,
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'pH Level',
        value: '--',
        icon: Activity,
        change: 'Waiting for telemetry',
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'Turbidity',
        value: '--',
        icon: Gauge,
        change: 'Waiting for telemetry',
        trend: 'warning',
        sparkline: [],
      },
      {
        title: 'Power Status',
        value: '--',
        icon: Power,
        change: 'Waiting for telemetry',
        trend: 'warning',
        sparkline: [],
      },
    ];
  }

  const condition = (parameter: string) =>
    tank.assessment.parameters.find((item) => item.parameter === parameter);
  const trend = (parameter: string): DashboardTankStat['trend'] =>
    condition(parameter)?.severity === 'normal' ? 'good' : 'warning';

  const live = tank.hasFreshTelemetry;
  const temperature = getSensorDisplay(tank.sensorValidity, 'temperature', live, () => `${tank.temp.toFixed(1)}\u00B0C`);
  const waterLevel = tank.hasFreshWaterLevelTelemetry === false
    ? { value: '--', status: tank.waterLevelMessage || 'No valid water-level reading', isError: true }
    : getSensorDisplay(tank.sensorValidity, 'waterLevel', live, () => formatWaterLevel(tank.level));
  const tds = getSensorDisplay(tank.sensorValidity, 'tds', live, () =>
    typeof tank.tdsPpm === 'number' ? `${Math.round(tank.tdsPpm)} ppm` : `${tank.quality}%`);
  const ph = getSensorDisplay(tank.sensorValidity, 'ph', live, () =>
    typeof tank.ph === 'number' ? tank.ph.toFixed(1) : '--');
  const turbidity = getSensorDisplay(tank.sensorValidity, 'turbidity', live, () =>
    typeof tank.turbidity === 'number' ? `${tank.turbidity.toFixed(0)} NTU` : '--');
  const changeFor = (display: { isError: boolean; status: string }, parameter: string, fallback: string) =>
    display.isError ? display.status : condition(parameter)?.message || fallback;

  return [
    {
      title: 'Temperature',
      value: temperature.value,
      icon: Thermometer,
      change: changeFor(temperature, 'temperature', 'Assessment unavailable'),
      trend: trend('temperature'),
      sparkline: [],
    },
    {
      title: 'Water Level',
      value: waterLevel.value,
      icon: Droplets,
      change: changeFor(waterLevel, 'waterLevel', 'Assessment unavailable'),
      trend: trend('waterLevel'),
      sparkline: [],
    },
    {
      title: 'Water Purity (TDS)',
      value: tds.value,
      icon: Waves,
      change: changeFor(tds, 'tds', 'Sensor unavailable'),
      trend: trend('tds'),
      sparkline: [],
    },
    {
      title: 'pH Level',
      value: ph.value,
      icon: Activity,
      change: changeFor(ph, 'ph', 'Waiting for telemetry'),
      trend: trend('ph'),
      sparkline: [],
    },
    {
      title: 'Turbidity',
      value: turbidity.value,
      icon: Gauge,
      change: changeFor(turbidity, 'turbidity', 'Waiting for telemetry'),
      trend: trend('turbidity'),
      sparkline: [],
    },
    {
      title: 'Power Status',
      value: tank.hasFreshPowerTelemetry ? tank.powerStatus || '--' : '--',
      icon: Power,
      change: condition('power')?.message || 'Waiting for telemetry',
      trend: trend('power'),
      sparkline: [],
    },
    {
      title: 'System Status',
      value: tank.assessment.overallSeverity,
      icon: Zap,
      change: tank.status === 'healthy' ? 'All assessed parameters normal' : 'Check condition assessment',
      trend: tank.status === 'healthy' ? 'good' : 'warning',
      sparkline: [],
    },
  ];
}

export function buildAdminSummaryCards(options: {
  totalUsers: number;
  totalAquariums: number;
  adminUsers: number;
  caretakerUsers: number;
}): DashboardSummaryCard[] {
  const { totalUsers, totalAquariums, adminUsers, caretakerUsers } = options;

  return [
    {
      title: 'Registered Accounts',
      value: totalUsers,
      icon: Users,
      iconClassName: 'text-cyan-400',
      iconWrapperClassName: 'bg-cyan-500/20',
    },
    {
      title: 'User/Caretaker Accounts',
      value: caretakerUsers,
      icon: Radio,
      iconClassName: 'text-teal-300',
      iconWrapperClassName: 'bg-teal-500/20',
    },
    {
      title: 'Administrator Accounts',
      value: adminUsers,
      icon: ShieldCheck,
      iconClassName: 'text-violet-300',
      iconWrapperClassName: 'bg-violet-500/20',
    },
    {
      title: 'Registered Aquariums',
      value: totalAquariums,
      icon: Fish,
      iconClassName: 'text-blue-400',
      iconWrapperClassName: 'bg-blue-500/20',
    },
  ];
}

export function buildUserSummaryCards(options: {
  aquariumCount: number;
  warningAquariums: number;
  healthyAquariums: number;
  selectedTankName: string;
}): DashboardSummaryCard[] {
  const { aquariumCount, warningAquariums, healthyAquariums, selectedTankName } = options;

  return [
    {
      title: 'My Aquariums',
      value: aquariumCount,
      icon: Fish,
      iconClassName: 'text-blue-400',
      iconWrapperClassName: 'bg-blue-500/20',
    },
    {
      title: 'Tanks Needing Attention',
      value: warningAquariums,
      icon: AlertTriangle,
      iconClassName: 'text-amber-400',
      iconWrapperClassName: 'bg-amber-500/20',
    },
    {
      title: 'Healthy Tanks',
      value: healthyAquariums,
      icon: ShieldCheck,
      iconClassName: 'text-emerald-400',
      iconWrapperClassName: 'bg-emerald-500/20',
    },
    {
      title: 'Selected Aquarium',
      value: selectedTankName,
      icon: Radio,
      iconClassName: 'text-cyan-400',
      iconWrapperClassName: 'bg-cyan-500/20',
    },
  ];
}

export function buildAdminAlerts(ownerGroups: OwnerGroup[]) {
  const ownersNeedingAttention = ownerGroups.filter((group) => group.warningCount > 0);

  if (ownersNeedingAttention.length === 0) {
    return ['No owners currently have aquariums needing attention.'];
  }

  return ownersNeedingAttention.map(
    (group) =>
      `${group.ownerName} has ${group.warningCount} aquarium${
        group.warningCount > 1 ? 's' : ''
      } needing attention.`
  );
}

export function buildUserAlerts(aquariums: DashboardAquarium[]) {
  const warningAquariums = aquariums.filter((tank) => tank.status === 'warning');

  if (warningAquariums.length === 0) {
    return ['All of your aquariums are currently stable.'];
  }

  return warningAquariums.map(
    (tank) =>
      tank.hasFreshTelemetry
        ? `${tank.name} needs attention based on current monitoring values.`
        : `${tank.name}: ${tank.telemetryState === 'offline' ? 'device offline' : 'no live data yet'}.`
  );
}

export function buildAdminActivities(ownerGroups: OwnerGroup[]) {
  const ownersMostTanks = [...ownerGroups]
    .sort((a, b) => b.aquariums.length - a.aquariums.length)
    .slice(0, 5);

  if (ownersMostTanks.length === 0) {
    return ['No aquarium records available yet.'];
  }

  return ownersMostTanks.map(
    (group) =>
      `${group.ownerName} currently has ${group.aquariums.length} aquarium${
        group.aquariums.length > 1 ? 's' : ''
      } in the system.`
  );
}

export function buildUserActivities(aquariums: DashboardAquarium[]) {
  if (aquariums.length === 0) {
    return ['You have not added any aquariums yet.'];
  }

  return aquariums.map(
    (tank) =>
      `${tank.name} is registered with ${tank.species.length} species entr${
        tank.species.length !== 1 ? 'ies' : 'y'
      }.`
  );
}

export function getDashboardEmptyMessage(userRole: DashboardData['userProfile']['role']) {
  return userRole === 'Admin'
    ? 'No aquarium records exist yet.'
    : 'You have not added any aquariums yet.';
}
