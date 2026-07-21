import { type ComponentType, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  CheckCircle,
  ChevronDown,
  Clock,
  Droplets,
  RefreshCw,
  Thermometer,
  Waves,
  X,
  Zap,
} from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import { useAlertsScreen } from '../hooks/useAlertsScreen';
import { mobileTheme } from '../theme';
import type {
  AlertCategory,
  AlertSeverityFilter,
  AlertStatusFilter,
  AquariumAlert,
} from '../types/alerts';
import { getAlertStatus } from '../utils/alertsHelpers';

const RefreshIcon = RefreshCw as ComponentType<any>;
const BellIcon = Bell as ComponentType<any>;
const AlertCircleIcon = AlertCircle as ComponentType<any>;
const AlertTriangleIcon = AlertTriangle as ComponentType<any>;
const CheckCircleIcon = CheckCircle as ComponentType<any>;
const ClockIcon = Clock as ComponentType<any>;
const ChevronDownIcon = ChevronDown as ComponentType<any>;
const CloseIcon = X as ComponentType<any>;

const severityFilters: Array<{ key: AlertSeverityFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warning' },
];

const statusFilters: Array<{ key: AlertStatusFilter; label: string }> = [
  { key: 'active', label: 'Active' },
  { key: 'acknowledged', label: 'Acknowledged' },
  { key: 'resolved', label: 'Resolved' },
  { key: 'all', label: 'All status' },
];

export default function AlertsScreen() {
  const alerts = useAlertsScreen();
  const [aquariumPickerOpen, setAquariumPickerOpen] = useState(false);

  if (alerts.loading) {
    return (
      <SectionCard title="Alerts" subtitle="Loading live alert conditions.">
        <View style={styles.centerState}>
          <ActivityIndicator color={mobileTheme.colors.accent} />
          <Text style={styles.mutedText}>Loading alerts...</Text>
        </View>
      </SectionCard>
    );
  }

  if (alerts.error && alerts.aquariums.length === 0) {
    return (
      <SectionCard title="Alerts unavailable" subtitle={alerts.error}>
        <Pressable onPress={alerts.actions.loadAlertsData} style={styles.refreshButton}>
          <RefreshIcon size={16} stroke={mobileTheme.colors.text} />
          <Text style={styles.refreshLabel}>Retry</Text>
        </Pressable>
      </SectionCard>
    );
  }

  if (alerts.aquariums.length === 0) {
    return (
      <SectionCard
        title="No alerts yet"
        subtitle={
          alerts.userRole === 'Admin'
            ? 'No aquarium records are available yet.'
            : 'You do not have any aquariums to monitor alerts for yet.'
        }
      >
        <View style={styles.emptyPanel}>
          <BellIcon size={22} stroke={mobileTheme.colors.accent} />
          <Text style={styles.emptyText}>Alerts will appear here when a tank needs attention.</Text>
        </View>
      </SectionCard>
    );
  }

  return (
    <View style={styles.stack}>
      {alerts.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{alerts.error}</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => setAquariumPickerOpen(true)}
        style={({ pressed }) => [
          styles.aquariumBanner,
          alerts.selectedAquarium ? styles.aquariumBannerLive : styles.aquariumBannerWarn,
          pressed && styles.pressed,
        ]}
      >
        <View style={styles.aquariumBannerCopy}>
          <Text style={styles.aquariumBannerLabel}>Selected aquarium</Text>
          <Text style={styles.aquariumBannerTitle} numberOfLines={1}>
            {alerts.selectedAquarium ? alerts.selectedAquarium.name : 'Choose an aquarium'}
          </Text>
          <Text style={styles.aquariumBannerMeta} numberOfLines={1}>Tap to switch tanks</Text>
        </View>
        <View style={styles.aquariumBannerAction}>
          <ChevronDownIcon size={16} stroke={mobileTheme.colors.textMuted} />
        </View>
      </Pressable>

      <View style={styles.summaryGrid}>
        <SummaryTile
          icon={AlertCircleIcon}
          label="Critical"
          tone="critical"
          value={String(alerts.summaryCounts.criticalCount)}
        />
        <SummaryTile
          icon={AlertTriangleIcon}
          label="Warning"
          tone="warning"
          value={String(alerts.summaryCounts.warningCount)}
        />
        <SummaryTile
          icon={ClockIcon}
          label="Acknowledged"
          tone="accent"
          value={String(alerts.summaryCounts.acknowledgedCount)}
        />
        <SummaryTile
          icon={CheckCircleIcon}
          label="Resolved"
          tone="success"
          value={String(alerts.summaryCounts.resolvedCount)}
        />
      </View>

      <SectionCard
        title="Filters"
        subtitle="Narrow the same live alert list used by the web app."
        action={
          <Pressable onPress={alerts.actions.loadAlertsData} style={styles.sectionAction}>
            <RefreshIcon size={14} stroke={mobileTheme.colors.text} />
            <Text style={styles.sectionActionText}>Refresh</Text>
          </Pressable>
        }
      >
        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Severity</Text>
          <View style={styles.filterRow}>
            {severityFilters.map((filter) => (
              <FilterChip
                key={filter.key}
                active={alerts.selectedSeverity === filter.key}
                label={filter.label}
                onPress={() => alerts.actions.selectSeverity(filter.key)}
              />
            ))}
          </View>
        </View>

        <View style={styles.filterGroup}>
          <Text style={styles.filterLabel}>Status</Text>
          <View style={styles.filterRow}>
            {statusFilters.map((filter) => (
              <FilterChip
                key={filter.key}
                active={alerts.selectedStatus === filter.key}
                label={filter.label}
                onPress={() => alerts.actions.selectStatus(filter.key)}
              />
            ))}
          </View>
        </View>
      </SectionCard>

      <SectionCard
        title={alerts.panelTitle}
        subtitle={`${alerts.openAlertCount} open alert${alerts.openAlertCount === 1 ? '' : 's'}${
          alerts.selectedAquarium ? ` • Viewing ${alerts.selectedAquarium.name}` : ''
        }`}
      >
        {alerts.filteredAlerts.length === 0 ? (
          <View style={styles.emptyPanel}>
            <BellIcon size={22} stroke={mobileTheme.colors.textMuted} />
            <Text style={styles.emptyText}>No alerts match the current filters.</Text>
          </View>
        ) : (
          <View style={styles.alertList}>
            {alerts.filteredAlerts.map((alert) => (
              <AlertRow
                key={alert.id}
                alert={alert}
                expanded={alerts.selectedAlertId === alert.id}
                timeLabel={alerts.formatAlertTimestamp(alert)}
                onAcknowledge={() => alerts.actions.acknowledgeAlert(alert.id)}
                onToggle={() => alerts.actions.toggleSelectedAlert(alert.id)}
              />
            ))}
          </View>
        )}
      </SectionCard>

      <SectionCard title="Insights" subtitle="A quick look at breakdowns and recent recoveries.">
        <View style={styles.insightStack}>
          <View style={styles.insightBlock}>
            <Text style={styles.insightTitle}>Alert Distribution</Text>
            <View style={styles.distributionList}>
              {alerts.distribution.map((item) => (
                <View key={item.key} style={styles.distributionRow}>
                  <View style={styles.distributionLeft}>
                    <CategoryIcon category={item.key} />
                    <Text style={styles.distributionLabel}>{item.label}</Text>
                  </View>
                  <Text style={styles.distributionValue}>{item.count}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={styles.insightBlock}>
            <Text style={styles.insightTitle}>Recently Resolved</Text>
            {alerts.recentResolvedAlerts.length === 0 ? (
              <Text style={styles.emptyInlineText}>No resolved alerts yet.</Text>
            ) : (
              <View style={styles.resolvedList}>
                {alerts.recentResolvedAlerts.map((alert) => (
                  <View key={alert.id} style={styles.resolvedRow}>
                    <CheckCircleIcon size={16} stroke={mobileTheme.colors.success} />
                    <View style={styles.resolvedCopy}>
                      <Text style={styles.resolvedTitle}>{alert.tankName}</Text>
                      <Text style={styles.resolvedMeta}>{alerts.formatAlertTimestamp(alert)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      </SectionCard>

      <Modal
        animationType="fade"
        onRequestClose={() => setAquariumPickerOpen(false)}
        transparent
        visible={aquariumPickerOpen}
      >
        <View style={styles.pickerOverlay}>
          <Pressable style={styles.pickerBackdrop} onPress={() => setAquariumPickerOpen(false)} />
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHeader}>
              <View>
                <Text style={styles.pickerTitle}>Choose aquarium</Text>
                <Text style={styles.pickerSubtitle}>Switch alerts to another tank.</Text>
              </View>
              <Pressable
                onPress={() => setAquariumPickerOpen(false)}
                style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
              >
                <CloseIcon size={16} stroke={mobileTheme.colors.textMuted} />
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.pickerList} showsVerticalScrollIndicator={false}>
              {alerts.aquariums.map((aquarium) => {
                const active = alerts.selectedAquariumId === aquarium.id;

                return (
                  <Pressable
                    key={aquarium.id}
                    onPress={() => {
                      alerts.actions.selectAquarium(aquarium.id);
                      setAquariumPickerOpen(false);
                    }}
                    style={({ pressed }) => [
                      styles.pickerItem,
                      active && styles.pickerItemActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.pickerItemCopy}>
                      <Text
                        style={[styles.pickerItemTitle, active && styles.pickerItemTitleActive]}
                        numberOfLines={1}
                      >
                        {aquarium.name}
                      </Text>
                    </View>
                    <View style={[styles.pickerDot, active && styles.pickerDotActive]} />
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

type SummaryTileProps = {
  icon: ComponentType<any>;
  label: string;
  value: string;
  tone: 'critical' | 'warning' | 'accent' | 'success';
};

function SummaryTile({ icon: Icon, label, value, tone }: SummaryTileProps) {
  return (
    <View
      style={[
        styles.summaryTile,
        tone === 'critical' && styles.summaryCritical,
        tone === 'warning' && styles.summaryWarning,
        tone === 'accent' && styles.summaryAccent,
        tone === 'success' && styles.summarySuccess,
      ]}
    >
      <View style={styles.summaryHeader}>
        <Icon
          size={15}
          stroke={
            tone === 'critical'
              ? mobileTheme.colors.danger
              : tone === 'warning'
                ? mobileTheme.colors.warning
                : tone === 'success'
                  ? mobileTheme.colors.success
                  : mobileTheme.colors.accent
          }
        />
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

type AlertRowProps = {
  alert: AquariumAlert;
  expanded: boolean;
  timeLabel: string;
  onAcknowledge: () => void;
  onToggle: () => void;
};

function AlertRow({ alert, expanded, timeLabel, onAcknowledge, onToggle }: AlertRowProps) {
  const status = getAlertStatus(alert);
  const isCritical = alert.type === 'critical';
  const canAcknowledge = status === 'active';

  return (
    <Pressable onPress={onToggle} style={styles.alertItem}>
      <View style={styles.alertHeader}>
        <View style={styles.alertTitleBlock}>
          <View style={styles.alertTitleRow}>
            {isCritical ? (
              <AlertCircleIcon size={16} stroke={mobileTheme.colors.danger} />
            ) : (
              <AlertTriangleIcon size={16} stroke={mobileTheme.colors.warning} />
            )}
            <Text style={styles.alertTitle} numberOfLines={1}>
              {alert.tankName}
            </Text>
          </View>
          <Text style={styles.alertMeta} numberOfLines={1}>
            {alert.ownerName || 'Unknown owner'} • {formatCategory(alert.category)}
          </Text>
        </View>

        <View
          style={[
            styles.statusBadge,
            status === 'active' && (isCritical ? styles.statusCritical : styles.statusWarning),
            status === 'acknowledged' && styles.statusAcknowledged,
            status === 'resolved' && styles.statusResolved,
          ]}
        >
          <Text style={styles.statusBadgeText}>{formatStatus(status, alert.type)}</Text>
        </View>
      </View>

      <Text style={styles.alertMessage} numberOfLines={expanded ? undefined : 1}>
        {alert.message}
      </Text>

      <View style={styles.alertFooter}>
        <Text style={styles.alertTime}>{timeLabel}</Text>
        {canAcknowledge ? (
          <Pressable onPress={onAcknowledge} style={styles.ackButton}>
            <Text style={styles.ackButtonText}>Acknowledge</Text>
          </Pressable>
        ) : null}
      </View>
    </Pressable>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function CategoryIcon({ category }: { category: AlertCategory }) {
  const Icon =
    category === 'temperature'
      ? Thermometer
      : category === 'water_level'
        ? Droplets
        : category === 'water_quality'
          ? Waves
          : Zap;
  const Category = Icon as ComponentType<any>;

  return <Category size={16} stroke={mobileTheme.colors.accent} />;
}

function formatCategory(category: AlertCategory) {
  if (category === 'temperature') return 'Temperature';
  if (category === 'water_level') return 'Water Level';
  if (category === 'water_quality') return 'Water Purity';
  return 'System';
}

function formatStatus(status: ReturnType<typeof getAlertStatus>, type: AquariumAlert['type']) {
  if (status === 'resolved') return 'Resolved';
  if (status === 'acknowledged') return 'Acknowledged';
  return type === 'critical' ? 'Critical' : 'Warning';
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
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 19,
  },
  emptyInlineText: {
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
  errorText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
  },
  warningBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
    padding: 12,
  },
  warningText: {
    color: mobileTheme.colors.warning,
    fontSize: 13,
    lineHeight: 18,
  },
  aquariumBanner: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  aquariumBannerLive: {
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
  },
  aquariumBannerWarn: {
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  aquariumBannerCopy: {
    flex: 1,
    gap: 3,
  },
  aquariumBannerLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  aquariumBannerTitle: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  aquariumBannerMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  aquariumBannerAction: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  iconButton: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.surfaceAlt,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryTile: {
    flexGrow: 1,
    minWidth: '46%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 13,
    gap: 8,
  },
  summaryCritical: {
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
  },
  summaryWarning: {
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  summaryAccent: {
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  summarySuccess: {
    backgroundColor: mobileTheme.colors.successSoft,
    borderColor: mobileTheme.colors.successBorder,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  summaryLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  summaryValue: {
    color: mobileTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
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
  filterGroup: {
    gap: 8,
  },
  filterLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  filterChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  filterChipText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  filterChipTextActive: {
    color: mobileTheme.colors.text,
  },
  alertList: {
    gap: 12,
  },
  alertItem: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 14,
    gap: 10,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  alertTitleBlock: {
    flex: 1,
    gap: 4,
  },
  alertTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  alertTitle: {
    color: mobileTheme.colors.text,
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
  },
  alertMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  statusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusCritical: {
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
  },
  statusWarning: {
    borderColor: mobileTheme.colors.warningBorder,
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  statusAcknowledged: {
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  statusResolved: {
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
  },
  statusBadgeText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  alertMessage: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
  },
  alertFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  alertTime: {
    color: mobileTheme.colors.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
  },
  ackButton: {
    minHeight: 38,
    borderRadius: 12,
    backgroundColor: mobileTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  ackButtonText: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  distributionList: {
    gap: 10,
  },
  distributionRow: {
    minHeight: 46,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  distributionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 8,
  },
  distributionLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  distributionValue: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  resolvedList: {
    gap: 10,
  },
  insightStack: {
    gap: 14,
  },
  insightBlock: {
    gap: 10,
  },
  insightTitle: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 18,
  },
  pickerBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mobileTheme.colors.overlay,
  },
  pickerSheet: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.background,
    overflow: 'hidden',
  },
  pickerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  pickerTitle: {
    color: mobileTheme.colors.text,
    fontSize: 17,
    fontWeight: '800',
  },
  pickerSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  pickerList: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    gap: 10,
  },
  pickerItem: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  pickerItemActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  pickerItemCopy: {
    flex: 1,
    gap: 2,
  },
  pickerItemTitle: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  pickerItemTitleActive: {
    color: mobileTheme.colors.text,
  },
  pickerItemMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  pickerDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
  },
  pickerDotActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accent,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
    opacity: 0.92,
  },
  resolvedRow: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resolvedCopy: {
    flex: 1,
    gap: 2,
  },
  resolvedTitle: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  resolvedMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
  },
});


