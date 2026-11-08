// Regenerate docs/rule-matrix.md from scripts/seed/goldfish-draft.json:
//   node scripts/rule-matrix.mjs > docs/rule-matrix.md
import { readFileSync } from 'node:fs';

const seed = JSON.parse(readFileSync(new URL('./seed/goldfish-draft.json', import.meta.url), 'utf8'));
const g = seed.species.goldfish;
const cell = (text) => String(text ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
const range = (r) => (r ? [r.min !== undefined ? `min ${r.min}` : '', r.max !== undefined ? `max ${r.max}` : ''].filter(Boolean).join(', ') : '—');
const condition = (c) => {
  const target = c.ref ?? JSON.stringify(c.value);
  const margin = c.marginPct ? ` ${c.op.startsWith('g') ? '+' : '−'}${c.marginPct}%` : c.margin ? ` ${c.op.startsWith('g') ? '+' : '−'}${c.margin}` : '';
  return `${c.op} ${target}${margin}`;
};
const order = ['temperatureC', 'ph', 'tdsPpm', 'turbidity', 'waterLevelPercent', 'power', 'equipment', 'filter', 'device', 'maintenance'];
const rules = Object.entries(seed.rules).sort(([ia, a], [ib, b]) =>
  order.indexOf(a.parameter) - order.indexOf(b.parameter) || (a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1) || a.priority - b.priority || ia.localeCompare(ib));

const lines = [
  '# Rule matrix (DRAFT, for adviser sign-off)',
  '',
  'Generated from `scripts/seed/goldfish-draft.json` by `node scripts/rule-matrix.mjs > docs/rule-matrix.md`. Do not edit by hand; edit the JSON and regenerate.',
  '',
  '**Every value below is a DRAFT** taken from common aquarium-keeping ranges. None is cited or approved yet (`status: draft`, `source: TBD`). How to approve: `docs/rule-engine.md` §6.',
  '',
  '## Goldfish thresholds (`species/goldfish`)',
  '',
  '| Parameter | Draft range | Status | Source |',
  '|---|---|---|---|',
  `| Temperature (°C) | ${range(g.ranges.temperatureC)} | ${g.status} | ${g.source} |`,
  `| pH | ${range(g.ranges.ph)} | ${g.status} | ${g.source} |`,
  `| TDS (ppm) | ${range(g.ranges.tdsPpm)} | ${g.status} | ${g.source} |`,
  `| Turbidity (NTU) | ${range(g.ranges.turbidity)} | ${g.status} | ${g.source} |`,
  `| Water level (%) | min ${g.minWaterLevelPercent} | ${g.status} | ${g.source} |`,
  `| Bioload bands (g/L) | light ≤ ${g.bioloadBandsGPerL.lightMax}, moderate ≤ ${g.bioloadBandsGPerL.moderateMax}, heavy above | ${g.status} | ${g.source} |`,
  `| Cleaning interval (days) | light ${g.cleaningIntervalDays.light}, moderate ${g.cleaningIntervalDays.moderate}, heavy ${g.cleaningIntervalDays.heavy} | ${g.status} | ${g.source} |`,
  `| Early cleaning | TDS +${g.earlyCleaning.tdsRisePct}% over the post-cleaning baseline, or turbidity WARNING ${g.earlyCleaning.turbidityWarningCount}× in ${g.earlyCleaning.turbidityWindowHours} h | ${g.status} | ${g.source} |`,
  '',
  '`min`/`max` in a condition mean the aquarium\'s **effective** threshold: the species value above, unless the aquarium overrides it. `+10%` means 10 % of the threshold beyond it (e.g. `gt max +10%` with max 24 °C triggers above 26.4 °C).',
  '',
  `## Rules (${rules.length})`,
  '',
  '| # | Rule ID | Parameter | Condition | Extra checks | Severity | Priority | Action | Basis | Check first | Status | Source |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|',
  ...rules.map(([id, r], i) => `| ${i + 1} | \`${id}\` | ${r.parameter} | \`${condition(r.condition)}\` | ${(r.extraChecks ?? []).map((c) => `\`${c.field} ${c.op} ${c.value}\``).join(', ') || '—'} | ${r.severity} | ${r.priority} | ${cell(r.action)} | ${cell(r.basis)} | ${cell(r.preCheck)} | ${r.status} | ${r.source} |`),
  '',
  '## Sign-off',
  '',
  '| Item | Approved value (if changed) | Citation | Approved by | Date |',
  '|---|---|---|---|---|',
  '| Goldfish thresholds | | | | |',
  '| Bioload bands and cleaning intervals | | | | |',
  ...rules.map(([id]) => `| \`${id}\` | | | | |`),
  '',
];
process.stdout.write(lines.join('\n'));
