import type { AquariumOwnerGroup } from '../../types/aquariumManagement';

interface AquariumOwnerSelectorProps {
  ownerGroups: AquariumOwnerGroup[];
  selectedOwnerId: string;
  onSelectOwner: (ownerId: string) => void;
}

export function AquariumOwnerSelector({
  ownerGroups,
  selectedOwnerId,
  onSelectOwner,
}: AquariumOwnerSelectorProps) {
  return (
    <div className="rounded-xl border border-slate-600/35 bg-slate-800/40 p-4 backdrop-blur-sm">
      <label className="mb-2 block text-sm font-medium text-slate-300">Owner</label>
      <select
        value={selectedOwnerId}
        onChange={(event) => onSelectOwner(event.target.value)}
        className="w-full rounded-lg border border-slate-600/50 bg-slate-900/45 px-3 py-2 text-sm text-slate-200 outline-none focus:border-teal-300/60 focus:ring-2 focus:ring-teal-300/20"
      >
        <option value="">All owners</option>
        {ownerGroups.map((group) => (
          <option key={group.ownerId} value={group.ownerId}>
            {group.ownerName} ({group.aquariums.length})
          </option>
        ))}
      </select>
    </div>
  );
}
