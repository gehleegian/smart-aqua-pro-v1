import { Building2 } from 'lucide-react';
import { useOrg } from '../../hooks/useOrg';

/** Org name, plus a switcher when the user belongs to more than one org. */
export default function OrgSwitcher() {
  const { memberships, active, switchOrg } = useOrg();
  if (!active) return null;

  if (memberships.length === 1) {
    return (
      <div className="hidden max-w-48 items-center gap-2 truncate rounded-lg border border-slate-600/40 bg-slate-950/25 px-3 py-1.5 text-xs text-slate-200 lg:flex" title={active.org.name}>
        <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-teal-300" aria-hidden="true" />
        <span className="truncate">{active.org.name}</span>
      </div>
    );
  }

  return (
    <label className="flex items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-950/25 px-2 py-1 text-xs text-slate-200">
      <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-teal-300" aria-hidden="true" />
      <span className="sr-only">Organization</span>
      <select
        value={active.orgId}
        onChange={(event) => switchOrg(event.target.value)}
        className="max-w-40 bg-transparent py-1 text-xs text-slate-100 focus:outline-none"
      >
        {memberships.map((membership) => (
          <option key={membership.orgId} value={membership.orgId} className="bg-slate-900">
            {membership.org.name} ({membership.role === 'owner' ? 'Owner' : 'Caretaker'})
          </option>
        ))}
      </select>
    </label>
  );
}
