import {
  AlertTriangle,
  Beaker,
  Clock,
  Fish,
  Radio,
  Wifi,
  ShieldCheck,
  Thermometer,
  Users,
  Waves,
  Zap,
} from 'lucide-react-native';
import type { Aquarium } from '../types/aquarium';
import {
  getDeviceTelemetryStatusText,
  getDeviceTelemetryState,
  getFreshTelemetrySnapshot,
} from '../types/device';
import type {
  DashboardAquarium,
  DashboardSummaryCard,
  DashboardTankStat,
  DashboardTrend,
  DashboardStatus,
  OwnerGroup,
} from '../types/dashboard';
import type { UserRole } from '@smartaqua/shared';
import {
  getHealthStatus,
  formatTdsReading,
  getPhLabel,
  getTurbidityLabel,
} from './monitoringHelpers';

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

function getAquariumStatus(
  aquarium: Pick<Aquarium, 'level' | 'minLevel' | 'quality' | 'minQuality' | 'tdsPpm'>,
  hasFreshPurityTelemetry = true
): DashboardStatus {
  const purityIsHealthy =
    typeof aquarium.tdsPpm === 'number' ? aquarium.tdsPpm <= 500 : aquarium.quality >= aquarium.minQuality;

  if (!hasFreshPurityTelemetry || aquarium.level < aquarium.minLevel || !purityIsHealthy) {
    return 'warning';
  }

  return 'healthy';
}

export function mapDashboardAquariums(aquariums: Aquarium[]): DashboardAquarium[] {
  return aquariums.map((aquarium) => ({
    ...aquarium,
    status: 'warning',
    fishCount: Array.isArray(aquarium.species) ? aquarium.species.length : 0,
    hasFreshTelemetry: false,
    hasFreshPurityTelemetry: false,
    telemetryState: 'unavailable',
  }));
}

export function mergeDashboardAquariums(
  aquariums: DashboardAquarium[],
  deviceShadows: Record<string, { telemetry: unknown }>,
  now = Date.now()
): DashboardAquarium[] {
  return aquariums.map((aquarium) => {
    const telemetry = deviceShadows[aquarium.id]?.telemetry as any;
    const telemetryState = getDeviceTelemetryState(telemetry, now);
    const snapshot = getFreshTelemetrySnapshot(telemetry, now);

    const nextAquarium: Aquarium = {
      ...aquarium,
      temp: snapshot ? snapshot.temperatureC : aquarium.temp,
      level: snapshot ? snapshot.waterLevelPercent : aquarium.level,
      ph: snapshot?.ph ?? aquarium.ph,
      turbidity: snapshot?.turbidity ?? aquarium.turbidity,
      tdsPpm: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPpm ?? aquarium.tdsPpm : aquarium.tdsPpm,
      quality: snapshot?.hasFreshPurityTelemetry ? snapshot.tdsPercent! : aquarium.quality,
    };

    return {
      ...nextAquarium,
      status: snapshot ? getAquariumStatus(nextAquarium, snapshot.hasFreshPurityTelemetry) : 'warning',
      fishCount: Array.isArray(nextAquarium.species) ? nextAquarium.species.length : 0,
      hasFreshTelemetry: Boolean(snapshot),
      hasFreshPurityTelemetry: Boolean(snapshot?.hasFreshPurityTelemetry),
      telemetryState,
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
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'Water Level',
        value: '--',
        icon: Fish,
        change: message,
        trend: 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'Water Purity (TDS)',
        value: '--',
        icon: Waves,
        change: message,
        trend: 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'pH Level',
        value: typeof tank.ph === 'number' ? tank.ph.toFixed(2) : '--',
        icon: Beaker,
        change: getPhLabel(tank.ph),
        trend: typeof tank.ph === 'number' && tank.ph >= 6.5 && tank.ph <= 7.8 ? 'good' : 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'Turbidity',
        value: typeof tank.turbidity === 'number' ? `${Math.round(tank.turbidity)}` : '--',
        icon: Waves,
        change: getTurbidityLabel(tank.turbidity),
        trend: typeof tank.turbidity === 'number' && tank.turbidity <= 300 ? 'good' : 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'Power Status',
        value:
          tank.telemetryState === 'live'
            ? 'Online'
            : tank.telemetryState === 'offline'
              ? 'Offline'
              : 'Waiting',
        icon: Radio,
        change: message,
        trend: tank.telemetryState === 'live' ? 'good' : 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
      {
        title: 'System Status',
        value: tank.telemetryState === 'offline' ? 'Offline' : 'No live data',
        icon: Zap,
        change: message,
        trend: 'warning',
        sparkline: [0, 0, 0, 0, 0, 0],
      },
    ];
  }

  return [
    {
      title: 'Temperature',
      value: `${tank.temp.toFixed(1)}\u00B0C`,
      icon: Thermometer,
      change:
        tank.temp >= tank.minTemp && tank.temp <= tank.maxTemp ? 'Normal' : 'Check range',
      trend: tank.temp >= tank.minTemp && tank.temp <= tank.maxTemp ? 'good' : 'warning',
      sparkline: [tank.temp - 1.5, tank.temp - 1, tank.temp - 0.5, tank.temp - 0.2, tank.temp + 0.1, tank.temp],
    },
    {
      title: 'Water Level',
      value: `${tank.level}%`,
      icon: Fish,
      change: tank.level >= tank.minLevel ? 'Normal' : 'Needs attention',
      trend: tank.level >= tank.minLevel ? 'good' : 'warning',
      sparkline: [tank.level + 5, tank.level + 3, tank.level + 2, tank.level + 1, tank.level, tank.level],
    },
    {
      title: 'Water Purity (TDS)',
      value: tank.hasFreshPurityTelemetry
        ? formatTdsReading(tank.tdsPpm, tank.quality)
        : '--',
      icon: Waves,
      change: tank.hasFreshPurityTelemetry
        ? typeof tank.tdsPpm === 'number'
          ? tank.tdsPpm <= 300
            ? 'Healthy'
            : tank.tdsPpm <= 500
              ? 'Moderate'
              : 'Poor'
          : tank.quality >= tank.minQuality
            ? 'Healthy'
            : tank.quality >= 65
              ? 'Moderate'
              : 'Poor'
        : 'Sensor unavailable',
      trend:
        tank.hasFreshPurityTelemetry &&
        (typeof tank.tdsPpm === 'number' ? tank.tdsPpm <= 500 : tank.quality >= tank.minQuality)
          ? 'good'
          : 'warning',
      sparkline: [tank.quality - 4, tank.quality - 3, tank.quality - 2, tank.quality - 1, tank.quality, tank.quality],
    },
    {
      title: 'pH Level',
      value: typeof tank.ph === 'number' ? tank.ph.toFixed(2) : '--',
      icon: Beaker,
      change: getPhLabel(tank.ph),
      trend: typeof tank.ph === 'number' && tank.ph >= 6.5 && tank.ph <= 7.8 ? 'good' : 'warning',
      sparkline:
        typeof tank.ph === 'number'
          ? [tank.ph - 0.4, tank.ph - 0.2, tank.ph, tank.ph + 0.1, tank.ph + 0.05, tank.ph]
          : [0, 0, 0, 0, 0, 0],
    },
    {
      title: 'Turbidity',
      value: typeof tank.turbidity === 'number' ? `${Math.round(tank.turbidity)}` : '--',
      icon: Waves,
      change: getTurbidityLabel(tank.turbidity),
      trend: typeof tank.turbidity === 'number' && tank.turbidity <= 300 ? 'good' : 'warning',
      sparkline:
        typeof tank.turbidity === 'number'
          ? [
              tank.turbidity - 20,
              tank.turbidity - 10,
              tank.turbidity - 5,
              tank.turbidity,
              tank.turbidity + 8,
              tank.turbidity + 3,
            ]
          : [0, 0, 0, 0, 0, 0],
    },
    {
      title: 'Power Status',
      value:
        tank.telemetryState === 'live'
          ? 'Online'
          : tank.telemetryState === 'offline'
            ? 'Offline'
            : 'Waiting',
      icon: Radio,
      change: getDeviceTelemetryStatusText(tank.telemetryState),
      trend: tank.telemetryState === 'live' ? 'good' : 'warning',
      sparkline:
        tank.telemetryState === 'live' ? [100, 100, 100, 100, 100, 100] : [0, 0, 0, 0, 0, 0],
    },
    {
      title: 'System Status',
      value: tank.status === 'healthy' ? 'Stable' : 'Warning',
      icon: Zap,
      change: tank.status === 'healthy' ? 'All normal' : 'Check tank',
      trend: tank.status === 'healthy' ? 'good' : 'warning',
      sparkline: [100, 100, 100, 100, 100, tank.status === 'healthy' ? 100 : 85],
    },
  ];
}

export function buildAdminSummaryCards(options: {
  totalUsers: number;
  onlineUsers: number;
  totalAquariums: number;
  warningAquariums: number;
  healthyAquariums: number;
}): DashboardSummaryCard[] {
  const { totalUsers, onlineUsers, totalAquariums, warningAquariums, healthyAquariums } = options;

  return [
    { title: 'Total Users', value: totalUsers, icon: Users, tone: 'accent' },
    { title: 'Online Users', value: onlineUsers, icon: Wifi, tone: 'success' },
    { title: 'Total Aquariums', value: totalAquariums, icon: Fish, tone: 'accent' },
    { title: 'Warning Aquariums', value: warningAquariums, icon: AlertTriangle, tone: 'warning' },
    { title: 'Healthy Aquariums', value: healthyAquariums, icon: ShieldCheck, tone: 'success' },
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
    { title: 'My Aquariums', value: aquariumCount, icon: Fish, tone: 'accent' },
    { title: 'Tanks Needing Attention', value: warningAquariums, icon: AlertTriangle, tone: 'warning' },
    { title: 'Healthy Tanks', value: healthyAquariums, icon: ShieldCheck, tone: 'success' },
    { title: 'Selected Aquarium', value: selectedTankName, icon: Radio, tone: 'accent' },
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

  return warningAquariums.map((tank) =>
    tank.hasFreshTelemetry
      ? `${tank.name} needs attention based on current monitoring values.`
      : `${tank.name} is ${getDeviceTelemetryStatusText(tank.telemetryState).toLowerCase()}.`
  );
}

export function buildAdminActivities(ownerGroups: OwnerGroup[]) {
  const ownersMostTanks = [...ownerGroups].sort((a, b) => b.aquariums.length - a.aquariums.length).slice(0, 5);

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

export function getDashboardEmptyMessage(userRole: UserRole) {
  return userRole === 'Admin'
    ? 'No aquarium records exist yet.'
    : 'You have not added any aquariums yet.';
}

export { getErrorMessage };
