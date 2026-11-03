import type { DashboardSummaryCard } from '../../types/dashboard';
import { Card } from '../ui/Card';

export function SummaryGrid({ cards }: { cards: DashboardSummaryCard[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;

        return (
          <Card key={card.title} className="p-4 md:p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm text-slate-300">{card.title}</p>
              <Icon className="h-4 w-4 flex-shrink-0 text-slate-400" aria-hidden="true" />
            </div>
            <p className="mt-2 break-words text-2xl font-semibold text-white">{card.value}</p>
          </Card>
        );
      })}
    </div>
  );
}
