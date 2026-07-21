import type { Aquarium } from './aquarium';
import type { UserData } from '@smartaqua/shared';

export type AlertSeverity = 'critical' | 'warning';
export type AlertCategory = 'temperature' | 'water_level' | 'water_quality' | 'system';

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
};

export type AlertsPageData = {
  userProfile: UserData;
  aquariums: Aquarium[];
};
