import { useCallback, useEffect, useId, useState } from 'react';
import { Download, FileBarChart, FileText, Loader2, RefreshCw } from 'lucide-react';
import { auth } from '../firebase';
import { getAquariumsByOwner } from '../services/aquariumService';
import { generateReport, listReports, reportFileUrl } from '../services/reportsService';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Input from '../components/ui/Input';
import LoadingState from '../components/ui/LoadingState';
import StatusMessage from '../components/ui/StatusMessage';
import ReportSummaryView, { manilaDateTime } from '../components/reports/ReportSummaryView';
import type { Aquarium } from '../types/aquarium';
import type { GeneratedReport, ReportType } from '../types/monitoringReport';

// FR21 (Sprint 5): reports per tank. Owners and assigned caretakers generate
// on demand; weekly (Monday 07:00) and monthly (1st, 07:00) reports appear on
// their own. The page lists only the tanks the member can see (org-scoped).

const TYPES: { value: ReportType; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly (Mon to Sun)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'custom', label: 'Custom range' },
];

const todayManila = () => new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
const selectClass = 'w-full rounded-lg border border-slate-600/50 bg-slate-900/35 px-4 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400/70';

export default function Reports() {
  const tankId = useId();
  const typeId = useId();
  const [aquariums, setAquariums] = useState<Aquarium[] | null>(null);
  const [aquariumId, setAquariumId] = useState('');
  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [startDate, setStartDate] = useState(todayManila);
  const [endDate, setEndDate] = useState(todayManila);
  const [reports, setReports] = useState<GeneratedReport[] | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');

  useEffect(() => {
    const uid = auth.currentUser?.uid ?? '';
    let cancelled = false;
    (uid ? getAquariumsByOwner(uid) : Promise.resolve([] as Aquarium[]))
      .then((items) => {
        if (cancelled) return;
        setAquariums(items);
        setAquariumId((current) => current || items[0]?.id || '');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setAquariums([]);
        setListError(err instanceof Error ? err.message : 'Aquariums could not be loaded.');
      });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async (id: string) => {
    if (!id) return;
    setReports(null);
    setListError('');
    try {
      const items = await listReports(id);
      setReports(items);
      setSelectedId((current) => (items.some((item) => item.id === current) ? current : items[0]?.id ?? ''));
    } catch (err) {
      console.error(err);
      setReports([]);
      setListError('Past reports could not be loaded. Check your connection and try again.');
    }
  }, []);

  useEffect(() => {
    if (!aquariumId) return;
    const timer = window.setTimeout(() => { void refresh(aquariumId); }, 0);
    return () => window.clearTimeout(timer);
  }, [aquariumId, refresh]);

  const onGenerate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await generateReport({ aquariumId, reportType, startDate, ...(reportType === 'custom' ? { endDate } : {}) });
      setNotice('Report ready.');
      setSelectedId(result.reportId);
      await refresh(aquariumId);
      setSelectedId(result.reportId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The report could not be generated.');
    } finally {
      setBusy(false);
    }
  };

  const open = async (path: string | null) => {
    if (!path) return;
    setError('');
    try {
      const url = await reportFileUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The file could not be opened.');
    }
  };

  if (aquariums === null) return <LoadingState label="Loading reports..." />;
  if (aquariums.length === 0) {
    return (
      <Card>
        {listError ? <CardContent><StatusMessage variant="error">{listError}</StatusMessage></CardContent> : null}
        <EmptyState icon={FileBarChart} message="No aquariums yet. Reports appear here once you own or are assigned to a tank." />
      </Card>
    );
  }

  const selected = reports?.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <h2 className="text-base font-semibold text-white">Monitoring reports</h2>
          <p className="text-sm text-slate-300">Weekly reports are created every Monday at 07:00 and monthly reports on the 1st at 07:00 (Asia/Manila). You can also create one now.</p>
        </CardHeader>
        <CardContent>
          <form onSubmit={onGenerate} className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5 xl:items-end">
            <div className="space-y-1">
              <label htmlFor={tankId} className="block text-sm font-medium text-slate-200">Aquarium</label>
              <select id={tankId} className={selectClass} value={aquariumId} onChange={(event) => setAquariumId(event.target.value)}>
                {aquariums.map((aquarium) => <option key={aquarium.id} value={aquarium.id}>{aquarium.name}</option>)}
              </select>
            </div>
            <div className="space-y-1">
              <label htmlFor={typeId} className="block text-sm font-medium text-slate-200">Period</label>
              <select id={typeId} className={selectClass} value={reportType} onChange={(event) => setReportType(event.target.value as ReportType)}>
                {TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
              </select>
            </div>
            <Input
              type="date"
              label={reportType === 'custom' ? 'From' : reportType === 'daily' ? 'Day' : `Any day in the ${reportType === 'weekly' ? 'week' : 'month'}`}
              value={startDate}
              max={todayManila()}
              required
              onChange={(event) => setStartDate(event.target.value)}
            />
            {reportType === 'custom' ? (
              <Input type="date" label="To (inclusive)" value={endDate} min={startDate} max={todayManila()} required onChange={(event) => setEndDate(event.target.value)} />
            ) : <div className="hidden xl:block" />}
            <Button type="submit" disabled={busy || !aquariumId}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FileBarChart className="h-4 w-4" aria-hidden="true" />}
              {busy ? 'Generating…' : 'Generate report'}
            </Button>
          </form>
          <div className="mt-4 space-y-2" aria-live="polite">
            {notice ? <StatusMessage variant="success">{notice}</StatusMessage> : null}
            {error ? <StatusMessage variant="error">{error}</StatusMessage> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-semibold text-white">Past reports</h3>
          <Button variant="ghost" size="sm" onClick={() => void refresh(aquariumId)} aria-label="Refresh the list of reports">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {listError ? <StatusMessage variant="error">{listError}</StatusMessage> : null}
          {reports === null ? <LoadingState label="Loading past reports..." /> : null}
          {reports?.length === 0 && !listError ? <p className="py-6 text-center text-sm text-slate-300">No reports for this aquarium yet. Generate one above.</p> : null}
          {reports && reports.length > 0 ? (
            <ul className="divide-y divide-slate-700/50">
              {reports.map((report) => (
                <li key={report.id} className={`flex flex-wrap items-center gap-3 py-3 ${report.id === selectedId ? 'rounded-lg bg-slate-700/25 px-2' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-100">
                      <span className="capitalize">{report.reportType}</span> · {report.periodLabel || '-'}
                    </p>
                    <p className="text-xs text-slate-400">
                      Generated {manilaDateTime(report.generatedAt)} by {report.generatedBy === 'schedule' ? 'the schedule' : report.generatedByLabel ?? 'a member'}
                    </p>
                  </div>
                  <Button variant={report.id === selectedId ? 'primary' : 'secondary'} size="sm" onClick={() => setSelectedId(report.id)} aria-pressed={report.id === selectedId}>
                    <FileText className="h-4 w-4" aria-hidden="true" /> View summary
                  </Button>
                  <Button variant="secondary" size="sm" disabled={!report.pdfPath} onClick={() => void open(report.pdfPath)} aria-label={`Download PDF for ${report.periodLabel}`}>
                    <Download className="h-4 w-4" aria-hidden="true" /> PDF
                  </Button>
                  <Button variant="secondary" size="sm" disabled={!report.csvPath} onClick={() => void open(report.csvPath)} aria-label={`Download CSV of valid readings for ${report.periodLabel}`}>
                    <Download className="h-4 w-4" aria-hidden="true" /> CSV
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      {selected?.structuredSummary ? (
        <section aria-labelledby="report-summary-heading" className="space-y-3">
          <h3 id="report-summary-heading" className="text-lg font-semibold text-white">
            {selected.structuredSummary.aquarium.name} · {selected.periodLabel}
          </h3>
          <ReportSummaryView summary={selected.structuredSummary} />
        </section>
      ) : selected ? (
        <StatusMessage variant="warning">This report was created before structured summaries existed: {selected.summary || 'no summary stored.'}</StatusMessage>
      ) : null}
    </div>
  );
}
