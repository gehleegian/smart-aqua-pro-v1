import { AlertCircle, AlertTriangle, Bell, CheckCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/Card';

type AlertsSummaryGridProps = {
  criticalCount: number;
  warningCount: number;
  acknowledgedCount: number;
  resolvedCount: number;
};

const summaryCards = [
  {
    key: 'criticalCount',
    label: 'Critical',
    icon: AlertCircle,
    iconClassName: 'text-red-400',
    wrapperClassName: 'bg-red-500/20',
  },
  {
    key: 'warningCount',
    label: 'Warnings',
    icon: AlertTriangle,
    iconClassName: 'text-amber-400',
    wrapperClassName: 'bg-amber-500/20',
  },
  {
    key: 'acknowledgedCount',
    label: 'Acknowledged',
    icon: Bell,
    iconClassName: 'text-cyan-400',
    wrapperClassName: 'bg-cyan-500/20',
  },
  {
    key: 'resolvedCount',
    label: 'Resolved',
    icon: CheckCircle,
    iconClassName: 'text-emerald-400',
    wrapperClassName: 'bg-emerald-500/20',
  },
] as const;

export function AlertsSummaryGrid(props: AlertsSummaryGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      {summaryCards.map((card) => {
        const Icon = card.icon;
        const value = props[card.key];

        return (
          <Card key={card.key}>
            <CardContent className="flex items-center gap-4 p-4">
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.wrapperClassName}`}
              >
                <Icon className={`h-6 w-6 ${card.iconClassName}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{value}</p>
                <p className="text-xs text-slate-400">{card.label}</p>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
