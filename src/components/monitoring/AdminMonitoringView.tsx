import { RefreshCw, Users } from 'lucide-react';
import type { MonitoringOwner } from '../../types/monitoring';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AdminMonitoringViewProps {
  ownerCards: MonitoringOwner[];
  selectedOwner: MonitoringOwner | undefined;
  onBackToUsers: () => void;
  onRefresh: () => void;
  onSelectOwner: (owner: MonitoringOwner) => void;
}

export function AdminMonitoringView({
  ownerCards,
  selectedOwner,
  onBackToUsers,
  onRefresh,
  onSelectOwner,
}: AdminMonitoringViewProps) {
  if (selectedOwner) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={onBackToUsers}>Back to Users</Button>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">{selectedOwner.name}</h3>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <Stat label="Tanks" value={selectedOwner.stats.totalTanks} />
              <Stat label="Healthy" value={selectedOwner.stats.healthyTanks} />
              <Stat label="Warnings" value={selectedOwner.stats.warningTanks} />
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {selectedOwner.aquariums.map((aquarium) => (
                <div key={aquarium.id} className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
                  <p className="font-medium text-white">{aquarium.name}</p>
                  <p className="mt-1 text-sm text-slate-400">
                    {aquarium.temp.toFixed(1)} C · {aquarium.level}% level · {aquarium.quality}% TDS
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Users className="h-5 w-5 text-teal-200" />
            User Monitoring
          </h3>
          <Button variant="secondary" onClick={onRefresh}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {ownerCards.map((owner) => (
            <button
              key={owner.id}
              type="button"
              onClick={() => onSelectOwner(owner)}
              className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4 text-left transition hover:border-teal-300/50 hover:bg-slate-800/45"
            >
              <p className="font-medium text-white">{owner.name}</p>
              <p className="mt-1 text-sm text-slate-400">{owner.email}</p>
              <p className="mt-3 text-xs text-slate-500">
                {owner.stats.totalTanks} tanks · {owner.stats.warningTanks} warnings
              </p>
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-4">
      <p className="text-sm text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
    </div>
  );
}
