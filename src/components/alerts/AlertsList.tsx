import { Check, ChevronDown } from 'lucide-react';
import type { AquariumAlert } from '../../types/alerts';
import type { UserRole } from '../../types/user';
import {
  categoryIconMap,
  formatAlertTimestamp,
  formatRelativeTime,
  getAlertStatusBadge,
} from '../../utils/alertsHelpers';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface AlertsListProps {
  title: string;
  alerts: AquariumAlert[];
  selectedAlertId: string;
  userRole: UserRole;
  onToggleAlert: (alertId: string) => void;
  onAcknowledgeAlert: (alertId: string) => void;
}

export function AlertsList({
  title,
  alerts,
  selectedAlertId,
  userRole,
  onToggleAlert,
  onAcknowledgeAlert,
}: AlertsListProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-base font-semibold text-white">{title}</h3>
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-400">No alerts match the selected filters.</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert) => {
              const Icon = categoryIconMap[alert.category];
              const badge = getAlertStatusBadge(alert);
              const expanded = selectedAlertId === alert.id;

              return (
                <div key={alert.id} className="rounded-lg border border-slate-600/30 bg-slate-900/35 p-4">
                  <button
                    type="button"
                    onClick={() => onToggleAlert(alert.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div className="flex gap-3">
                      <Icon className="mt-0.5 h-5 w-5 text-teal-200" />
                      <div>
                        <p className="font-medium text-white">{alert.tankName}{alert.title ? ` · ${alert.title}` : ''}</p>
                        <p className="mt-1 text-sm text-slate-400">{alert.message}</p>
                        {userRole === 'Admin' ? (
                          <p className="mt-1 text-xs text-slate-400">{alert.ownerName}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      <ChevronDown className={`h-4 w-4 text-slate-400 ${expanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 pl-8 text-xs text-slate-400">
                    <span>Severity: <span className="text-slate-200">{alert.type}</span></span>
                    {alert.occurrences !== undefined ? <span>Occurrences: <span className="text-slate-200">{alert.occurrences}</span></span> : null}
                    <span>Last seen: <span className="text-slate-200">{formatRelativeTime(alert.lastDetectedAt)}</span></span>
                    {alert.origin === 'client' ? <span>(browser-evaluated; not stored)</span> : null}
                  </div>

                  {expanded ? (
                    <div className="mt-4 space-y-3 border-t border-slate-600/30 pt-4">
                      {alert.recommendation ? (
                        <div className="rounded-lg border border-slate-600/30 bg-slate-950/35 p-3 text-sm">
                          <p className="font-medium text-white">
                            Recommendation: {alert.recommendation.title}{' '}
                            <span className="text-xs font-normal text-slate-400">({alert.recommendation.status})</span>
                          </p>
                          <p className="mt-1 text-slate-300"><span className="text-slate-500">Check first:</span> {alert.recommendation.preCheck}</p>
                          <p className="mt-1 text-slate-200"><span className="text-slate-500">Action:</span> {alert.recommendation.action}</p>
                          <p className="mt-1 text-slate-400"><span className="text-slate-500">Why:</span> {alert.recommendation.basis}</p>
                        </div>
                      ) : alert.recommendationId ? (
                        <p className="text-xs text-slate-400">Linked recommendation {alert.recommendationId}</p>
                      ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-xs text-slate-400">{alert.resolvedAt ? 'Resolved' : 'Last detected'} {formatAlertTimestamp(alert)}</p>
                      {!alert.acknowledgedAt && !alert.resolvedAt ? (
                        <Button size="sm" variant="secondary" onClick={() => onAcknowledgeAlert(alert.id)}>
                          <Check className="h-4 w-4" />
                          Acknowledge
                        </Button>
                      ) : null}
                    </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
