import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const STORAGE_PREFIX = 'smartaqua.selectedAquarium.v1';

type SelectedAquariumContextValue = {
  selectedAquariumId: string;
  selectionReady: boolean;
  setSelectedAquariumId: (aquariumId: string) => void;
};

const SelectedAquariumContext = createContext<SelectedAquariumContextValue | null>(null);

type SelectedAquariumProviderProps = {
  userId: string | null;
  children: ReactNode;
};

export function SelectedAquariumProvider({ userId, children }: SelectedAquariumProviderProps) {
  const [selectedAquariumId, setSelectedAquariumIdState] = useState('');
  const [selectionReady, setSelectionReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadSelection() {
      setSelectionReady(false);

      if (!userId) {
        setSelectedAquariumIdState('');
        setSelectionReady(true);
        return;
      }

      const storageKey = `${STORAGE_PREFIX}.${userId}`;
      const savedAquariumId = await AsyncStorage.getItem(storageKey);

      if (cancelled) {
        return;
      }

      setSelectedAquariumIdState(savedAquariumId || '');
      setSelectionReady(true);
    }

    void loadSelection();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setSelectedAquariumId = useCallback(
    (aquariumId: string) => {
      setSelectedAquariumIdState(aquariumId);

      if (!userId) {
        return;
      }

      const storageKey = `${STORAGE_PREFIX}.${userId}`;

      if (!aquariumId) {
        void AsyncStorage.removeItem(storageKey);
        return;
      }

      void AsyncStorage.setItem(storageKey, aquariumId);
    },
    [userId]
  );

  const value = useMemo(
    () => ({
      selectedAquariumId,
      selectionReady,
      setSelectedAquariumId,
    }),
    [selectedAquariumId, selectionReady, setSelectedAquariumId]
  );

  return <SelectedAquariumContext.Provider value={value}>{children}</SelectedAquariumContext.Provider>;
}

export function useSelectedAquariumSelection() {
  const context = useContext(SelectedAquariumContext);

  if (!context) {
    throw new Error('useSelectedAquariumSelection must be used within SelectedAquariumProvider.');
  }

  return context;
}
