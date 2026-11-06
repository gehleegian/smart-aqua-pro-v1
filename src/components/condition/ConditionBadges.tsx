import type { AssessmentSeverity, ParameterAssessment } from '../../types/monitoring';
import Badge from '../ui/Badge';

export function severityVariant(severity: AssessmentSeverity) {
  if (severity === 'normal') return 'success' as const;
  if (severity === 'critical') return 'danger' as const;
  if (severity === 'warning') return 'warning' as const;
  return 'default' as const;
}

const SEVERITY_LABEL: Record<AssessmentSeverity, string> = {
  normal: 'Normal',
  warning: 'Warning',
  critical: 'Critical',
  unavailable: 'Unavailable',
};

export function OverallConditionBadge({ severity }: { severity: AssessmentSeverity }) {
  return <Badge variant={severityVariant(severity)}>{SEVERITY_LABEL[severity].toUpperCase()}</Badge>;
}

export function DraftThresholdsBadge({ draft }: { draft: boolean }) {
  if (!draft) return null;
  return (
    <span title="Thresholds and rules are draft values awaiting adviser approval.">
      <Badge variant="info">Draft thresholds</Badge>
    </span>
  );
}

export function ParameterStatusBadge({ item }: { item: ParameterAssessment }) {
  if (item.notMonitored) return <Badge variant="info">{item.value === 'Not installed' ? 'Not installed' : 'Not monitored'}</Badge>;
  if (item.severity === 'unavailable' && item.message.startsWith('Unavailable: sensor fault')) {
    return <Badge variant="warning">Sensor error</Badge>;
  }
  return <Badge variant={severityVariant(item.severity)}>{SEVERITY_LABEL[item.severity]}</Badge>;
}
