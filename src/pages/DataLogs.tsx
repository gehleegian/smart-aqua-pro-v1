import { Droplets, Thermometer, Waves } from 'lucide-react';
import { DataLogsToolbar } from '../components/dataLogs/DataLogsToolbar';
import { HistoricalDataTable } from '../components/dataLogs/HistoricalDataTable';
import { HistoryLineChart } from '../components/dataLogs/HistoryLineChart';
import { QuickExportCard } from '../components/dataLogs/QuickExportCard';
import { ReportSummaryCard } from '../components/dataLogs/ReportSummaryCard';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import { useDataLogsController } from '../hooks/useDataLogsController';

export default function DataLogs() {
  const dataLogs = useDataLogsController();

  if (dataLogs.loading) {
    return <div className="text-slate-300">Loading data logs...</div>;
  }

  if (dataLogs.error && dataLogs.aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">{dataLogs.error}</p>
        </CardContent>
      </Card>
    );
  }

  if (dataLogs.aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">{dataLogs.emptyMessage}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <DataLogsToolbar
        timePeriod={dataLogs.timePeriod}
        selectedDate={dataLogs.selectedDate}
        selectedAquariumId={dataLogs.selectedAquariumId}
        aquariums={dataLogs.aquariums}
        userRole={dataLogs.userRole}
        onSelectPeriod={dataLogs.actions.setTimePeriod}
        onSelectDate={dataLogs.actions.setSelectedDate}
        onSelectAquarium={dataLogs.actions.selectAquarium}
      />

      {dataLogs.error ? (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          {dataLogs.error}
        </div>
      ) : null}

      {dataLogs.liveDataError ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {dataLogs.liveDataError}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Thermometer className="h-5 w-5 text-orange-400" />
              Temperature History
            </h3>
          </CardHeader>
          <CardContent>
            <HistoryLineChart
              data={dataLogs.temperatureChartData}
              color="#f97316"
              label={dataLogs.chartRangeLabel}
              unit=" C"
              emptyMessage="No logged readings for this range yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
              <Droplets className="h-5 w-5 text-blue-400" />
              Water Level History
            </h3>
          </CardHeader>
          <CardContent>
            <HistoryLineChart
              data={dataLogs.waterLevelChartData}
              color="#3b82f6"
              label={dataLogs.chartRangeLabel}
              unit="%"
              emptyMessage="No logged readings for this range yet."
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
                <Waves className="h-5 w-5 text-emerald-400" />
                Water Purity (TDS ppm)
              </h3>
            </CardHeader>
            <CardContent>
              <HistoryLineChart
                data={dataLogs.weeklyQualityData}
                color="#10b981"
                label={`7d ending ${dataLogs.selectedDate}`}
                unit=" ppm"
                emptyMessage="No TDS history available yet."
              />
            </CardContent>
          </Card>

          <ReportSummaryCard summaryItems={dataLogs.summaryItems} />
        </div>

        <QuickExportCard
          className="xl:sticky xl:top-6"
          disabled={!dataLogs.selectedAquarium || dataLogs.exportEntries.length === 0}
          onExportCsv={dataLogs.actions.exportCsv}
          onGenerateReport={dataLogs.actions.generateReport}
        />
      </div>

      <HistoricalDataTable
        aquarium={dataLogs.selectedAquarium}
        entries={dataLogs.tableEntries}
        historyLoading={dataLogs.historyLoading}
        emptyMessage={dataLogs.historicalTableEmptyMessage}
      />
    </div>
  );
}
