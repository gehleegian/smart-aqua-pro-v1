import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import {
  BIOLOAD_LEVELS,
  normalizeRuleConfig,
  normalizeSpeciesConfig,
  type BioloadLevel,
  type CleaningSummary,
  type ConditionSummary,
  type RuleConfig,
  type SpeciesConfig,
} from '../utils/monitoringAssessmentCore';

export type RuleConfigSnapshot = {
  speciesById: Record<string, SpeciesConfig>;
  rules: RuleConfig[];
  /** Both collections have loaded at least once. */
  loaded: boolean;
  error: string;
};

export const emptyRuleConfig: RuleConfigSnapshot = { speciesById: {}, rules: [], loaded: false, error: '' };

// Thresholds and rules are data (Firestore `species` and `rules`, written by
// scripts/seed-rules.ts or an admin). The app never hard-codes them.
export function subscribeToRuleConfig(onChange: (snapshot: RuleConfigSnapshot) => void) {
  let speciesById: Record<string, SpeciesConfig> | null = null;
  let rules: RuleConfig[] | null = null;
  let error = '';
  const emit = () => onChange({
    speciesById: speciesById ?? {},
    rules: rules ?? [],
    loaded: speciesById !== null && rules !== null,
    error,
  });
  const fail = (label: string) => (subscriptionError: Error) => {
    console.error(subscriptionError);
    error = `Could not load ${label}: ${subscriptionError.message}`;
    emit();
  };
  const unsubscribeSpecies = onSnapshot(collection(db, 'species'), (snapshot) => {
    speciesById = {};
    for (const item of snapshot.docs) {
      const config = normalizeSpeciesConfig(item.id, item.data());
      if (config) speciesById[item.id] = config;
    }
    emit();
  }, fail('species thresholds'));
  const unsubscribeRules = onSnapshot(collection(db, 'rules'), (snapshot) => {
    rules = snapshot.docs.flatMap((item) => {
      const rule = normalizeRuleConfig(item.id, item.data());
      return rule ? [rule] : [];
    });
    emit();
  }, fail('rules'));
  return () => {
    unsubscribeSpecies();
    unsubscribeRules();
  };
}

export type AquariumEngineState = {
  condition: ConditionSummary | null;
  cleaning: CleaningSummary | null;
  bioloadLevel: BioloadLevel | null;
};

export const emptyAquariumEngineState: AquariumEngineState = { condition: null, cleaning: null, bioloadLevel: null };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function readAquariumEngineState(data: Record<string, unknown> | undefined): AquariumEngineState {
  const condition = isRecord(data?.condition) && Array.isArray(data.condition.perParameter) &&
    typeof data.condition.evaluatedAt === 'number'
    ? { matchedRules: [], faults: [], ...data.condition } as unknown as ConditionSummary
    : null;
  const cleaning = isRecord(data?.cleaning) && typeof data.cleaning.evaluatedAt === 'number'
    ? data.cleaning as CleaningSummary
    : null;
  const bioloadLevel = BIOLOAD_LEVELS.includes(data?.bioloadLevel as BioloadLevel) ? data!.bioloadLevel as BioloadLevel : null;
  return { condition, cleaning, bioloadLevel };
}

// The ingest function writes `condition` (and `cleaning`, `bioloadLevel`) onto
// the aquarium doc; the dashboard listens to it instead of recomputing.
export function subscribeToAquariumEngineState(
  aquariumId: string,
  onChange: (state: AquariumEngineState) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    doc(db, 'aquariums', aquariumId),
    (snapshot) => onChange(readAquariumEngineState(snapshot.data())),
    (error) => {
      console.error(error);
      onError?.(error);
    }
  );
}
