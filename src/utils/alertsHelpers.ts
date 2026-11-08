import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Droplets,
  Thermometer,
  Waves,
  Zap,
} from 'lucide-react';
import type { DashboardAquarium } from '../types/dashboard';
import type { MonitoringParameter } from './monitoringAssessmentCore';
import type {
  AlertCandidate,
  AlertCategory,
  AlertSeverity,
  AquariumAlert,
} from '../types/alerts';

const ALERT_HISTORY_LIMIT = 200;
const ALERT_HISTORY_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;
const ALERT_RESOLVE_GRACE_MS = 1000 * 60 * 5;
const ALERT_RENOTIFY_MS = 1000 * 60 * 15;

export const severityIconMap = {
  critical: AlertCircle,
  warning: AlertTriangle,
};

export const categoryIconMap: Record<AlertCategory, typeof Thermometer> = {
  temperature: Thermometer,
  water_level: Droplets,
  tds: Waves,
  ph: Waves,
  turbidity: Waves,
  ammonia: Waves,
  power_status: Zap,
  filter_state: Zap,
  equipment_status: Zap,
  water_quality: Waves,
  system: Zap,
};

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback} (${error.message})`;
  }

  return fallback;
}

export function getSeverityBadgeVariant(severity: AlertSeverity) {
  return severity === 'critical' ? 'danger' : 'warning';
}

export function getAlertStatus(alert: AquariumAlert) {
  if (alert.resolvedAt) {
    return 'resolved';
  }

  if (alert.acknowledgedAt) {
    return 'acknowledged';
  }

  return 'active';
}

export function getAlertStatusBadge(alert: AquariumAlert) {
  const status = getAlertStatus(alert);

  if (status === 'resolved') {
    return {
      label: 'Resolved',
      variant: 'success' as const,
    };
  }

  if (status === 'acknowledged') {
    return {
      label: 'Acknowledged',
      variant: 'info' as const,
    };
  }

  return {
    label: alert.type,
    variant: getSeverityBadgeVariant(alert.type) as 'danger' | 'warning',
  };
}

export function formatRelativeTime(epochMillis: number) {
  const diffMs = epochMillis - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return 'just now';
  }

  if (Math.abs(diffMinutes) < 60) {
    return `${Math.abs(diffMinutes)} min${Math.abs(diffMinutes) === 1 ? '' : 's'} ${
      diffMinutes < 0 ? 'ago' : 'from now'
    }`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (Math.abs(diffHours) < 24) {
    return `${Math.abs(diffHours)} hr${Math.abs(diffHours) === 1 ? '' : 's'} ${
      diffHours < 0 ? 'ago' : 'from now'
    }`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${Math.abs(diffDays)} day${Math.abs(diffDays) === 1 ? '' : 's'} ${
    diffDays < 0 ? 'ago' : 'from now'
  }`;
}

const parameterCategory: Record<MonitoringParameter, AlertCategory> = {
  temperature: 'temperature',
  ph: 'ph',
  turbidity: 'turbidity',
  tds: 'tds',
  waterLevel: 'water_level',
  filtration: 'filter_state',
  equipment: 'equipment_status',
  power: 'power_status',
};

// Alerts are derived only from the shared assessment (monitoringAssessmentCore).
// This file defines no thresholds of its own. Parameters assessed as
// "unavailable" (missing, invalid, default, or sensor-fault values) never raise
// a water-condition alert.
export function buildAlertCandidates(aquariums: DashboardAquarium[]): AlertCandidate[] {
  return aquariums.flatMap((aquarium) => {
    const candidates: AlertCandidate[] = [];

    if (aquarium.telemetrySource === 'live') {
      for (const parameter of aquarium.assessment.parameters) {
        if (parameter.severity !== 'warning' && parameter.severity !== 'critical') continue;
        candidates.push({
          fingerprint: `${aquarium.id}:${parameter.parameter}:${parameter.severity}`,
          aquariumId: aquarium.id,
          tankName: aquarium.name,
          ownerName: aquarium.ownerName,
          type: parameter.severity,
          category: parameterCategory[parameter.parameter],
          message: parameter.message,
        });
      }
    }

    if (aquarium.telemetryState === 'offline') {
      candidates.push({
        fingerprint: `${aquarium.id}:system:offline`,
        aquariumId: aquarium.id,
        tankName: aquarium.name,
        ownerName: aquarium.ownerName,
        type: 'warning',
        category: 'system',
        message: 'Device is not reporting live telemetry.',
      });
    }

    return candidates;
  });
}

export function readAlertHistory(storageKey: string) {
  if (typeof window === 'undefined') {
    return [] as AquariumAlert[];
  }

  try {
    const raw = window.localStorage.getItem(storageKey);

    if (!raw) {
      return [] as AquariumAlert[];
    }

    const parsed = JSON.parse(raw) as AquariumAlert[];

    if (!Array.isArray(parsed)) {
      return [] as AquariumAlert[];
    }

    return parsed.filter(
      (alert) =>
        alert &&
        typeof alert.id === 'string' &&
        typeof alert.fingerprint === 'string' &&
        typeof alert.aquariumId === 'string' &&
        typeof alert.firstDetectedAt === 'number' &&
        typeof alert.lastDetectedAt === 'number'
    );
  } catch {
    return [] as AquariumAlert[];
  }
}

export function writeAlertHistory(storageKey: string, alerts: AquariumAlert[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(alerts));
}

export function syncAlertHistory(
  previousAlerts: AquariumAlert[],
  activeCandidates: AlertCandidate[],
  now = Date.now()
) {
  const nextAlerts = [...previousAlerts];
  const activeFingerprints = new Set(activeCandidates.map((alert) => alert.fingerprint));

  function applyCandidateUpdate(alert: AquariumAlert, candidate: AlertCandidate) {
    alert.type = candidate.type;
    alert.category = candidate.category;
    alert.message = candidate.message;
    alert.tankName = candidate.tankName;
    alert.ownerName = candidate.ownerName;
  }

  for (const candidate of activeCandidates) {
    const activeRecord = nextAlerts.find(
      (alert) => alert.fingerprint === candidate.fingerprint && alert.resolvedAt === null
    );

    if (activeRecord) {
      applyCandidateUpdate(activeRecord, candidate);

      if (now - activeRecord.lastDetectedAt >= ALERT_RENOTIFY_MS) {
        activeRecord.lastDetectedAt = now;
      }

      continue;
    }

    const recentResolvedRecord = nextAlerts.find(
      (alert) =>
        alert.fingerprint === candidate.fingerprint &&
        alert.resolvedAt !== null &&
        now - alert.resolvedAt <= ALERT_RESOLVE_GRACE_MS
    );

    if (recentResolvedRecord) {
      applyCandidateUpdate(recentResolvedRecord, candidate);
      recentResolvedRecord.resolvedAt = null;
      recentResolvedRecord.acknowledgedAt = null;
      recentResolvedRecord.lastDetectedAt = now;
      continue;
    }

    nextAlerts.unshift({
      ...candidate,
      id: `${candidate.fingerprint}:${now}`,
      firstDetectedAt: now,
      lastDetectedAt: now,
      resolvedAt: null,
      acknowledgedAt: null,
    });
  }

  for (const alert of nextAlerts) {
    if (alert.resolvedAt === null && !activeFingerprints.has(alert.fingerprint)) {
      if (now - alert.lastDetectedAt >= ALERT_RESOLVE_GRACE_MS) {
        alert.resolvedAt = now;
      }
    }
  }

  return nextAlerts
    .filter(
      (alert) =>
        now - Math.max(alert.lastDetectedAt, alert.resolvedAt ?? 0) <=
        ALERT_HISTORY_MAX_AGE_MS
    )
    .slice(0, ALERT_HISTORY_LIMIT);
}

export function acknowledgeAlert(alerts: AquariumAlert[], alertId: string) {
  const now = Date.now();

  return alerts.map((alert) =>
    alert.id === alertId ? { ...alert, acknowledgedAt: now } : alert
  );
}

export function filterAlerts(
  alerts: AquariumAlert[],
  selectedSeverity: 'all' | AlertSeverity,
  selectedStatus: 'all' | 'active' | 'acknowledged' | 'resolved'
) {
  return alerts.filter((alert) => {
    if (selectedSeverity !== 'all' && alert.type !== selectedSeverity) {
      return false;
    }

    const status = getAlertStatus(alert);

    if (selectedStatus !== 'all' && status !== selectedStatus) {
      return false;
    }

    return true;
  });
}

export function sortAlertsByRecency(alerts: AquariumAlert[]) {
  return [...alerts].sort(
    (left, right) =>
      Math.max(right.lastDetectedAt, right.resolvedAt ?? 0) -
      Math.max(left.lastDetectedAt, left.resolvedAt ?? 0)
  );
}

export function buildDistribution(alerts: AquariumAlert[]) {
  const categories: { label: string; key: AlertCategory; color: string }[] = [
    { label: 'Temperature', key: 'temperature', color: 'bg-orange-500' },
    { label: 'Water Level', key: 'water_level', color: 'bg-blue-500' },
    { label: 'pH', key: 'ph', color: 'bg-violet-500' },
    { label: 'TDS', key: 'tds', color: 'bg-emerald-500' },
    { label: 'Turbidity', key: 'turbidity', color: 'bg-teal-500' },
    { label: 'Equipment & Power', key: 'equipment_status', color: 'bg-rose-500' },
    { label: 'System', key: 'system', color: 'bg-yellow-500' },
  ];

  const grouped: Partial<Record<AlertCategory, AlertCategory>> = {
    power_status: 'equipment_status',
    filter_state: 'equipment_status',
  };

  return categories.map((category) => ({
    ...category,
    count: alerts.filter((alert) => (grouped[alert.category] ?? alert.category) === category.key).length,
  }));
}

export function formatAlertTimestamp(alert: AquariumAlert) {
  if (alert.resolvedAt) {
    return formatRelativeTime(alert.resolvedAt);
  }

  return formatRelativeTime(alert.lastDetectedAt);
}

export function getAlertPanelTitle(userRole: 'Admin' | 'User') {
  return userRole === 'Admin' ? 'System Alerts' : 'My Alerts';
}

export function buildSummaryCounts(alerts: AquariumAlert[]) {
  const activeAlerts = alerts.filter((alert) => getAlertStatus(alert) === 'active');
  const acknowledgedAlerts = alerts.filter(
    (alert) => getAlertStatus(alert) === 'acknowledged'
  );
  const resolvedAlerts = alerts.filter((alert) => getAlertStatus(alert) === 'resolved');

  return {
    criticalCount: activeAlerts.filter((alert) => alert.type === 'critical').length,
    warningCount: activeAlerts.filter((alert) => alert.type === 'warning').length,
    acknowledgedCount: acknowledgedAlerts.length,
    resolvedCount: resolvedAlerts.length,
    totalCount: alerts.length,
  };
}

export const resolvedIcon = CheckCircle;
