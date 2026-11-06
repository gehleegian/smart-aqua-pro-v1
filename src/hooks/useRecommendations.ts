import { useEffect, useState } from 'react';
import { subscribeToRecommendations, updateRecommendationStatus } from '../services/recommendationsService';
import type { Recommendation } from '../types/recommendation';

export function useRecommendations(aquariumId: string | null) {
  const [state, setState] = useState<{ aquariumId: string | null; items: Recommendation[]; error: string }>({
    aquariumId: null,
    items: [],
    error: '',
  });
  const [savingId, setSavingId] = useState('');
  const [actionError, setActionError] = useState('');

  useEffect(() => {
    if (!aquariumId) return;
    return subscribeToRecommendations(
      aquariumId,
      (items) => setState({ aquariumId, items, error: '' }),
      (error) => setState({ aquariumId, items: [], error: `Recommendations are unavailable (${error.message}).` })
    );
  }, [aquariumId]);

  const current = state.aquariumId === aquariumId ? state : { items: [], error: '' };

  const setStatus = async (id: string, status: 'applied' | 'dismissed') => {
    setSavingId(id);
    setActionError('');
    try {
      await updateRecommendationStatus(id, status);
    } catch (error) {
      console.error(error);
      setActionError('Could not update the recommendation. Please try again.');
    } finally {
      setSavingId('');
    }
  };

  return { recommendations: current.items, error: current.error || actionError, savingId, setStatus };
}
