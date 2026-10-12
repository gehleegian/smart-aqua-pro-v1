import type { SummaryItem } from '../../types/dataLogs';
import { Card, CardContent, CardHeader } from '../ui/Card';

interface ReportSummaryCardProps {
  summaryItems: SummaryItem[];
}

export function ReportSummaryCard({ summaryItems }: ReportSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">Report Summary</h3>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {summaryItems.map((item) => (
            <div key={item.label} className="rounded-lg border border-slate-600/20 bg-slate-900/30 p-3">
              <p className="text-xs text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm font-semibold text-white">{item.value}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
