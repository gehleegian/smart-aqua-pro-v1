import { Users } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { AquariumOwnerGroup } from '../../types/aquariumManagement';

type AquariumOwnerSelectorProps = {
  ownerGroups: AquariumOwnerGroup[];
  selectedOwnerId: string;
  onSelectOwner: (ownerId: string) => void;
};

export function AquariumOwnerSelector({
  ownerGroups,
  selectedOwnerId,
  onSelectOwner,
}: AquariumOwnerSelectorProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-cyan-400" />
          <h3 className="text-lg font-semibold text-white">Aquarium Owners</h3>
        </div>
      </CardHeader>
      <CardContent>
        {ownerGroups.length === 0 ? (
          <p className="text-slate-400">No aquarium owners found.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {ownerGroups.map((group) => (
              <button
                key={group.ownerId}
                onClick={() => onSelectOwner(group.ownerId)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  selectedOwnerId === group.ownerId
                    ? 'bg-cyan-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {group.ownerName} ({group.aquariums.length})
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
