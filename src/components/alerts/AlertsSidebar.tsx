import { CheckCircle, Zap } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { AquariumAlert } from '../../types/alerts';
import { formatAlertTimestamp } from '../../utils/alertsHelpers';

type DistributionItem = {
  label: string;
  color: string;
  count: number;
};

type AlertsSidebarProps = {
  distribution: DistributionItem[];
  recentResolvedAlerts: AquariumAlert[];
  totalOpenAlerts: number;
};

export function AlertsSidebar({
  distribution,
  recentResolvedAlerts,
  totalOpenAlerts,
}: AlertsSidebarProps) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">Open Alert Distribution</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {distribution.map((item) => (
              <div key={item.label} className="flex items-center justify-between gap-3">
                <span className="truncate text-sm text-slate-400">{item.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-20 rounded-full bg-slate-700">
                    <div
                      className={`h-2 rounded-full ${item.color}`}
                      style={{
                        width: `${
                          totalOpenAlerts === 0 ? 0 : Math.max((item.count / totalOpenAlerts) * 100, 8)
                        }%`,
                      }}
                    />
                  </div>
                  <span className="w-6 text-right text-sm text-white">{item.count}</span>
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
          <div className="space-y-2.5">
            {recentResolvedAlerts.length === 0 ? (
              <p className="text-sm text-slate-400">No alerts have resolved yet.</p>
            ) : (
              recentResolvedAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 rounded-lg bg-slate-700/30 p-2.5"
                >
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-300" title={alert.message}>
                      {alert.message}
                    </p>
                    <p className="text-xs text-slate-500">
                      {alert.tankName} • {formatAlertTimestamp(alert)}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-lg font-semibold text-white">System Guidance</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            <div className="flex items-start gap-3 rounded-lg bg-slate-700/30 p-2.5">
              <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-400" />
              <p className="text-sm text-slate-300">
                Active alerts are raised from live tank values and stored thresholds.
              </p>
            </div>
            <div className="flex items-start gap-3 rounded-lg bg-slate-700/30 p-2.5">
              <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              <p className="text-sm text-slate-300">
                Resolved alerts stay in history after the condition clears so you can review what happened.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
