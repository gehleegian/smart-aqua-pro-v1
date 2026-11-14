import { CircleHelp, TriangleAlert } from 'lucide-react';
import type { MonitoringAquarium, MonitoringParameter, ParameterAssessment } from '../../types/monitoring';
import type { EffectiveThresholds, WaterParameter } from '../../utils/monitoringAssessmentCore';
import { ParameterStatusBadge } from '../condition/ConditionBadges';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

const WATER_KEYS: Partial<Record<MonitoringParameter, WaterParameter>> = {
  temperature: 'temperatureC', waterLevel: 'waterLevelPercent', ph: 'ph', tds: 'tdsPpm', turbidity: 'turbidity',
};
const SENSOR_LABELS = { temperature: 'Temperature', waterLevel: 'Water level', ph: 'pH', tds: 'TDS', turbidity: 'Turbidity' };

/** Presentation only: reuse the assessment, never classify readings or invent thresholds. */
export function monitoringAttention(aquarium: MonitoringAquarium) {
  const live = aquarium.hasFreshTelemetry && aquarium.telemetryState === 'live' && aquarium.telemetrySource === 'live' && aquarium.assessment.source === 'live';
  const faults = live ? Object.entries(aquarium.sensorValidity || {}).flatMap(([parameter, validity]) => {
    if (parameter === 'allValid' || typeof validity !== 'object' || validity?.status !== 'invalid') return [];
    return [{ parameter, label: SENSOR_LABELS[parameter as keyof typeof SENSOR_LABELS] || parameter,
      message: validity.reason || 'The device reported an invalid sample. Check this sensor before interpreting its reading.' }];
  }) : [];
  const findings = live ? (aquarium.assessment.parameters || []).filter(item => {
    if (item.notMonitored || item.value === null || (item.severity !== 'warning' && item.severity !== 'critical')) return false;
    if (WATER_KEYS[item.parameter] && aquarium.sensorValidity?.[item.parameter as keyof typeof SENSOR_LABELS]?.status !== 'valid') return false;
    return true;
  }).sort((a, b) => Number(b.severity === 'critical') - Number(a.severity === 'critical')) : [];
  return { live, findings, faults, severity: findings.some(item => item.severity === 'critical') ? 'critical' : 'warning' };
}
export type MonitoringAttentionState = ReturnType<typeof monitoringAttention>;

export function MonitoringAttentionBanner({ aquarium, attention, onRecommendations, onAssessment }: {
  aquarium: MonitoringAquarium; attention: MonitoringAttentionState; onRecommendations: () => void; onAssessment: () => void;
}) {
  if (!attention.live) return <div role="status" className="rounded-lg border border-slate-600/40 bg-slate-800/35 p-4 text-sm text-slate-200">
    {aquarium.telemetryState === 'offline' ? 'Device offline.' : 'Fresh monitoring data is unavailable.'} Current water conditions cannot be confirmed. This is a connection/data issue, not evidence of a water problem.
  </div>;
  if (!attention.findings.length && !attention.faults.length) {
    return aquarium.assessment.overallSeverity === 'unavailable' ? <p role="status" className="text-sm text-slate-300">Assessment unavailable. Wait for the current configuration and assessment to load.</p> : null;
  }
  const hasFindings = attention.findings.length > 0;
  const critical = hasFindings && attention.severity === 'critical';
  return <section role="status" aria-live="polite" aria-label="Monitoring attention notice"
    className={`flex flex-wrap items-start justify-between gap-4 rounded-xl border p-4 ${critical ? 'border-rose-400/45 bg-rose-500/10 text-rose-100' : 'border-amber-400/40 bg-amber-400/10 text-amber-100'}`}>
    <div className="flex min-w-0 flex-1 items-start gap-3">
      {hasFindings ? <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" /> : <CircleHelp className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />}
      <div>
        <p className="font-semibold">{hasFindings ? critical ? 'Critical condition detected' : 'Warning: this aquarium needs attention' : 'Sensor check needed'}</p>
        <p className="mt-1 text-sm">{hasFindings
          ? critical ? 'Review the affected readings below. Check Recommendations for recommended actions.' : 'Some readings need attention. Check Recommendations for guidance on what to do next.'
          : 'One or more sensor samples are invalid. Review the assessment before interpreting these readings as water conditions.'}</p>
        {hasFindings && attention.faults.length > 0 && <p className="mt-1 text-sm">Sensor issues are listed separately below.</p>}
      </div>
    </div>
    <Button variant="secondary" onClick={hasFindings ? onRecommendations : onAssessment}>{hasFindings ? 'Check Recommendations' : 'Check Assessment'}</Button>
  </section>;
}

function configuredRange(item: ParameterAssessment, thresholds?: EffectiveThresholds | null) {
  if (typeof item.value !== 'number') return ''; // Categorical states are not numeric ranges or invented NTU.
  const key = WATER_KEYS[item.parameter];
  const range = key ? thresholds?.values[key] : undefined;
  if (!range) return key ? 'Configured limits unavailable.' : '';
  const unit = item.unit === '%' ? '%' : item.unit ? ` ${item.unit}` : '';
  if (range.min !== undefined && range.max !== undefined) return `Configured range: ${range.min}${unit} to ${range.max}${unit}.`;
  if (range.min !== undefined) return `Configured minimum: ${range.min}${unit}.`;
  if (range.max !== undefined) return `Configured maximum: ${range.max}${unit}.`;
  return 'Configured limits unavailable.';
}

export function MonitoringProblemSummary({ attention, thresholds }: { attention: MonitoringAttentionState; thresholds?: EffectiveThresholds | null }) {
  if (!attention.live || (!attention.findings.length && !attention.faults.length)) return null;
  return <div className="space-y-4">
    {attention.findings.length > 0 && <Card>
      <CardHeader><h3 className="font-semibold text-white">Readings needing attention</h3><p className="mt-1 text-xs text-slate-400">Current assessment findings, with critical conditions first. Check Recommendations for available approved guidance.</p></CardHeader>
      <CardContent><ul className="space-y-3">{attention.findings.map(item => <li key={item.parameter} className="rounded-lg border border-slate-600/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium text-white">{item.label}</p><ParameterStatusBadge item={item} /></div>
        <p className="mt-1 text-sm text-slate-200">Assessed value: {item.value}{typeof item.value === 'number' && item.unit ? `${item.unit === '%' ? '' : ' '}${item.unit}` : ''}</p>
        {configuredRange(item, thresholds) && <p className="mt-1 text-xs text-slate-300">{configuredRange(item, thresholds)}</p>}
        <p className="mt-1 text-sm text-slate-300">{item.message}</p>
      </li>)}</ul></CardContent>
    </Card>}
    {attention.faults.length > 0 && <Card>
      <CardHeader><h3 className="font-semibold text-white">Sensor checks needed</h3><p className="mt-1 text-xs text-slate-400">Invalid samples are not classified as water-condition problems.</p></CardHeader>
      <CardContent><ul className="space-y-2">{attention.faults.map(fault => <li key={fault.parameter} className="rounded-lg border border-amber-400/25 p-3 text-sm">
        <p className="font-medium text-amber-200">{fault.label}: sensor check needed</p><p className="mt-1 text-slate-300">{fault.message}</p>
      </li>)}</ul></CardContent>
    </Card>}
  </div>;
}
