export type RecommendationStatus = 'pending' | 'applied' | 'resolved' | 'dismissed';

export type Recommendation = {
  id: string;
  aquariumId: string;
  ruleId: string;
  parameter: string;
  severity: 'warning' | 'critical';
  title: string;
  issueDetected: string;
  action: string;
  basis: string;
  preCheck: string;
  /** Validated telemetry captured when this recommendation was generated. */
  readingSnapshot: Record<string, unknown> | null;
  threshold: { min?: number; max?: number } | null;
  /** Approval status of the rule that produced it. */
  ruleStatus: 'draft' | 'approved';
  alertId: string | null;
  status: RecommendationStatus;
  createdAt: number;
  resolvedAt: number | null;
  resolvedBy: string | null;
};
