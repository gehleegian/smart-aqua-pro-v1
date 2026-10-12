import { Download, FileText } from 'lucide-react';
import Button from '../ui/Button';
import { Card, CardContent, CardHeader } from '../ui/Card';

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
      <CardHeader>
        <h3 className="text-lg font-semibold text-white">Export</h3>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <Button className="w-full" disabled={disabled} onClick={onExportCsv}>
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
          <Button className="w-full" variant="secondary" disabled={disabled} onClick={onGenerateReport}>
            <FileText className="h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
