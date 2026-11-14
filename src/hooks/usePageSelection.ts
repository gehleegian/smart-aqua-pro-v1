import { useEffect, useState } from 'react';
import { auth } from '../firebase';
import { getActiveMembership } from '../services/orgContext';
import { readPageSelection, savePageSelection } from '../services/pageSelection';

/** Layout remounts pages on user/org/role changes. Never stores readings or form drafts. */
export function usePageSelection(page: string, field: string, fallback = '', initialHint?: () => string) {
  const member = getActiveMembership();
  const scope = `${auth.currentUser?.uid ?? 'signed-out'}:${member?.orgId ?? 'platform'}:${member?.role ?? ''}:${page}`;
  const [value, setValue] = useState(() => initialHint?.() || readPageSelection(scope, field, fallback));
  useEffect(() => { savePageSelection(scope, field, value); }, [scope, field, value]);
  return [value, setValue] as const;
}
