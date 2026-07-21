import Badge from '../ui/Badge';
import { Card, CardContent } from '../ui/Card';
import type { AquariumAlert } from '../../types/alerts';
import {
  categoryIconMap,
  formatAlertTimestamp,
  formatRelativeTime,
  getAlertStatus,
  getAlertStatusBadge,
  severityIconMap,
} from '../../utils/alertsHelpers';

type AlertsListProps = {
  title: string;
  alerts: AquariumAlert[];
  selectedAlertId: string;
  userRole: 'Admin' | 'User';
  onToggleAlert: (alertId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
};

export function AlertsList({
  title,
  alerts,
  selectedAlertId,
  userRole,
  onToggleAlert,
  onAcknowledgeAlert,
}: AlertsListProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-white">{title}</h3>

      <div className="space-y-2">
        {alerts.map((alert) => {
          const SeverityIcon = severityIconMap[alert.type];
          const CategoryIcon = categoryIconMap[alert.category];
          const badge = getAlertStatusBadge(alert);
          const status = getAlertStatus(alert);

          return (
            <Card key={alert.id} className="overflow-hidden">
              <CardContent
                className="cursor-pointer p-3 transition-all hover:bg-slate-700/30"
                onClick={() => onToggleAlert(alert.id)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      alert.type === 'critical' ? 'bg-red-500/20' : 'bg-amber-500/20'
                    }`}
                  >
                    <SeverityIcon
                      className={`h-4 w-4 ${
                        alert.type === 'critical' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <p
                        className="min-w-0 flex-1 truncate text-sm font-semibold text-white"
                        title={alert.message}
                      >
                        {alert.message}
                      </p>
                      <Badge variant={badge.variant} className="shrink-0">
                        {badge.label}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-medium text-cyan-300">
                        Tank: {alert.tankName}
                      </span>
                      {userRole === 'Admin' && (
                        <span className="inline-flex items-center rounded-full border border-slate-600 bg-slate-700/50 px-2 py-0.5 font-medium text-slate-300">
                          Owner: {alert.ownerName}
                        </span>
                      )}
                      <span className="flex items-center gap-1 capitalize text-slate-500">
                        <CategoryIcon className="h-3 w-3" />
                        {alert.category.replace('_', ' ')}
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="text-slate-500">{formatAlertTimestamp(alert)}</span>
                    </div>
                  </div>
                </div>

                {selectedAlertId === alert.id && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-slate-700 pt-3">
                    <div className="text-sm text-slate-400">
                      <p className="truncate">Alert ID: {alert.id}</p>
                      <p>Category: {alert.category.replace('_', ' ')}</p>
                      <p>Affected tank: {alert.tankName}</p>
                      {userRole === 'Admin' && <p>Owner: {alert.ownerName}</p>}
                      <p>First detected: {formatRelativeTime(alert.firstDetectedAt)}</p>
                    </div>

                    {status === 'active' && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          onAcknowledgeAlert(alert.id);
                        }}
                        className="rounded-lg bg-cyan-600 px-3 py-1.5 text-sm font-medium text-white transition-all hover:bg-cyan-700"
                      >
                        Acknowledge
                      </button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}

        {alerts.length === 0 && (
          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-slate-400">No alerts found matching your filters.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
