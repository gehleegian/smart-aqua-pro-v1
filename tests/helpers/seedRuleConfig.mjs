import { readFileSync } from 'node:fs';
import { normalizeRuleConfig, normalizeSpeciesConfig } from '../../src/utils/monitoringAssessmentCore.ts';

// The DRAFT goldfish seed (scripts/seed/goldfish-draft.json) as the client's
// RuleConfigSnapshot, so app-level tests use the same data the emulator is seeded with.
export const seed = JSON.parse(readFileSync(new URL('../../scripts/seed/goldfish-draft.json', import.meta.url), 'utf8'));

export function seedRuleConfig() {
  return {
    speciesById: Object.fromEntries(
      Object.entries(seed.species).map(([id, data]) => [id, normalizeSpeciesConfig(id, data)])
    ),
    rules: Object.entries(seed.rules).map(([id, data]) => normalizeRuleConfig(id, data)),
    loaded: true,
    error: '',
  };
}
