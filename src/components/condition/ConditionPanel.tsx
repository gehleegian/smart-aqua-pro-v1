import type { AquariumConditionAssessment } from '../../types/monitoring';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { DraftThresholdsBadge, OverallConditionBadge, ParameterStatusBadge } from './ConditionBadges';

const ORIGIN_TEXT = {
  server: 'Evaluated by the SmartAqua rules engine',
  client: 'Evaluated in your browser with the same rules (server summary not available yet)',
  none: 'No live reading to evaluate',
} as const;

export function ConditionPanel({ assessment }: { assessment: AquariumConditionAssessment }) {
  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">Condition</h3>
          <p className="mt-1 text-xs text-slate-400">{ORIGIN_TEXT[assessment.origin]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DraftThresholdsBadge draft={assessment.draft} />
          <OverallConditionBadge severity={assessment.overallSeverity} />
        </div>
      </CardHeader>
      <CardContent>
        {assessment.parameters.length === 0 ? (
          <p className="text-sm text-slate-400">{assessment.ruleNotes.find((note) => !note.startsWith('Thresholds and rules are DRAFT')) || 'No parameters assessed yet.'}</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {assessment.parameters.map((item) => (
              <li key={item.parameter} className="flex items-start justify-between gap-3 rounded-lg border border-slate-600/20 bg-slate-900/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <p className="mt-0.5 text-xs leading-5 text-slate-400">{item.message}</p>
                </div>
                <ParameterStatusBadge item={item} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
