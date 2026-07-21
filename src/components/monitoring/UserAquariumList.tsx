import { Fish, RefreshCw } from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { MonitoringAquarium } from '../../types/monitoring';
import { AquariumOverviewCard } from './MonitoringCards';

type UserAquariumListProps = {
  aquariums: MonitoringAquarium[];
  userName: string;
  onRefresh: () => void;
  onSelectAquarium: (aquarium: MonitoringAquarium) => void;
};

export function UserAquariumList({
  aquariums,
  userName,
  onRefresh,
  onSelectAquarium,
}: UserAquariumListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Monitoring</h2>
          <p className="text-sm text-slate-400 mt-1">
            {`User view: choose an aquarium to view monitoring details for ${
              userName || 'your account'
            }`}
          </p>
        </div>

        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <Fish className="w-5 h-5 text-cyan-400" />
              <h3 className="text-lg font-semibold text-white">Aquariums</h3>
            </div>
            <Badge variant="info">{aquariums.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {aquariums.map((aquarium) => (
              <AquariumOverviewCard
                key={aquarium.id}
                aquarium={aquarium}
                onView={onSelectAquarium}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
