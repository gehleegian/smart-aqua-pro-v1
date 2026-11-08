import type { Recommendation } from './recommendation';
import type { Aquarium } from './aquarium';
import type { UserData } from './user';

export type AlertSeverity = 'critical' | 'warning';
export type AlertCategory =
  | 'temperature'
  | 'water_level'
  | 'tds'
  | 'ph'
  | 'turbidity'
  | 'ammonia'
  | 'power_status'
  | 'filter_state'
  | 'equipment_status'
  | 'water_quality'
  | 'system';

export type AlertStatusFilter = 'all' | 'active' | 'acknowledged' | 'resolved';
export type AlertSeverityFilter = 'all' | AlertSeverity;

export type AlertCandidate = {
  fingerprint: string;
  aquariumId: string;
  tankName: string;
  ownerName: string;
  type: AlertSeverity;
  category: AlertCategory;
  message: string;
};

export type AquariumAlert = AlertCandidate & {
  id: string;
  firstDetectedAt: number;
  lastDetectedAt: number;
  resolvedAt: number | null;
  acknowledgedAt: number | null;
  /** Rule title (server alerts). */
  title?: string;
  /** Sampled evaluations that saw the condition (server alerts; at most one per 5 min). */
  occurrences?: number;
  recommendationId?: string | null;
  ruleId?: string | null;
  /** server = alert_records from the rules engine; client = browser fallback before the function is deployed. */
  origin?: 'server' | 'client';
  /** Linked recommendation (server alerts). */
  recommendation?: Recommendation | null;
};

export type AlertsPageData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};
