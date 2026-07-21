import {
  Droplets,
  Fish,
  Pencil,
  Thermometer,
  Trash2,
  Waves,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import Badge from '../ui/Badge';
import type { Aquarium } from '../../types/aquarium';
import type { UserRole } from '../../types/user';

type AquariumCardProps = {
  aquarium: Aquarium;
  currentUserRole: UserRole;
  deleting: boolean;
  onEdit: (aquarium: Aquarium) => void;
  onDelete: (aquariumId: string) => void;
};

export function AquariumCard({
  aquarium,
  currentUserRole,
  deleting,
  onEdit,
  onDelete,
}: AquariumCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600">
              <Fish className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
              <div className="mt-0.5 flex flex-wrap items-center gap-1">
                {aquarium.species.map((item) => (
                  <span
                    key={item}
                    className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400"
                  >
                    {item}
                  </span>
                ))}
              </div>
              {currentUserRole === 'Admin' && (
                <p className="mt-2 text-xs text-slate-500">Owner: {aquarium.ownerName}</p>
              )}
            </div>
          </div>

          <Badge
            variant={
              aquarium.bioload === 'high'
                ? 'danger'
                : aquarium.bioload === 'medium'
                ? 'warning'
                : 'success'
            }
          >
            {aquarium.bioload} bioload
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-3">
          <div className="text-center">
            <Thermometer className="mx-auto mb-1 h-5 w-5 text-orange-400" />
            <p className="text-lg font-bold text-white">
              {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
            </p>
            <p className="text-xs text-slate-500">Target Range</p>
          </div>
          <div className="text-center">
            <Droplets className="mx-auto mb-1 h-5 w-5 text-blue-400" />
            <p className="text-lg font-bold text-white">{aquarium.minLevel}%</p>
            <p className="text-xs text-slate-500">Minimum Level</p>
          </div>
          <div className="text-center">
            <Waves className="mx-auto mb-1 h-5 w-5 text-emerald-400" />
            <p className="text-lg font-bold text-white">{aquarium.minQuality}%</p>
            <p className="text-xs text-slate-500">Minimum Purity (TDS)</p>
          </div>
        </div>

        <div className="mb-4 rounded-lg bg-slate-800/50 px-3 py-2 text-sm">
          <p className="text-xs text-slate-500">Live Monitoring</p>
          <p className="font-medium text-white">Open Monitoring to view live sensor data.</p>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg bg-slate-800/50 px-3 py-2">
            <p className="text-xs text-slate-500">Temperature Range</p>
            <p className="font-medium text-white">
              {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/50 px-3 py-2">
            <p className="text-xs text-slate-500">Bioload</p>
            <p className="font-medium text-white capitalize">{aquarium.bioload}</p>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge variant={aquarium.feeder === 'Active' ? 'success' : 'default'}>
            Feeder: {aquarium.feeder}
          </Badge>
          <Badge variant={aquarium.light === 'On' ? 'info' : 'default'}>
            Light: {aquarium.light}
          </Badge>
          <Badge variant={aquarium.filter === 'Active' ? 'success' : 'default'}>
            Filter: {aquarium.filter}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onEdit(aquarium)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </button>

          <button
            onClick={() => onDelete(aquarium.id)}
            disabled={deleting}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
