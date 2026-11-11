import {
  CONDITION_SUMMARY_MAX_AGE_MS,
  assessmentConfigurationKey,
  computeBioload,
  evaluateAquarium,
  resolveLiveAquariumThresholds,
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
  return resolveLiveAquariumThresholds(aquarium, species);
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
  // Species bioload/cleaning bands and recommendation rules retain approval gating.
  // Saved numeric limits are resolved independently below.
  const species = configuredSpecies?.status === 'approved' ? configuredSpecies : null;
  // Saved limits classify this aquarium independently of recommendation approval.
  const thresholds = resolveLiveAquariumThresholds(aquarium, configuredSpecies);
  const approvedRules = ruleConfig.rules.filter((rule) => rule.enabled && rule.status === 'approved');
  const bioloadLevel = serverBioload ?? computeBioload(aquarium, species?.bioloadBandsGPerL)?.level ?? null;
  const result = evaluateAquarium(reading ? withWaterLevelProfile(aquarium, reading) : null, thresholds, approvedRules, {
    hasFiltrationSystem: aquarium.hasFiltrationSystem,
    fishCount: aquarium.fishCount,
    bioloadLevel,
  });
  return { ...result, draft: result.draft || !ruleSetApproved };
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
  const thresholds = getEffectiveThresholds(options.aquarium, options.ruleConfig);
  if (source === 'live' && condition && now - condition.evaluatedAt <= CONDITION_SUMMARY_MAX_AGE_MS &&
      thresholds && condition.configurationKey === assessmentConfigurationKey(thresholds, options.ruleConfig!.rules) &&
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
    ? ['Saved user limits are used for classification. Recommendation-rule activation requires approved application metadata.']
    : [];
  return {
    ...toConditionAssessment(result, { source, assessedAt: now, origin: 'client', notes: approvalNote }),
    overallSeverity: result.overall,
  };
}
