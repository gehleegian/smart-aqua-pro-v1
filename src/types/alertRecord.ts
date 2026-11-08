// Firestore alert_records. The original snake_case fields keep their shape;
// the camelCase fields were added in Sprint 2 by the rules engine (functions).
export interface AlertRecordDocument {
  alert_id: string;
  aquarium_id: string;
  device_id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  status?: 'active' | 'resolved';
  triggered_at: Date;
  resolved_at: Date | null;
  ruleId?: string | null;
  recommendationId?: string | null;
  parameter?: string;
  dedupKey?: string;
  occurrences?: number;
  /** Epoch ms. */
  lastSeenAt?: number;
}
