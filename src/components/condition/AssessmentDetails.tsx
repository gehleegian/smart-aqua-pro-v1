import type { AquariumConditionAssessment } from '../../types/monitoring';
import { Card, CardContent, CardHeader } from '../ui/Card';
import { DraftThresholdsBadge, OverallConditionBadge, ParameterStatusBadge } from './ConditionBadges';

/** Detailed, read-only presentation of the existing assessment result. */
export function AssessmentDetails({ assessment }: { assessment: AquariumConditionAssessment }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Condition Assessment</h3>
            <p className="mt-1 text-sm text-slate-400">
              Rule-based assessment ({assessment.ruleVersion}). Guidance only; maintenance actions require your review.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <DraftThresholdsBadge draft={assessment.draft} />
            <OverallConditionBadge severity={assessment.overallSeverity} />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {assessment.parameters.length === 0 ? (
          <p className="text-sm text-slate-400">No parameters assessed yet. Valid readings are needed before an aquarium condition can be evaluated.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {assessment.parameters.map((item) => (
              <div key={item.parameter} className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-white">{item.label}</p>
                  <ParameterStatusBadge item={item} />
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-400">{item.message}</p>
              </div>
            ))}
          </div>
        )}
        <details className="mt-4 text-sm text-slate-400">
          <summary className="cursor-pointer">Assessment limits and calibration</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {assessment.ruleNotes.map((note) => <li key={note}>{note}</li>)}
          </ul>
        </details>
        {assessment.recommendations.length > 0 ? (
          <div className="mt-4 rounded-lg border border-slate-600/20 bg-slate-950/35 p-4">
            <p className="text-sm font-medium text-white">Maintenance recommendations</p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-slate-300">
              {assessment.recommendations.map((recommendation) => <li key={recommendation}>{recommendation}</li>)}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
