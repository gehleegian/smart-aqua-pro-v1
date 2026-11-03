import { BarChart3, Droplets, Thermometer, Waves } from 'lucide-react';
import { DataLogsToolbar } from '../components/dataLogs/DataLogsToolbar';
import { HistoricalDataTable } from '../components/dataLogs/HistoricalDataTable';
import { HistoryLineChart } from '../components/dataLogs/HistoryLineChart';
import { QuickExportCard } from '../components/dataLogs/QuickExportCard';
import { ReportSummaryCard } from '../components/dataLogs/ReportSummaryCard';
import { WeeklyQualityChart } from '../components/dataLogs/WeeklyQualityChart';
import { Card, CardContent, CardHeader } from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { useDataLogsController } from '../hooks/useDataLogsController';
import StatusMessage from '../components/ui/StatusMessage';
import LoadingState from '../components/ui/LoadingState';

export default function DataLogs() {
  const dataLogs = useDataLogsController();

  if (dataLogs.loading) {
    return <LoadingState label="Loading data logs..." />;
  }

  if (dataLogs.error && dataLogs.aquariums.length === 0) {
    return (
      <StatusMessage variant="error">{dataLogs.error}</StatusMessage>
    );
  }

  if (dataLogs.aquariums.length === 0) {
    return (
      <Card>
        <EmptyState icon={BarChart3} message={dataLogs.emptyMessage} />
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

      <QuickExportCard
        disabled={!dataLogs.selectedAquarium || dataLogs.exportEntries.length === 0}
        onExportCsv={dataLogs.actions.exportCsv}
        onGenerateReport={dataLogs.actions.generateReport}
      />

      {dataLogs.error ? (
        <StatusMessage variant="error">{dataLogs.error}</StatusMessage>
      ) : null}

      {dataLogs.liveDataError ? (
        <StatusMessage variant="warning">{dataLogs.liveDataError}</StatusMessage>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
              <Thermometer className="h-5 w-5 text-orange-400" />
              Temperature History
            </h3>
          </CardHeader>
          <CardContent>
            <HistoryLineChart
              data={dataLogs.temperatureChartData}
              color="#f97316"
              label={dataLogs.chartRangeLabel}
              unit="°C"
              emptyMessage="No logged readings for this range yet."
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="flex items-center gap-2 text-base font-semibold text-white">
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                <Waves className="h-5 w-5 text-emerald-400" />
                Water Purity (TDS Level)
              </h3>
            </CardHeader>
            <CardContent>
              <WeeklyQualityChart
                data={dataLogs.weeklyQualityData}
                emptyMessage="No water purity (TDS) history available yet."
                barClassName="bg-emerald-500"
              />
            </CardContent>
          </Card>

          <ReportSummaryCard summaryItems={dataLogs.summaryItems} />
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
