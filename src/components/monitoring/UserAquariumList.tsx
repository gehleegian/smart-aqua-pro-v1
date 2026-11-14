import { RefreshCw } from 'lucide-react';
import type { MonitoringAquarium } from '../../types/monitoring';
import { getAutomationSettings, getMonitoringSummaryLine } from '../../utils/monitoringHelpers';
import { nextScheduledText } from '../../utils/schedule';
import { useNow } from '../../hooks/useNow';
import Button from '../ui/Button';
import { AquariumConditionBadge } from './MonitoringAttention';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface UserAquariumListProps {
  aquariums: MonitoringAquarium[];
  userName: string;
  organizationName?: string;
  membershipRole?: 'owner' | 'caretaker' | null;
  onRefresh: () => void;
  onSelectAquarium: (aquarium: MonitoringAquarium) => void;
}

export function UserAquariumList({
  aquariums,
  userName,
  organizationName,
  membershipRole,
  onRefresh,
  onSelectAquarium,
}: UserAquariumListProps) {
  const now = useNow();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Monitoring</h3>
            <p className="mt-1 text-sm text-slate-300">Organization: {organizationName || 'No organization selected'}</p>
            <p className="mt-1 text-xs text-slate-400">Signed in as {userName}{membershipRole ? ` · ${membershipRole === 'owner' ? 'Owner' : 'Caretaker'}` : ''}</p>
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
                <AquariumConditionBadge aquarium={aquarium} />
              </div>
              <p className="mt-2 text-sm text-slate-400">
{getMonitoringSummaryLine(aquarium)}
              </p>
              {aquarium.automationSettings?.enabled && nextScheduledText(getAutomationSettings(aquarium), now) ? (
                // Only a schedule the owner saved, never the built-in defaults.
                <p className="mt-1 text-xs text-teal-100">{nextScheduledText(getAutomationSettings(aquarium), now)}</p>
              ) : null}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

