import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';

// FR13 admin side (Sprint 4). Reads the raw `rules` / `species` documents (any
// signed-in member may read them); writes only through the audited callables.
export type RawConfigDoc = { id: string; data: Record<string, unknown> };

export async function loadRawRuleConfig() {
  const [rules, species] = await Promise.all([getDocs(collection(db, 'rules')), getDocs(collection(db, 'species'))]);
  const map = (snapshot: typeof rules) => snapshot.docs.map((doc) => ({ id: doc.id, data: doc.data() })).sort((a, b) => a.id.localeCompare(b.id));
  return { rules: map(rules), species: map(species) };
}

export async function saveRuleConfig(kind: 'rule' | 'species', id: string, data: Record<string, unknown>) {
  return (await httpsCallable<unknown, { changed: boolean; status: string }>(functions, 'saveRuleConfig')({ kind, id, data })).data;
}

export async function approveRuleConfig(kind: 'rule' | 'species', id: string) {
  return (await httpsCallable<unknown, { changed: boolean }>(functions, 'approveRuleConfig')({ kind, id })).data;
}

/** The editable content of a stored doc (approval fields are server-managed). */
export function editableContent(data: Record<string, unknown>) {
  const { status: _status, approvedBy: _by, approvedAt: _at, updatedAt: _updated, updatedBy: _updatedBy, ...rest } = data;
  void _status; void _by; void _at; void _updated; void _updatedBy;
  return rest;
}
