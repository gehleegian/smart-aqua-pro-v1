import { AlertCircle, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';

interface AlertsSummaryGridProps {
  criticalCount: number;
  warningCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
}

export function AlertsSummaryGrid({
  criticalCount,
  warningCount,
  acknowledgedCount,
  resolvedCount,
}: AlertsSummaryGridProps) {
  const items = [
    { label: 'Critical', value: criticalCount, icon: AlertCircle, color: 'text-red-400' },
    { label: 'Warning', value: warningCount, icon: AlertTriangle, color: 'text-amber-400' },
    { label: 'Acknowledged', value: acknowledgedCount, icon: Clock, color: 'text-teal-200' },
    { label: 'Resolved', value: resolvedCount, icon: CheckCircle, color: 'text-emerald-400' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;

        return (
          <Card key={item.label}>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm text-slate-400">{item.label}</p>
                  <p className="mt-1 text-2xl font-semibold text-white">{item.value}</p>
                </div>
                <Icon className={`h-6 w-6 ${item.color}`} />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
