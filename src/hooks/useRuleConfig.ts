import { useEffect, useMemo, useState } from 'react';
import {
  emptyRuleConfig,
  subscribeToAquariumEngineState,
  subscribeToRuleConfig,
  type AquariumEngineState,
  type RuleConfigSnapshot,
} from '../services/ruleConfigService';

/** Live `species` + `rules` from Firestore. */
export function useRuleConfig(enabled = true): RuleConfigSnapshot {
  const [config, setConfig] = useState<RuleConfigSnapshot>(emptyRuleConfig);
  useEffect(() => (enabled ? subscribeToRuleConfig(setConfig) : undefined), [enabled]);
  return config;
}

/** Live server condition / cleaning summaries for the given aquariums. */
export function useAquariumEngineStates(aquariumIds: string[]): Record<string, AquariumEngineState> {
  const key = useMemo(() => JSON.stringify([...new Set(aquariumIds)].sort()), [aquariumIds]);
  const [states, setStates] = useState<Record<string, AquariumEngineState>>({});
  useEffect(() => {
    const ids = JSON.parse(key) as string[];
    const unsubscribers = ids.map((id) =>
      subscribeToAquariumEngineState(id, (state) => setStates((prev) => ({ ...prev, [id]: state })))
    );
    return () => {
      for (const unsubscribe of unsubscribers) unsubscribe();
    };
  }, [key]);
  return states;
}
