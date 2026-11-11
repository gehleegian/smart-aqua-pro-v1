import type { AssessmentSeverity, ParameterAssessment } from '../../types/monitoring';
import { CircleCheck, CircleHelp, OctagonAlert, TriangleAlert } from 'lucide-react';
import Badge from '../ui/Badge';

// Sprint 5 a11y: each severity has its own icon shape as well as its colour
// and its word, so it never depends on colour alone.
const SEVERITY_ICON = {
  normal: CircleCheck,
  warning: TriangleAlert,
  critical: OctagonAlert,
  unavailable: CircleHelp,
} as const;

export function SeverityIcon({ severity }: { severity: AssessmentSeverity }) {
  const Icon = SEVERITY_ICON[severity] ?? CircleHelp;
  return <Icon className="mr-1 h-3.5 w-3.5" aria-hidden="true" />;
}

/** A WARNING / CRITICAL label for alerts and recommendations. */
export function SeverityBadge({ severity }: { severity: string }) {
  const known = severity === 'normal' || severity === 'warning' || severity === 'critical' ? severity : 'unavailable';
  return <Badge variant={severityVariant(known)}><SeverityIcon severity={known} />{severity.toUpperCase()}</Badge>;
}

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
  return <Badge variant={severityVariant(severity)}><SeverityIcon severity={severity} />{SEVERITY_LABEL[severity].toUpperCase()}</Badge>;
}

export function DraftThresholdsBadge({ draft }: { draft: boolean }) {
  if (!draft) return null;
  return (
    <span title="Some configuration remains marked draft in the application. Saved user limits still apply; draft recommendation rules are not activated.">
      <Badge variant="info">Draft configuration</Badge>
    </span>
  );
}

export function ParameterStatusBadge({ item }: { item: ParameterAssessment }) {
  if (item.parameter === 'turbidity' && item.notMonitored && (item.value === 'Clear' || item.value === 'Cloudy')) return <Badge variant="info">{item.value}</Badge>;
  if (item.notMonitored) return <Badge variant="info">{item.value === 'Not installed' ? 'Not installed' : 'Not monitored'}</Badge>;
  if (item.severity === 'unavailable' && item.message.startsWith('Unavailable: sensor fault')) {
    return <Badge variant="warning">Sensor error</Badge>;
  }
  return <Badge variant={severityVariant(item.severity)}><SeverityIcon severity={item.severity} />{SEVERITY_LABEL[item.severity]}</Badge>;
}
