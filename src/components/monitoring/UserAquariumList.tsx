import { RefreshCw } from 'lucide-react';
import type { MonitoringAquarium } from '../../types/monitoring';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface UserAquariumListProps {
  aquariums: MonitoringAquarium[];
  userName: string;
  onRefresh: () => void;
  onSelectAquarium: (aquarium: MonitoringAquarium) => void;
}

export function UserAquariumList({
  aquariums,
  userName,
  onRefresh,
  onSelectAquarium,
}: UserAquariumListProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Monitoring</h3>
            <p className="mt-1 text-sm text-slate-400">{userName}</p>
          </div>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {aquariums.map((aquarium) => (
            <button
              key={aquarium.id}
              type="button"
              onClick={() => onSelectAquarium(aquarium)}
              className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4 text-left transition hover:border-teal-300/50 hover:bg-slate-800/45"
            >
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{aquarium.name}</p>
                <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
                  {aquarium.healthStatus}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-slate-400">
                {aquarium.temp.toFixed(1)} C · {aquarium.level}% level · {aquarium.quality}% TDS
              </p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
