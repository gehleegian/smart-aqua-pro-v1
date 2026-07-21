import { useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, ChevronLeft, ChevronRight, Droplets, RefreshCw, Thermometer, Waves } from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import { useDataLogsScreen } from '../hooks/useDataLogsScreen';
import { mobileTheme } from '../theme';
import type { PeriodKey } from '../types/dataLogs';
import { formatDateKey, formatTimeLabel, parseDateKey } from '../utils/dataLogsHelpers';
import { getTelemetryPurityPercent, getTelemetryTdsPpm } from '../types/device';
import { formatTdsReading, getPurityTone } from '../utils/monitoringHelpers';

const RefreshIcon = RefreshCw as ComponentType<any>;
const ThermometerIcon = Thermometer as ComponentType<any>;
const DropletsIcon = Droplets as ComponentType<any>;
const WavesIcon = Waves as ComponentType<any>;
const CalendarIcon = CalendarDays as ComponentType<any>;
const ChevronLeftIcon = ChevronLeft as ComponentType<any>;
const ChevronRightIcon = ChevronRight as ComponentType<any>;

const periodOptions: PeriodKey[] = ['24h', '7d', '30d', '90d'];

export default function DataLogsScreen() {
  const dataLogs = useDataLogsScreen();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const liveTdsPpm = getTelemetryTdsPpm(dataLogs.liveShadow?.telemetry);
  const livePurityTone = getPurityTone(
    getTelemetryPurityPercent(dataLogs.liveShadow?.telemetry),
    liveTdsPpm,
    dataLogs.selectedAquarium?.minQuality
  );

  if (dataLogs.loading) {
    return (
      <SectionCard title="Data Logs" subtitle="Loading telemetry history.">
        <View style={styles.centerState}>
          <ActivityIndicator color={mobileTheme.colors.accent} />
          <Text style={styles.mutedText}>Loading data logs...</Text>
        </View>
      </SectionCard>
    );
  }

  if (dataLogs.error && dataLogs.aquariums.length === 0) {
    return (
      <SectionCard title="Data logs unavailable" subtitle={dataLogs.error}>
        <Pressable onPress={dataLogs.actions.loadPageData} style={styles.refreshButton}>
          <RefreshIcon size={16} stroke={mobileTheme.colors.text} />
          <Text style={styles.refreshLabel}>Retry</Text>
        </Pressable>
      </SectionCard>
    );
  }

  if (dataLogs.aquariums.length === 0) {
    return (
      <SectionCard title="No aquariums yet" subtitle={dataLogs.emptyMessage}>
        <View style={styles.emptyPanel}>
          <ThermometerIcon size={22} stroke={mobileTheme.colors.accent} />
          <Text style={styles.emptyText}>Logs will appear after a tank starts sending history.</Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <View style={styles.stack}>
      {dataLogs.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{dataLogs.error}</Text>
        </View>
      ) : null}

      {dataLogs.liveDataError ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningText}>{dataLogs.liveDataError}</Text>
        </View>
      ) : null}

      {dataLogs.reportMessage ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{dataLogs.reportMessage}</Text>
        </View>
      ) : null}

      <SectionCard
        title="Controls"
        subtitle="Pick an aquarium, date, and time window."
        action={
          <Pressable onPress={dataLogs.actions.loadPageData} style={styles.sectionAction}>
            <RefreshIcon size={14} stroke={mobileTheme.colors.text} />
            <Text style={styles.sectionActionText}>Refresh</Text>
          </Pressable>
        }
      >
        <View style={styles.aquariumRow}>
          {dataLogs.aquariums.map((aquarium) => (
            <Pressable
              key={aquarium.id}
              onPress={() => dataLogs.actions.selectAquarium(aquarium.id)}
              style={[
                styles.aquariumChip,
                aquarium.id === dataLogs.selectedAquariumId && styles.aquariumChipActive,
              ]}
            >
              <Text
                style={[
                  styles.aquariumChipText,
                  aquarium.id === dataLogs.selectedAquariumId && styles.aquariumChipTextActive,
                ]}
                numberOfLines={1}
              >
                {aquarium.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.inlineRow}>
          <View style={styles.dateField}>
            <Text style={styles.fieldLabel}>Selected Date</Text>
            <View style={styles.dateInputRow}>
              <TextInput
                editable={false}
                value={formatDateDisplay(dataLogs.selectedDate)}
                placeholder="MM/DD/YYYY"
                placeholderTextColor={mobileTheme.colors.textMuted}
                style={styles.dateInput}
              />
              <Pressable onPress={() => setCalendarOpen(true)} style={styles.calendarButton}>
                <CalendarIcon size={17} stroke={mobileTheme.colors.text} />
              </Pressable>
            </View>
          </View>
          <View style={styles.periodWrap}>
            <Text style={styles.fieldLabel}>Range</Text>
            <View style={styles.periodRow}>
              {periodOptions.map((period) => (
                <Pressable
                  key={period}
                  onPress={() => dataLogs.actions.setTimePeriod(period)}
                  style={[
                    styles.periodChip,
                    dataLogs.timePeriod === period && styles.periodChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.periodText,
                      dataLogs.timePeriod === period && styles.periodTextActive,
                    ]}
                  >
                    {period}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>
      </SectionCard>

      <View style={styles.summaryGrid}>
        {dataLogs.summaryItems.map((item) => (
          <View key={item.label} style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>{item.label}</Text>
            <Text style={styles.summaryValue}>{item.value}</Text>
          </View>
        ))}
      </View>

      <SectionCard title="Trend Preview" subtitle={dataLogs.chartRangeLabel}>
        <View style={styles.chartStack}>
          <MetricChart
            color={mobileTheme.colors.accent}
            data={dataLogs.temperatureChartData}
            icon={ThermometerIcon}
            label="Temperature"
            unit=" C"
          />
          <MetricChart
            color="#7dd3fc"
            data={dataLogs.waterLevelChartData}
            icon={DropletsIcon}
            label="Water Level"
            unit="%"
          />
          <MetricChart
            color="#34d399"
            data={dataLogs.weeklyQualityData}
            getPointColor={getTdsChartColor}
            icon={WavesIcon}
            label="TDS"
            unit=" ppm"
          />
        </View>
      </SectionCard>

      <SectionCard
        title="History Table"
        subtitle={dataLogs.selectedAquarium ? dataLogs.selectedAquarium.name : 'Select an aquarium to view its entries.'}
        action={
          <Pressable onPress={dataLogs.actions.generateReport} style={styles.sectionAction}>
            <Text style={styles.sectionActionText}>Save Report</Text>
          </Pressable>
        }
      >
        {dataLogs.historyLoading ? (
          <Text style={styles.loadingText}>Loading history...</Text>
        ) : dataLogs.tableEntries.length === 0 ? (
          <Text style={styles.emptyText}>{dataLogs.historicalTableEmptyMessage}</Text>
        ) : (
          <View style={styles.table}>
            {dataLogs.tableEntries
              .slice()
              .reverse()
              .map((entry) => {
                const tdsPpm = getTelemetryTdsPpm(entry);
                const purityTone = getPurityTone(
                  getTelemetryPurityPercent(entry),
                  tdsPpm,
                  dataLogs.selectedAquarium?.minQuality
                );

                return (
                  <View
                    key={entry.recordedAtEpoch}
                    style={[
                      styles.tableRow,
                      purityTone === 'danger' && styles.tableRowDanger,
                    ]}
                  >
                    <Text style={styles.timeCell}>{formatTimeLabel(entry.recordedAtEpoch)}</Text>
                    <Text style={styles.tableCell}>{entry.temperatureC.toFixed(1)} C</Text>
                    <Text style={styles.tableCell}>{entry.waterLevelPercent.toFixed(0)}%</Text>
                    <Text
                      style={[
                        styles.tableCell,
                        purityTone === 'warning' && styles.tableCellWarning,
                        purityTone === 'danger' && styles.tableCellDanger,
                      ]}
                    >
                      {formatTdsReading(tdsPpm)}
                    </Text>
                  </View>
                );
              })}
          </View>
        )}
      </SectionCard>

      {dataLogs.selectedAquarium ? (
        <SectionCard title="Live Snapshot" subtitle="The current device shadow for the selected aquarium.">
          <View style={styles.snapshotGrid}>
            <SnapshotTile
              label="Temp"
              value={dataLogs.liveShadow?.telemetry?.temperatureC?.toFixed(1) || '--'}
            />
            <SnapshotTile
              label="Level"
              value={dataLogs.liveShadow?.telemetry?.waterLevelPercent?.toFixed(0) || '--'}
            />
            <SnapshotTile
              label="TDS"
              tone={livePurityTone === 'success' ? undefined : livePurityTone}
              value={formatTdsReading(liveTdsPpm)}
            />
          </View>
        </SectionCard>
      ) : null}

      <CalendarModal
        selectedDate={dataLogs.selectedDate}
        visible={calendarOpen}
        onClose={() => setCalendarOpen(false)}
        onSelectDate={(dateKey) => {
          dataLogs.actions.setSelectedDate(dateKey);
          setCalendarOpen(false);
        }}
      />
    </View>
  );
}

type CalendarModalProps = {
  selectedDate: string;
  visible: boolean;
  onClose: () => void;
  onSelectDate: (dateKey: string) => void;
};

function CalendarModal({ selectedDate, visible, onClose, onSelectDate }: CalendarModalProps) {
  const selected = parseDateKey(selectedDate);
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(selected));

  const monthDays = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthLabel = new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(visibleMonth);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.calendarOverlay}>
        <Pressable style={styles.calendarBackdrop} onPress={onClose} />
        <View style={styles.calendarSheet}>
          <View style={styles.calendarHeader}>
            <Pressable
              onPress={() => setVisibleMonth((current) => addMonths(current, -1))}
              style={styles.calendarIconButton}
            >
              <ChevronLeftIcon size={18} stroke={mobileTheme.colors.text} />
            </Pressable>
            <Text style={styles.calendarTitle}>{monthLabel}</Text>
            <Pressable
              onPress={() => setVisibleMonth((current) => addMonths(current, 1))}
              style={styles.calendarIconButton}
            >
              <ChevronRightIcon size={18} stroke={mobileTheme.colors.text} />
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          <View style={styles.calendarGrid}>
            {monthDays.map((date) => {
              const dateKey = formatDateKey(date);
              const isSelected = dateKey === selectedDate;
              const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();

              return (
                <Pressable
                  key={dateKey}
                  onPress={() => onSelectDate(dateKey)}
                  style={[styles.dayButton, isSelected && styles.dayButtonSelected]}
                >
                  <Text
                    style={[
                      styles.dayText,
                      !isCurrentMonth && styles.dayTextOutside,
                      isSelected && styles.dayTextSelected,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.calendarFooter}>
            <Pressable onPress={onClose} style={styles.calendarFooterButton}>
              <Text style={styles.calendarFooterText}>Clear</Text>
            </Pressable>
            <Pressable onPress={() => onSelectDate(formatDateKey(new Date()))} style={styles.calendarFooterButton}>
              <Text style={styles.calendarFooterText}>Today</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function SnapshotTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: 'warning' | 'danger';
  value: string;
}) {
  return (
    <View style={styles.snapshotTile}>
      <Text style={styles.snapshotLabel}>{label}</Text>
      <Text
        style={[
          styles.snapshotValue,
          tone === 'warning' && styles.snapshotValueWarning,
          tone === 'danger' && styles.snapshotValueDanger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function MetricChart({
  label,
  unit,
  color,
  data,
  getPointColor,
  icon: Icon,
}: {
  label: string;
  unit: string;
  color: string;
  data: Array<{ label: string; value: number }>;
  getPointColor?: (value: number) => string;
  icon: ComponentType<any>;
}) {
  const points = data.slice(-8);
  const maxValue = Math.max(1, ...points.map((point) => point.value));

  return (
    <View style={styles.chartCard}>
      <View style={styles.chartHeader}>
        <View style={styles.chartTitleRow}>
          <Icon size={16} stroke={color} />
          <Text style={styles.chartTitle}>{label}</Text>
        </View>
      </View>
      <View style={styles.chartArea}>
        {points.length === 0 ? (
          <Text style={styles.emptyText}>No entries available.</Text>
        ) : (
          points.map((point) => (
            <View key={`${label}-${point.label}`} style={styles.chartBarWrap}>
              <View style={styles.chartBarTrack}>
                <View
                  style={[
                    styles.chartBarFill,
                    {
                      height: `${Math.max(8, (point.value / maxValue) * 100)}%`,
                      backgroundColor: getPointColor ? getPointColor(point.value) : color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.chartPointValue}>
                {point.value.toFixed(0)}
                {unit}
              </Text>
              <Text style={styles.chartPointLabel} numberOfLines={1}>
                {point.label}
              </Text>
            </View>
          ))
        )}
      </View>
    </View>
  );
}

function getTdsChartColor(value: number) {
  const tone = getPurityTone(undefined, value);

  if (tone === 'danger') {
    return mobileTheme.colors.danger;
  }

  if (tone === 'warning') {
    return mobileTheme.colors.warning;
  }

  return '#34d399';
}

function formatDateDisplay(dateKey: string) {
  const date = parseDateKey(dateKey);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, count: number) {
  return new Date(date.getFullYear(), date.getMonth() + count, 1);
}

function buildCalendarDays(monthDate: Date) {
  const start = startOfMonth(monthDate);
  const firstGridDate = new Date(start);
  firstGridDate.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const nextDate = new Date(firstGridDate);
    nextDate.setDate(firstGridDate.getDate() + index);
    return nextDate;
  });
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
  },
  centerState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  mutedText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  refreshButton: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  refreshLabel: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyPanel: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  emptyText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    padding: 12,
  },
  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
    padding: 12,
  },
  successBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
    padding: 12,
  },
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
  },
  warningText: {
    color: mobileTheme.colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  successText: {
    color: mobileTheme.colors.success,
    fontSize: 13,
  },
  sectionAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  sectionActionText: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  aquariumRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  aquariumChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  aquariumChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  aquariumChipText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  aquariumChipTextActive: {
    color: mobileTheme.colors.text,
  },
  inlineRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  dateField: {
    flex: 1,
    gap: 6,
  },
  periodWrap: {
    flex: 1,
    gap: 6,
  },
  fieldLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  input: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    color: mobileTheme.colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  dateInputRow: {
    minHeight: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  dateInput: {
    flex: 1,
    minHeight: 46,
    color: mobileTheme.colors.text,
    paddingHorizontal: 14,
    fontSize: 14,
  },
  calendarButton: {
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 1,
    borderLeftColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  periodRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  periodChip: {
    flexGrow: 1,
    minWidth: '22%',
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  periodText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  periodTextActive: {
    color: mobileTheme.colors.text,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryCard: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 14,
    gap: 6,
  },
  summaryLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  summaryValue: {
    color: mobileTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  chartStack: {
    gap: 12,
  },
  chartCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 14,
    gap: 12,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  chartTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chartTitle: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  chartHint: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
  },
  chartArea: {
    minHeight: 120,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  chartBarWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  chartBarTrack: {
    height: 92,
    width: '100%',
    borderRadius: 10,
    backgroundColor: mobileTheme.colors.background,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  chartBarFill: {
    width: '100%',
    borderRadius: 10,
  },
  chartPointValue: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  chartPointLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 9,
  },
  table: {
    gap: 8,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  tableRowDanger: {
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
  },
  timeCell: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '700',
    width: 90,
  },
  tableCell: {
    flex: 1,
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  tableCellWarning: {
    color: mobileTheme.colors.warning,
  },
  tableCellDanger: {
    color: mobileTheme.colors.danger,
  },
  snapshotGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  snapshotTile: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
    gap: 4,
  },
  snapshotLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
  },
  snapshotValue: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  snapshotValueWarning: {
    color: mobileTheme.colors.warning,
  },
  snapshotValueDanger: {
    color: mobileTheme.colors.danger,
  },
  calendarOverlay: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  calendarBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.overlay,
  },
  calendarSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 16,
    gap: 14,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarIconButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  calendarTitle: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayText: {
    flex: 1,
    color: mobileTheme.colors.textMuted,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '800',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayButton: {
    width: '14.285%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  dayButtonSelected: {
    backgroundColor: mobileTheme.colors.accent,
  },
  dayText: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  dayTextOutside: {
    color: mobileTheme.colors.textMuted,
    opacity: 0.55,
  },
  dayTextSelected: {
    color: mobileTheme.colors.text,
  },
  calendarFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarFooterButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  calendarFooterText: {
    color: mobileTheme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
});
