import { Download, FileText } from 'lucide-react';
import Button from '../ui/Button';
import { Card, CardContent } from '../ui/Card';

interface QuickExportCardProps {
  className?: string;
  disabled: boolean;
  onExportCsv: () => void;
  onGenerateReport: () => void;
}

export function QuickExportCard({
  className = '',
  disabled,
  onExportCsv,
  onGenerateReport,
}: QuickExportCardProps) {
  return (
    <Card className={className}>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-white">Export</h3>
        <div className="flex flex-wrap gap-3">
          <Button disabled={disabled} onClick={onExportCsv}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
          <Button variant="secondary" disabled={disabled} onClick={onGenerateReport}>
            <FileText className="h-4 w-4" aria-hidden="true" />
            Generate Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
