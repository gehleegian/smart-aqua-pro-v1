import type {
  Aquarium,
  AutomationSettings,
  ManualSystemStatus,
} from '../types/aquarium';
import { getDeviceTelemetryStatusText } from '../types/device';
import type {
  HealthStatus,
  ManualActionDisplay,
  ManualActionLock,
  MonitoringAquarium,
  MonitoringOwner,
  OwnerStats,
  SystemField,
} from '../types/monitoring';
import type { UserData, UserRole } from '../types/user';

export const systemStatusConfig: Record<
  SystemField,
  { activeValue: string; inactiveValue: string }
> = {
  feeder: { activeValue: 'Active', inactiveValue: 'Inactive' },
  light: { activeValue: 'On', inactiveValue: 'Off' },
  filter: { activeValue: 'Active', inactiveValue: 'Inactive' },
};

export const manualActionTiming: Record<
  SystemField,
  { activeMs: number; cooldownMs: number }
> = {
  feeder: { activeMs: 10000, cooldownMs: 20000 },
  light: { activeMs: 2000, cooldownMs: 5000 },
  filter: { activeMs: 3000, cooldownMs: 10000 },
};

export const defaultAutomationSettings: AutomationSettings = {
  enabled: true,
  feedingTimes: ['08:00'],
  lightOnTime: '06:00',
  lightOffTime: '22:00',
  filtrationStartTime: '07:00',
  filtrationRuntimeHours: 8,
};

export function getHealthStatus(
  level: number,
  quality: number,
  minLevel = 75,
  minQuality = 80,
  hasPurityReading = true,
  tdsPpm?: number | null
): HealthStatus {
  const purityIsHealthy =
    typeof tdsPpm === 'number' ? tdsPpm <= 500 : quality >= minQuality;

  if (!hasPurityReading || level < minLevel || !purityIsHealthy) {
    return 'warning';
  }

  return 'healthy';
}

export function getQualityLabel(quality: number, tdsPpm?: number | null) {
  if (typeof tdsPpm === 'number') {
    if (tdsPpm <= 300) return 'Healthy';
    if (tdsPpm <= 500) return 'Moderate';
    return 'Poor';
  }

  if (quality >= 85) return 'Healthy';
  if (quality >= 65) return 'Moderate';
  return 'Poor';
}

export function getLevelLabel(level: number) {
  if (level >= 90) return 'High';
  if (level >= 75) return 'Normal';
  if (level >= 60) return 'Low';
  return 'Critical';
}

export function getTemperatureLabel(temp: number, minTemp: number, maxTemp: number) {
  if (temp < minTemp || temp > maxTemp) {
    return 'Out of Range';
  }

  return 'Normal';
}

export function mapMonitoringAquariums(aquariums: Aquarium[]): MonitoringAquarium[] {
  return aquariums.map((aquarium) => ({
    ...aquarium,
    healthStatus: 'warning',
    hasFreshTelemetry: false,
    hasFreshTemperatureTelemetry: false,
    hasFreshPurityTelemetry: false,
    telemetryState: 'unavailable',
  }));
}

export function getAutomationSettings(
  aquarium: Pick<Aquarium, 'automationSettings'> | null
): AutomationSettings {
  return {
    ...defaultAutomationSettings,
    ...(aquarium?.automationSettings || {}),
  };
}

export function getManualSystemStatus(
  aquarium: Pick<Aquarium, SystemField | 'manualStatus'>
): ManualSystemStatus {
  return {
    feeder: aquarium.feeder,
    light: aquarium.light,
    filter: aquarium.filter,
    ...(aquarium.manualStatus || {}),
  };
}

export function formatAutomationTime(time: string) {
  if (!time) {
    return 'Not set';
  }

  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2026, 0, 1, hour, minute));
}

export function formatAutomationTimes(times: string[]) {
  return times.length > 0
    ? times.map(formatAutomationTime).join(', ')
    : 'No feeding times';
}

export function buildOwnerStats(ownerAquariums: MonitoringAquarium[]): OwnerStats {
  const totalTanks = ownerAquariums.length;
  const liveDataAquariums = ownerAquariums.filter((aquarium) => aquarium.hasFreshTelemetry);
  const livePurityAquariums = ownerAquariums.filter((aquarium) => aquarium.hasFreshPurityTelemetry);
  const average = (field: 'temp' | 'level' | 'quality') =>
    liveDataAquariums.length === 0
      ? 0
      : liveDataAquariums.reduce((sum, aquarium) => sum + aquarium[field], 0) / liveDataAquariums.length;
  const averagePurity =
    livePurityAquariums.length === 0
      ? 0
      : livePurityAquariums.reduce((sum, aquarium) => sum + aquarium.quality, 0) /
        livePurityAquariums.length;

  return {
    totalTanks,
    liveDataTanks: liveDataAquariums.length,
    healthyTanks: ownerAquariums.filter((aquarium) => aquarium.healthStatus === 'healthy').length,
    warningTanks: ownerAquariums.filter((aquarium) => aquarium.healthStatus === 'warning').length,
    averageTemp: average('temp'),
    averageLevel: average('level'),
    averageQuality: averagePurity,
    activeFeeders: ownerAquariums.filter(
      (aquarium) => getManualSystemStatus(aquarium).feeder === 'Active'
    ).length,
    activeFilters: ownerAquariums.filter((aquarium) => aquarium.filter === 'Active').length,
    lightsOn: ownerAquariums.filter((aquarium) => aquarium.light === 'On').length,
  };
}

export function buildMonitoringOwners(
  aquariums: MonitoringAquarium[],
  users: UserData[]
): MonitoringOwner[] {
  const adminIds = new Set(
    users
      .filter((user) => user.role === 'Admin' && Boolean(user.id))
      .map((user) => user.id as string)
  );
  const aquariumsByOwner = new Map<string, MonitoringAquarium[]>();

  for (const aquarium of aquariums) {
    const ownerId = aquarium.ownerId || 'unknown';

    if (adminIds.has(ownerId)) {
      continue;
    }

    const ownerAquariums = aquariumsByOwner.get(ownerId) || [];

    ownerAquariums.push(aquarium);
    aquariumsByOwner.set(ownerId, ownerAquariums);
  }

  const ownersFromUsers = users
    .filter(
      (user): user is UserData & { id: string } =>
        user.role === 'User' && Boolean(user.id)
    )
    .map((user) => {
      const ownerAquariums = aquariumsByOwner.get(user.id) || [];

      aquariumsByOwner.delete(user.id);

      return {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        aquariums: ownerAquariums,
        stats: buildOwnerStats(ownerAquariums),
      };
    });

  const ownersFromAquariums = Array.from(aquariumsByOwner.entries()).map(
    ([ownerId, ownerAquariums]) => ({
      id: ownerId,
      name: ownerAquariums[0]?.ownerName || 'Unknown Owner',
      email: 'No account record',
      role: 'User' as UserRole,
      aquariums: ownerAquariums,
      stats: buildOwnerStats(ownerAquariums),
    })
  );

  return [...ownersFromUsers, ...ownersFromAquariums].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
}

export function getInitials(name: string) {
  return (
    name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'U'
  );
}

export function formatAverage(value: number, total: number, suffix = '') {
  return total === 0 ? 'No data' : `${value.toFixed(1)}${suffix}`;
}

export function getMonitoringTelemetryMessage(aquarium: Pick<MonitoringAquarium, 'telemetryState'>) {
  return getDeviceTelemetryStatusText(aquarium.telemetryState);
}

export function getManualActionKey(aquariumId: string, field: SystemField) {
  return `${aquariumId}-${field}`;
}

export function getRemainingSeconds(until: number, now: number) {
  return Math.max(1, Math.ceil((until - now) / 1000));
}

type ManualActionDisplayOptions = {
  aquariumId: string;
  field: SystemField;
  locks: Record<string, ManualActionLock>;
  manualStatus: ManualSystemStatus;
  now: number;
  savingManualKey: string;
};

export function getManualActionDisplay({
  aquariumId,
  field,
  locks,
  manualStatus,
  now,
  savingManualKey,
}: ManualActionDisplayOptions): ManualActionDisplay {
  const actionKey = getManualActionKey(aquariumId, field);
  const lock = locks[actionKey];
  const savingCurrentField = savingManualKey === actionKey;
  const savingAnotherField = Boolean(savingManualKey) && !savingCurrentField;

  if (savingCurrentField) {
    return {
      status: 'Sending command...',
      buttonLabel: 'Working...',
      disabled: true,
      tone: 'busy',
    };
  }

  if (lock && lock.cooldownUntil > now) {
    if (lock.activeUntil > now) {
      const seconds = getRemainingSeconds(lock.activeUntil, now);
      const status =
        field === 'feeder'
          ? `Feeding now (${seconds}s)`
          : `Applying command (${seconds}s)`;

      return {
        status,
        buttonLabel: field === 'feeder' ? 'Feeding...' : 'Applying...',
        disabled: true,
        tone: 'busy',
      };
    }

    return {
      status: `Cooling down (${getRemainingSeconds(lock.cooldownUntil, now)}s)`,
      buttonLabel: 'Please Wait',
      disabled: true,
      tone: 'waiting',
    };
  }

  if (field === 'feeder') {
    return {
      status:
        manualStatus.feeder === 'Active'
          ? 'Feeder is active'
          : 'Ready for one feeding cycle',
      buttonLabel: 'Feed Now',
      disabled: savingAnotherField,
      tone: 'ready',
    };
  }

  if (field === 'light') {
    return {
      status: `Light is ${manualStatus.light}`,
      buttonLabel:
        manualStatus.light === 'On' ? 'Turn Off Light' : 'Turn On Light',
      disabled: savingAnotherField,
      tone: 'ready',
    };
  }

  return {
    status: `Filter is ${manualStatus.filter}`,
    buttonLabel:
      manualStatus.filter === 'Active' ? 'Stop Filtration' : 'Start Filtration',
    disabled: savingAnotherField,
    tone: 'ready',
  };
}

export function prepareAutomationSettings(draft: AutomationSettings):
  | { settings: AutomationSettings; error: '' }
  | { settings: null; error: string } {
  const runtimeHours = Number(draft.filtrationRuntimeHours);
  const feedingTimes = draft.feedingTimes.map((time) => time.trim()).filter(Boolean);

  if (
    feedingTimes.length === 0 ||
    !draft.filtrationStartTime
  ) {
    return { settings: null, error: 'Please complete the feeding and filtration schedule.' };
  }

  if (!Number.isFinite(runtimeHours) || runtimeHours < 1 || runtimeHours > 24) {
    return {
      settings: null,
      error: 'Filtration runtime must be between 1 and 24 hours.',
    };
  }

  return {
    settings: {
      ...draft,
      feedingTimes,
      filtrationRuntimeHours: runtimeHours,
    },
    error: '',
  };
}
