import { Download, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader } from '../ui/Card';

type QuickExportCardProps = {
  disabled: boolean;
  onExportCsv: () => void;
  onGenerateReport: () => void;
  className?: string;
};

export function QuickExportCard({
  disabled,
  onExportCsv,
  onGenerateReport,
  className = '',
}: QuickExportCardProps) {
  return (
    <Card className={`h-fit ${className}`}>
      <CardHeader>
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-white">Quick Export</h3>
          <p className="text-sm text-slate-400">
            Download the current aquarium log or generate a formal report.
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <button
            type="button"
            onClick={onExportCsv}
            disabled={disabled}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-600/80 bg-slate-900/40 px-4 py-3 text-left text-sm text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-slate-700/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-700/70 text-cyan-300">
              <Download className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">Export as CSV</span>
              <span className="block text-xs text-slate-400">Structured telemetry table</span>
            </span>
          </button>
          <button
            type="button"
            onClick={onGenerateReport}
            disabled={disabled}
            className="flex w-full items-center gap-3 rounded-lg border border-slate-600/80 bg-slate-900/40 px-4 py-3 text-left text-sm text-slate-200 transition-all hover:border-cyan-500/40 hover:bg-slate-700/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-slate-700/70 text-violet-300">
              <FileText className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block font-medium">Generate Report</span>
              <span className="block text-xs text-slate-400">Formatted summary document</span>
            </span>
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
