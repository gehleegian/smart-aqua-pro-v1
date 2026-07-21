import { Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { SummaryItem } from '../../types/dataLogs';

type ReportSummaryCardProps = {
  summaryItems: SummaryItem[];
};

export function ReportSummaryCard({ summaryItems }: ReportSummaryCardProps) {
  return (
    <Card>
      <CardHeader>
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Calendar className="h-5 w-5 text-purple-400" />
          Report Summary
        </h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {summaryItems.map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-sm text-slate-300">{item.label}</span>
              <span className="text-sm font-semibold text-white">{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
