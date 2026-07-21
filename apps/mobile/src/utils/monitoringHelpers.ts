import type { Aquarium, AutomationSettings, ManualSystemStatus } from '../types/aquarium';
import type {
  HealthStatus,
  ManualActionDisplay,
  ManualActionLock,
  MonitoringAquarium,
  SystemField,
} from '../types/monitoring';

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

export function getPhLabel(ph?: number | null) {
  if (typeof ph !== 'number' || !Number.isFinite(ph)) {
    return 'Waiting for telemetry';
  }

  if (ph >= 6.5 && ph <= 7.8) {
    return 'Balanced';
  }

  return ph < 6.5 ? 'Low' : 'High';
}

export function getTurbidityLabel(turbidity?: number | null) {
  if (typeof turbidity !== 'number' || !Number.isFinite(turbidity)) {
    return 'Waiting for telemetry';
  }

  if (turbidity <= 300) {
    return 'Clear';
  }

  if (turbidity <= 700) {
    return 'Moderate';
  }

  return 'Cloudy';
}

export function getPurityTone(
  quality?: number | null,
  tdsPpm?: number | null,
  minQuality = 80
): 'success' | 'warning' | 'danger' {
  if (typeof tdsPpm === 'number' && Number.isFinite(tdsPpm)) {
    if (tdsPpm <= 300) return 'success';
    if (tdsPpm <= 500) return 'warning';
    return 'danger';
  }

  if (typeof quality === 'number' && Number.isFinite(quality)) {
    if (quality >= minQuality) return 'success';
    if (quality >= 65) return 'warning';
    return 'danger';
  }

  return 'warning';
}

export function formatTdsReading(
  tdsPpm?: number | null,
  fallbackValue?: number | null
) {
  if (typeof tdsPpm === 'number' && Number.isFinite(tdsPpm)) {
    return `${Math.round(tdsPpm)} ppm`;
  }

  if (typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)) {
    return `${Math.round(fallbackValue)} ppm`;
  }

  return '--';
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
  const normalized = normalizeAutomationTimeInput(time);

  if (!normalized) {
    return time || 'Not set';
  }

  const hour12 = normalized.hour % 12 || 12;
  const period = normalized.hour >= 12 ? 'PM' : 'AM';

  return `${String(hour12).padStart(2, '0')}:${String(normalized.minute).padStart(2, '0')} ${period}`;
}

export function formatAutomationTimes(times: string[]) {
  return times.length > 0
    ? times.map(formatAutomationTime).join(', ')
    : 'No feeding times';
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
    !draft.lightOnTime.trim() ||
    !draft.lightOffTime.trim() ||
    !draft.filtrationStartTime.trim()
  ) {
    return {
      settings: null,
      error: 'Please complete the feeding, lighting, and filtration schedule.',
    };
  }

  const normalizedFeedingTimes = feedingTimes.map((time) => normalizeAutomationTimeText(time));
  const normalizedLightOnTime = normalizeAutomationTimeText(draft.lightOnTime);
  const normalizedLightOffTime = normalizeAutomationTimeText(draft.lightOffTime);
  const normalizedStartTime = normalizeAutomationTimeText(draft.filtrationStartTime);

  if (
    normalizedFeedingTimes.some((time) => !time) ||
    !normalizedLightOnTime ||
    !normalizedLightOffTime ||
    !normalizedStartTime
  ) {
    return {
      settings: null,
      error: 'Use a valid time like 07:29 PM or 19:29.',
    };
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
      feedingTimes: normalizedFeedingTimes as string[],
      lightOnTime: normalizedLightOnTime,
      lightOffTime: normalizedLightOffTime,
      filtrationStartTime: normalizedStartTime,
      filtrationRuntimeHours: runtimeHours,
    },
    error: '',
  };
}

function normalizeAutomationTimeText(time: string) {
  const normalized = normalizeAutomationTimeInput(time);

  if (!normalized) {
    return '';
  }

  return `${String(normalized.hour).padStart(2, '0')}:${String(normalized.minute).padStart(2, '0')}`;
}

function normalizeAutomationTimeInput(time: string) {
  if (!time) {
    return null;
  }

  const trimmed = time.trim().toUpperCase().replace(/\s+/g, ' ');
  const match = trimmed.match(/^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/);

  if (!match) {
    return null;
  }

  const rawHour = Number(match[1]);
  const minute = Number(match[2]);
  const period = match[3];

  if (!Number.isFinite(rawHour) || !Number.isFinite(minute) || minute < 0 || minute > 59) {
    return null;
  }

  if (period) {
    if (rawHour < 1 || rawHour > 12) {
      return null;
    }

    const hour = period === 'PM' ? (rawHour === 12 ? 12 : rawHour + 12) : rawHour === 12 ? 0 : rawHour;

    return { hour, minute };
  }

  if (rawHour < 0 || rawHour > 23) {
    return null;
  }

  return { hour: rawHour, minute };
}
