import { collection, doc, limit, onSnapshot, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Recommendation, RecommendationStatus } from '../types/recommendation';

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback;
}

export function mapRecommendation(id: string, data: Record<string, unknown>): Recommendation {
  const status = data.status;
  return {
    id,
    aquariumId: readString(data.aquariumId),
    ruleId: readString(data.ruleId),
    parameter: readString(data.parameter),
    severity: data.severity === 'critical' ? 'critical' : 'warning',
    title: readString(data.title, readString(data.ruleId)),
    issueDetected: readString(data.issueDetected),
    action: readString(data.action),
    basis: readString(data.basis),
    preCheck: readString(data.preCheck),
    ruleStatus: data.ruleStatus === 'approved' ? 'approved' : 'draft',
    alertId: typeof data.alertId === 'string' ? data.alertId : null,
    status: status === 'applied' || status === 'resolved' || status === 'dismissed' ? status : 'pending',
    createdAt: readNumber(data.createdAt) ?? 0,
    resolvedAt: readNumber(data.resolvedAt),
    resolvedBy: typeof data.resolvedBy === 'string' ? data.resolvedBy : null,
  };
}

const RECOMMENDATION_LIMIT = 50;

// Recommendations are created only by the Cloud Functions (rules engine).
export function subscribeToRecommendations(
  aquariumId: string,
  onChange: (recommendations: Recommendation[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    query(
      collection(db, 'recommendations'),
      where('aquariumId', '==', aquariumId),
      orderBy('createdAt', 'desc'),
      limit(RECOMMENDATION_LIMIT)
    ),
    (snapshot) => onChange(snapshot.docs.map((item) => mapRecommendation(item.id, item.data()))),
    (error) => {
      console.error(error);
      onError?.(error);
    }
  );
}

// Users may only move a pending recommendation to applied or dismissed
// (Firestore rules enforce the fields and transition). Logging the
// maintenance action itself is Sprint 4.
export async function updateRecommendationStatus(
  recommendationId: string,
  status: Extract<RecommendationStatus, 'applied' | 'dismissed'>
) {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('You must be signed in.');
  await updateDoc(doc(db, 'recommendations', recommendationId), {
    status,
    resolvedAt: Date.now(),
    resolvedBy: uid,
  });
}
