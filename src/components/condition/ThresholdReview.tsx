import Badge from '../ui/Badge';
import {
  PARAMETER_LABELS,
  WATER_PARAMETERS,
  readAquariumOverrides,
  resolveThresholds,
  type RangeThreshold,
  type SpeciesConfig,
} from '../../utils/monitoringAssessmentCore';

function formatRange(range: RangeThreshold | undefined, unit?: string) {
  if (!range) return 'Not set';
  const suffix = unit ? ` ${unit}` : '';
  if (range.min !== undefined && range.max !== undefined) return `${range.min}–${range.max}${suffix}`;
  if (range.min !== undefined) return `≥ ${range.min}${suffix}`;
  if (range.max !== undefined) return `≤ ${range.max}${suffix}`;
  return 'Not set';
}

function sameRange(left: RangeThreshold | undefined, right: RangeThreshold | undefined) {
  return left?.min === right?.min && left?.max === right?.max;
}

/**
 * Effective thresholds for an aquarium: species defaults, with the owner's
 * limits as overrides (Sprint 2 engine). A "Custom" badge marks every value
 * that differs from the species default. Only an Owner can change them.
 */
export default function ThresholdReview({
  species,
  aquarium,
}: {
  species: SpeciesConfig | null;
  aquarium: Record<string, unknown>;
}) {
  const defaults = resolveThresholds(species);
  const effective = resolveThresholds(species, readAquariumOverrides(aquarium));

  return (
    <div className="space-y-3">
      {effective.status !== 'approved' && (
        <p className="text-xs text-amber-300">Draft thresholds: pending adviser sign-off (docs/rule-matrix.md).</p>
      )}
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-400">
          <tr>
            <th className="py-2 font-medium">Parameter</th>
            <th className="py-2 font-medium">Species default</th>
            <th className="py-2 font-medium">This aquarium</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-700/40">
          {WATER_PARAMETERS.map((parameter) => {
            const { label, unit } = PARAMETER_LABELS[parameter];
            const custom = !sameRange(defaults.values[parameter], effective.values[parameter]);
            return (
              <tr key={parameter}>
                <td className="py-2 text-slate-200">{label}</td>
                <td className="py-2 text-slate-400">{formatRange(defaults.values[parameter], unit)}</td>
                <td className="py-2 text-slate-100">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatRange(effective.values[parameter], unit)}
                    {custom && <Badge variant="info">Custom</Badge>}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
