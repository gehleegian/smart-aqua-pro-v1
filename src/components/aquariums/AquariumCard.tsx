import { Droplets, Pencil, Trash2, Waves, Thermometer } from 'lucide-react';
import type { Aquarium } from '../../types/aquarium';
import type { UserRole } from '../../types/user';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AquariumCardProps {
  aquarium: Aquarium;
  currentUserRole: UserRole;
  deleting: boolean;
  onEdit: (aquarium: Aquarium) => void;
  onDelete: (aquariumId: string) => void;
}

export function AquariumCard({
  aquarium,
  currentUserRole,
  deleting,
  onEdit,
  onDelete,
}: AquariumCardProps) {
  const qualityLabel =
    typeof aquarium.tdsPpm === 'number' ? `${Math.round(aquarium.tdsPpm)} ppm` : `${aquarium.quality}%`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{aquarium.species.join(', ') || 'No species listed'}</p>
            {currentUserRole === 'Admin' ? (
              <p className="mt-1 text-xs text-slate-500">{aquarium.ownerName}</p>
            ) : null}
          </div>
          <Badge variant={aquarium.level >= aquarium.minLevel ? 'success' : 'warning'}>
            {aquarium.bioload}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Thermometer className="mb-2 h-4 w-4 text-orange-400" />
            <p className="text-xs text-slate-500">Temperature</p>
            <p className="text-sm font-medium text-white">{aquarium.temp} C</p>
          </div>
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Droplets className="mb-2 h-4 w-4 text-blue-400" />
            <p className="text-xs text-slate-500">Level</p>
            <p className="text-sm font-medium text-white">{aquarium.level}%</p>
          </div>
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Waves className="mb-2 h-4 w-4 text-emerald-400" />
            <p className="text-xs text-slate-500">TDS</p>
            <p className="text-sm font-medium text-white">{qualityLabel}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => onEdit(aquarium)}>
            <Pencil className="h-4 w-4" />
            Edit
          </Button>
          <Button size="sm" variant="danger" disabled={deleting} onClick={() => onDelete(aquarium.id)}>
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
