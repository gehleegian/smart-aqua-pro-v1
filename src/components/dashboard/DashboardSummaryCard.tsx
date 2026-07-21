import { Card, CardContent } from '../ui/Card';
import type { DashboardSummaryCard as DashboardSummaryCardData } from '../../types/dashboard';

type DashboardSummaryCardProps = {
  card: DashboardSummaryCardData;
};

export function DashboardSummaryCard({ card }: DashboardSummaryCardProps) {
  const Icon = card.icon;
  const valueClassName =
    typeof card.value === 'string' && card.value.length > 12
      ? 'text-lg'
      : 'text-2xl';

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-slate-400">{card.title}</p>
            <p className={`font-bold text-white break-words ${valueClassName}`}>{card.value}</p>
          </div>
          <div
            className={`h-12 w-12 shrink-0 rounded-xl flex items-center justify-center ${card.iconWrapperClassName}`}
          >
            <Icon className={`h-6 w-6 ${card.iconClassName}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
