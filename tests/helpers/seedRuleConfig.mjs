import { readFileSync } from 'node:fs';
import { normalizeRuleConfig, normalizeSpeciesConfig } from '../../src/utils/monitoringAssessmentCore.ts';

// The DRAFT goldfish seed (scripts/seed/goldfish-draft.json) as the client's
// RuleConfigSnapshot, so app-level tests use the same data the emulator is seeded with.
export const seed = JSON.parse(readFileSync(new URL('../../scripts/seed/goldfish-draft.json', import.meta.url), 'utf8'));

export function seedRuleConfig(options = {}) {
  const approve = data => options.approved ? {
    ...data,
    status: 'approved',
    source: 'TEST_FIXTURE_ONLY',
    approvedBy: 'automated-test',
    approvedAt: 1,
  } : data;
  return {
    speciesById: Object.fromEntries(
      Object.entries(seed.species).map(([id, data]) => [id, normalizeSpeciesConfig(id, approve(data))])
    ),
    rules: Object.entries(seed.rules).map(([id, data]) => normalizeRuleConfig(id, approve(data))),
    loaded: true,
    error: '',
  };
}
