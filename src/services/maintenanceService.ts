import { collection, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// FR20. Written only by the logMaintenance callable (owners and assigned
// caretakers); members of the tank read maintenance_actions (Firestore rules).
export const MAINTENANCE_TYPES = [
  { id: 'water_change', label: 'Water change' },
  { id: 'filter_clean', label: 'Filter cleaning' },
  { id: 'tank_cleaning', label: 'Tank cleaning' },
  { id: 'feeding_adjustment', label: 'Feeding adjustment' },
  { id: 'equipment_check', label: 'Equipment check' },
  { id: 'other', label: 'Other' },
] as const;
export type MaintenanceType = (typeof MAINTENANCE_TYPES)[number]['id'];
export const CYCLE_RESET_WATER_CHANGE_PCT = 25;

export function maintenanceLabel(type: string) {
  return MAINTENANCE_TYPES.find((item) => item.id === type)?.label ?? (type === 'cleaning' ? 'Cleaning' : type);
}

export type MaintenanceEntry = {
  id: string;
  type: string;
  waterChangePercent: number | null;
  notes: string;
  performedAt: number;
  performedByName: string;
  performedByRole: string | null;
  recommendationId: string | null;
  ruleId: string | null;
  resetsCleaningCycle: boolean;
};

export type LogMaintenanceRequest = {
  aquariumId: string;
  type: MaintenanceType;
  waterChangePercent?: number | null;
  notes?: string;
  performedAt: number;
  recommendationId?: string | null;
};

export async function logMaintenance(request: LogMaintenanceRequest) {
  const call = httpsCallable<LogMaintenanceRequest, { id: string; resetsCleaningCycle: boolean; recommendationApplied: boolean }>(functions, 'logMaintenance');
  return (await call(request)).data;
}

export function subscribeToMaintenance(aquariumId: string, onChange: (entries: MaintenanceEntry[]) => void, onError?: (error: Error) => void) {
  return onSnapshot(
    query(collection(db, 'maintenance_actions'), where('aquariumId', '==', aquariumId), orderBy('performedAt', 'desc'), limit(100)),
    (snapshot) => onChange(snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        // Pre-Sprint 4 rows only have actionType.
        type: typeof data.type === 'string' ? data.type : String(data.actionType ?? 'other'),
        waterChangePercent: typeof data.waterChangePercent === 'number' ? data.waterChangePercent : null,
        notes: typeof data.notes === 'string' ? data.notes : '',
        performedAt: Number(data.performedAt ?? 0),
        performedByName: typeof data.performedByName === 'string' ? data.performedByName : 'Unknown',
        performedByRole: typeof data.performedByRole === 'string' ? data.performedByRole : null,
        recommendationId: typeof data.recommendationId === 'string' ? data.recommendationId : null,
        ruleId: typeof data.ruleId === 'string' ? data.ruleId : null,
        resetsCleaningCycle: data.resetsCleaningCycle === true || data.actionType === 'cleaning',
      };
    })),
    (error) => {
      console.error(error);
      onError?.(error);
    }
  );
}
