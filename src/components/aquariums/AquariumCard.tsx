import { Droplets, Pencil, Trash2, Waves, Thermometer } from 'lucide-react';
import type { Aquarium } from '../../types/aquarium';
import type { UserRole } from '../../types/user';
import {
  formatBiomass,
  formatEstimatedBioload,
} from '../../utils/aquariumProfileCalculations';
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
  // This card has no live telemetry. Old stored readings are not current water
  // conditions, so the reading tiles show "--"; live values are on Monitoring.
  const dimensions =
    typeof aquarium.tankLengthCm === 'number' &&
    typeof aquarium.tankWidthCm === 'number' &&
    typeof aquarium.tankHeightCm === 'number'
      ? `${aquarium.tankLengthCm} × ${aquarium.tankWidthCm} × ${aquarium.tankHeightCm} cm`
      : 'Profile incomplete';

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-white">{aquarium.name}</h3>
            <p className="mt-1 text-sm text-slate-400">{aquarium.species.join(', ') || 'No species listed'}</p>
            {currentUserRole === 'Admin' ? (
              <p className="mt-1 text-xs text-slate-400">{aquarium.ownerName}</p>
            ) : null}
          </div>
          <Badge variant="info">
            {aquarium.tankType || 'Profile incomplete'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Thermometer className="mb-2 h-4 w-4 text-orange-400" />
            <p className="text-xs text-slate-400">Temperature</p>
            <p className="text-sm font-medium text-white">--</p>
          </div>
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Droplets className="mb-2 h-4 w-4 text-blue-400" />
            <p className="text-xs text-slate-400">Level</p>
            <p className="text-sm font-medium text-white">--</p>
          </div>
          <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
            <Waves className="mb-2 h-4 w-4 text-emerald-400" />
            <p className="text-xs text-slate-400">TDS</p>
            <p className="text-sm font-medium text-white">--</p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 rounded-lg border border-slate-600/20 bg-slate-950/25 p-4 text-sm sm:grid-cols-2">
          <ProfileItem label="Tank dimensions" value={dimensions} />
          <ProfileItem
            label="Operational water volume"
            value={
              typeof aquarium.workingWaterVolumeLiters === 'number'
                ? `${aquarium.workingWaterVolumeLiters} L`
                : 'Profile incomplete'
            }
          />
          <ProfileItem
            label="Filtration system installed"
            value={
              aquarium.hasFiltrationSystem === true
                ? 'Yes'
                : aquarium.hasFiltrationSystem === false
                  ? 'No'
                  : 'Profile incomplete'
            }
          />
          <ProfileItem
            label="Fish quantity"
            value={typeof aquarium.fishCount === 'number' ? String(aquarium.fishCount) : 'Profile incomplete'}
          />
          <ProfileItem label="Total fish biomass" value={formatBiomass(aquarium.totalFishBiomassG)} />
          <ProfileItem label="Estimated bioload" value={formatEstimatedBioload(aquarium.estimatedBioloadGL)} />
        </dl>

        {currentUserRole === 'User' ? (
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => onEdit(aquarium)}>
              <Pencil className="h-4 w-4" />
              Edit Profile
            </Button>
            <Button size="sm" variant="danger" disabled={deleting} onClick={() => onDelete(aquarium.id)}>
              <Trash2 className="h-4 w-4" />
              {deleting ? 'Deleting...' : 'Delete'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ProfileItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-1 text-slate-200">{value}</dd>
    </div>
  );
}
