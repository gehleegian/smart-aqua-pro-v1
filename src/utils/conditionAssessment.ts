import {
  CONDITION_SUMMARY_MAX_AGE_MS,
  computeBioload,
  evaluateAquarium,
  readAquariumOverrides,
  resolveThresholds,
  selectSpeciesConfig,
  toConditionAssessment,
  type AquariumConditionAssessment,
  type EffectiveThresholds,
  type EngineResult,
  type TelemetrySource,
} from './monitoringAssessmentCore.ts';
import type { AquariumEngineState, RuleConfigSnapshot } from '../services/ruleConfigService';
import { withWaterLevelProfile, waterLevelSummaryMatches } from './waterLevelProfile.ts';

type AquariumLike = {
  species?: unknown;
  speciesId?: unknown;
  hasFiltrationSystem?: boolean;
  fishCount?: number;
  fishWeightsG?: number[];
  workingWaterVolumeLiters?: number;
} & Record<string, unknown>;

export function getEffectiveThresholds(aquarium: AquariumLike, ruleConfig: RuleConfigSnapshot | null): EffectiveThresholds | null {
  if (!ruleConfig?.loaded) return null;
  const species = selectSpeciesConfig(aquarium, ruleConfig.speciesById);
  return resolveThresholds(species, readAquariumOverrides(aquarium));
}

/**
 * Parameters whose effective range differs from the species default (the
 * owner changed it). The UI marks these "Custom"; only an owner can edit them.
 */
export function getCustomThresholdKeys(thresholds: EffectiveThresholds | null, aquarium: AquariumLike, ruleConfig: RuleConfigSnapshot | null): string[] {
  if (!thresholds || !ruleConfig?.loaded) return [];
  const defaults = resolveThresholds(selectSpeciesConfig(aquarium, ruleConfig.speciesById)).values;
  return thresholds.overridden.filter((key) => {
    const base = defaults[key];
    const value = thresholds.values[key];
    return base?.min !== value?.min || base?.max !== value?.max;
  });
}

/** Browser-side evaluation with the same engine and the Firestore rules (fallback, simulator, history rows). */
export function evaluateAquariumReading(
  aquarium: AquariumLike,
  reading: Record<string, unknown> | null,
  ruleConfig: RuleConfigSnapshot | null,
  serverBioload: AquariumEngineState['bioloadLevel'] = null
): EngineResult | null {
  if (!ruleConfig?.loaded) return null;
  const configuredSpecies = selectSpeciesConfig(aquarium, ruleConfig.speciesById);
  const enabledRules = ruleConfig.rules.filter((rule) => rule.enabled);
  const ruleSetApproved = enabledRules.length > 0 && enabledRules.every((rule) => rule.status === 'approved');
  // Draft configuration remains available to the Rules Editor preview, but it
  // must never activate a user-facing assessment or recommendation.
  const species = configuredSpecies?.status === 'approved' && ruleSetApproved ? configuredSpecies : null;
  // Aquarium profile limits/overrides do not currently carry approval metadata.
  // Keep them available to the editor preview above, but do not silently make
  // them authoritative in a live assessment.
  const thresholds = resolveThresholds(species);
  const approvedRules = ruleSetApproved ? ruleConfig.rules.filter((rule) => rule.status === 'approved') : [];
  const bioloadLevel = serverBioload ?? computeBioload(aquarium, species?.bioloadBandsGPerL)?.level ?? null;
  return evaluateAquarium(reading ? withWaterLevelProfile(aquarium, reading) : null, thresholds, approvedRules, {
    hasFiltrationSystem: aquarium.hasFiltrationSystem,
    fishCount: aquarium.fishCount,
    bioloadLevel,
  });
}

const UNAVAILABLE = { overall: 'unavailable' as const, perParameter: [], faults: [], draft: false };

/**
 * The condition the dashboard shows. Preference order:
 * 1. the server summary on the aquarium doc (written by the ingest function) while fresh;
 * 2. the same engine run in the browser on the live reading (fallback until the function runs);
 * 3. unavailable.
 */
export function assessAquarium(options: {
  aquarium: AquariumLike;
  reading: Record<string, unknown> | null;
  source: TelemetrySource;
  now: number;
  ruleConfig: RuleConfigSnapshot | null;
  engineState?: AquariumEngineState | null;
}): AquariumConditionAssessment {
  const { source, now } = options;
  if (source === 'unavailable' || !options.reading) {
    return toConditionAssessment(UNAVAILABLE, { source: 'unavailable', assessedAt: now, origin: 'none' });
  }
  const condition = options.engineState?.condition;
  if (source === 'live' && condition && now - condition.evaluatedAt <= CONDITION_SUMMARY_MAX_AGE_MS &&
      waterLevelSummaryMatches(options.aquarium, options.reading, condition)) {
    return toConditionAssessment(condition, { source, assessedAt: condition.evaluatedAt, origin: 'server' });
  }
  const result = evaluateAquariumReading(options.aquarium, options.reading, options.ruleConfig, options.engineState?.bioloadLevel ?? null);
  if (!result) {
    return toConditionAssessment(UNAVAILABLE, {
      source,
      assessedAt: now,
      origin: 'none',
      notes: [options.ruleConfig?.error || 'Thresholds and rules have not loaded from Firestore yet.'],
    });
  }
  const approvalNote = result.draft
    ? ['No live classification or maintenance recommendation is activated until the applicable thresholds and rules are approved.']
    : [];
  return {
    ...toConditionAssessment(result, { source, assessedAt: now, origin: 'client', notes: approvalNote }),
    overallSeverity: result.overall,
  };
}
