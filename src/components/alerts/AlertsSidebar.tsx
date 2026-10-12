import type { AquariumAlert } from '../../types/alerts';
import { formatAlertTimestamp } from '../../utils/alertsHelpers';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AlertsSidebarProps {
  distribution: { label: string; count: number; color: string }[];
  recentResolvedAlerts: AquariumAlert[];
  totalOpenAlerts: number;
}

export function AlertsSidebar({
  distribution,
  recentResolvedAlerts,
  totalOpenAlerts,
}: AlertsSidebarProps) {
  const maxCount = Math.max(totalOpenAlerts, ...distribution.map((item) => item.count), 1);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Distribution</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {distribution.map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between text-sm">
                  <span className="text-slate-400">{item.label}</span>
                  <span className="text-white">{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-700">
                  <div
                    className={`h-2 rounded-full ${item.color}`}
                    style={{ width: `${(item.count / maxCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Recently Resolved</h3>
        </CardHeader>
        <CardContent>
          {recentResolvedAlerts.length === 0 ? (
            <p className="text-sm text-slate-400">No resolved alerts yet.</p>
          ) : (
            <div className="space-y-3">
              {recentResolvedAlerts.map((alert) => (
                <div key={alert.id} className="text-sm">
                  <p className="text-slate-200">{alert.tankName}</p>
                  <p className="text-xs text-slate-500">{formatAlertTimestamp(alert)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
