import { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle, Clock, RefreshCw, Users } from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import StatPill from '../components/common/StatPill';
import { useDashboardScreen } from '../hooks/useDashboardScreen';
import { mobileTheme } from '../theme';

const RefreshIcon = RefreshCw as any;
const AlertIcon = AlertTriangle as any;
const ClockIcon = Clock as any;
const UsersIcon = Users as any;

export default function DashboardScreen() {
  const dashboard = useDashboardScreen();

  const liveDataWarning = dashboard.liveDataError ? (
    <View style={styles.warningBox}>
      <Text style={styles.warningText}>{dashboard.liveDataError}</Text>
    </View>
  ) : null;

  const selectedTankChips = useMemo(
    () =>
      dashboard.visibleAquariums.map((tank) => (
        <Pressable
          key={tank.id}
          onPress={() => dashboard.actions.selectTank(tank.id)}
          style={[
            styles.tankChip,
            dashboard.selectedTankId === tank.id && styles.tankChipActive,
          ]}
        >
          <Text
            style={[
              styles.tankChipText,
              dashboard.selectedTankId === tank.id && styles.tankChipTextActive,
            ]}
            numberOfLines={1}
          >
            {tank.name}
          </Text>
        </Pressable>
      )),
    [dashboard.actions, dashboard.selectedTankId, dashboard.visibleAquariums]
  );

  if (dashboard.loading) {
    return (
      <SectionCard title="Dashboard" subtitle="Loading your live overview.">
        <View style={styles.centerState}>
          <ActivityIndicator color={mobileTheme.colors.accent} />
          <Text style={styles.mutedText}>Loading dashboard data...</Text>
        </View>
      </SectionCard>
    );
  }

  if (dashboard.error && dashboard.aquariums.length === 0) {
    return (
      <SectionCard title="Dashboard unavailable" subtitle={dashboard.error}>
        <Pressable style={styles.refreshButton} onPress={dashboard.actions.loadDashboardData}>
          <RefreshIcon size={16} color={mobileTheme.colors.text} />
          <Text style={styles.refreshLabel}>Retry</Text>
        </Pressable>
      </SectionCard>
    );
  }

  if (dashboard.aquariums.length === 0) {
    return (
      <SectionCard title="No aquariums yet" subtitle={dashboard.emptyMessage}>
        <View style={styles.emptyPanel}>
          <UsersIcon size={22} color={mobileTheme.colors.accent} />
          <Text style={styles.emptyText}>Add an aquarium first to see live dashboard data.</Text>
        </View>
      </SectionCard>
    );
  }

  const selectedTank = dashboard.selectedTank;
  const stats = dashboard.stats;
  const onlineUsers = dashboard.onlineUsers;

  return (
    <View style={styles.stack}>
      {liveDataWarning}

      <View style={styles.summaryGrid}>
        {dashboard.summaryCards.map((card) => {
          const Icon = card.icon as any;
          return (
            <View key={card.title} style={[styles.summaryCard, styles[`summary${card.tone}`]]}>
              <View style={styles.summaryHeader}>
                <View style={styles.summaryIconWrap}>
                  <Icon size={16} color={mobileTheme.colors.text} />
                </View>
                <Text style={styles.summaryLabel}>{card.title}</Text>
              </View>
              <Text style={styles.summaryValue} numberOfLines={1}>
                {card.value}
              </Text>
            </View>
          );
        })}
      </View>

      {dashboard.userRole === 'Admin' ? (
        <SectionCard
          title="Online users"
          subtitle={
            onlineUsers.length > 0
              ? `${onlineUsers.length} user${onlineUsers.length === 1 ? '' : 's'} currently online.`
              : 'No users are online right now.'
          }
        >
          <View style={styles.onlineUserGrid}>
            {onlineUsers.length === 0 ? (
              <Text style={styles.emptyText}>No online users.</Text>
            ) : (
              onlineUsers.map((user) => (
                <View key={user.id || user.email} style={styles.onlineUserChip}>
                  <View style={styles.onlineUserDot} />
                  <View style={styles.onlineUserCopy}>
                    <Text style={styles.onlineUserName} numberOfLines={1}>
                      {user.name}
                    </Text>
                    <Text style={styles.onlineUserRole}>{user.role}</Text>
                  </View>
                </View>
              ))
            )}
          </View>
        </SectionCard>
      ) : null}

      <SectionCard
        title={dashboard.userRole === 'Admin' ? 'Owners and Tanks' : 'My Aquariums'}
        subtitle={
          dashboard.userRole === 'Admin'
            ? 'Choose an owner, then pick a tank to inspect its live readings.'
            : 'Choose a tank to inspect its live readings.'
        }
        action={
          <Pressable onPress={dashboard.actions.loadDashboardData} style={styles.sectionAction}>
            <RefreshIcon size={14} color={mobileTheme.colors.text} />
            <Text style={styles.sectionActionText}>Refresh</Text>
          </Pressable>
        }
      >
        {dashboard.userRole === 'Admin' && dashboard.ownerGroups.length > 0 ? (
          <View style={styles.ownerWrap}>
            {dashboard.ownerGroups.map((group) => (
              <Pressable
                key={group.ownerId || group.ownerName}
                onPress={() => dashboard.actions.selectOwner(group.ownerId)}
                style={[
                  styles.ownerChip,
                  dashboard.selectedOwnerId === group.ownerId && styles.ownerChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.ownerChipText,
                    dashboard.selectedOwnerId === group.ownerId && styles.ownerChipTextActive,
                  ]}
                  numberOfLines={1}
                >
                  {group.ownerName}
                </Text>
                <Text style={styles.ownerChipMeta}>{group.aquariums.length}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <View style={styles.tankChipRow}>{selectedTankChips}</View>
      </SectionCard>

      {selectedTank ? (
        <SectionCard
          title={selectedTank.name}
          subtitle={selectedTank.ownerName ? `Owner: ${selectedTank.ownerName}` : 'Live aquarium snapshot'}
        >
          <View style={styles.statusRow}>
            <StatusBadge
              icon={selectedTank.hasFreshTelemetry ? UsersIcon : AlertIcon}
              label={selectedTank.hasFreshTelemetry ? 'Live data' : 'No live data'}
              tone={selectedTank.hasFreshTelemetry ? 'success' : 'warning'}
            />
            <StatusBadge
              icon={AlertIcon}
              label={selectedTank.status === 'healthy' ? 'Healthy' : 'Needs attention'}
              tone={selectedTank.status === 'healthy' ? 'success' : 'warning'}
            />
          </View>

          <View style={styles.statsGrid}>
            {stats.map((stat) => (
              <MetricCard key={stat.title} stat={stat} />
            ))}
          </View>

          {!selectedTank.hasFreshTelemetry ? (
            <Text style={styles.helperText}>{selectedTank.telemetryState === 'offline'
              ? 'Device offline'
              : 'No live telemetry yet'}</Text>
          ) : null}
        </SectionCard>
      ) : null}

      <View style={styles.bottomGrid}>
        <DashboardMessageList
          title={dashboard.userRole === 'Admin' ? 'System Alerts' : 'My Alerts'}
          icon={AlertIcon}
          iconTone="warning"
          items={dashboard.alerts}
        />
        <DashboardMessageList
          title={dashboard.userRole === 'Admin' ? 'System Activity' : 'My Recent Activity'}
          icon={ClockIcon}
          iconTone="accent"
          items={dashboard.activities}
        />
      </View>
    </View>
  );
}

function MetricCard({ stat }: { stat: { title: string; value: string; change: string; trend: string } }) {
  const tone = stat.trend === 'good' ? 'success' : 'warning';

  return (
    <View style={styles.metricCard}>
      <StatPill label={stat.title} value={stat.value} tone={tone as 'success' | 'warning'} />
      <Text style={styles.metricChange}>{stat.change}</Text>
    </View>
  );
}

function StatusBadge({
  icon: Icon,
  label,
  tone,
}: {
  icon: any;
  label: string;
  tone: 'success' | 'warning';
}) {
  return (
    <View style={[styles.statusBadge, tone === 'success' ? styles.statusSuccess : styles.statusWarning]}>
      <Icon size={14} color={mobileTheme.colors.text} />
      <Text style={styles.statusText}>{label}</Text>
    </View>
  );
}

function DashboardMessageList({
  title,
  icon: Icon,
  iconTone,
  items,
}: {
  title: string;
  icon: any;
  iconTone: 'accent' | 'warning';
  items: string[];
}) {
  return (
    <SectionCard title={title} subtitle={items.length > 0 ? 'Live summary cards.' : 'Nothing to show yet.'}>
      <View style={styles.messageList}>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>No items to show.</Text>
        ) : (
          items.map((item, index) => (
            <View key={`${title}-${index}`} style={styles.messageRow}>
              <Icon
                size={14}
                color={iconTone === 'accent' ? mobileTheme.colors.accent : mobileTheme.colors.warning}
              />
              <Text style={styles.messageText}>{item}</Text>
            </View>
          ))
        )}
      </View>
    </SectionCard>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
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
    padding: 12,
    gap: 8,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  summaryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  summaryLabel: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    flex: 1,
  },
  summaryValue: {
    color: mobileTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  summaryaccent: {
    backgroundColor: mobileTheme.colors.surface,
  },
  summarysuccess: {
    backgroundColor: mobileTheme.colors.surface,
  },
  summarywarning: {
    backgroundColor: mobileTheme.colors.surface,
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
  ownerWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  ownerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ownerChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  ownerChipText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  ownerChipTextActive: {
    color: mobileTheme.colors.text,
  },
  ownerChipMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
  },
  tankChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tankChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  tankChipActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  tankChipText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  tankChipTextActive: {
    color: mobileTheme.colors.text,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusSuccess: {
    backgroundColor: mobileTheme.colors.successSoft,
  },
  statusWarning: {
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  statusText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  statsGrid: {
    gap: 10,
  },
  metricCard: {
    gap: 6,
  },
  metricChange: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    paddingHorizontal: 2,
  },
  helperText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  bottomGrid: {
    gap: 16,
  },
  messageList: {
    gap: 10,
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  messageText: {
    flex: 1,
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  centerState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 120,
  },
  mutedText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: mobileTheme.colors.accent,
  },
  refreshLabel: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  emptyPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 120,
  },
  emptyText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  onlineUserGrid: {
    gap: 10,
  },
  onlineUserChip: {
    minHeight: 52,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  onlineUserDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.success,
  },
  onlineUserCopy: {
    flex: 1,
    minWidth: 0,
  },
  onlineUserName: {
    color: mobileTheme.colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  onlineUserRole: {
    color: mobileTheme.colors.textMuted,
    fontSize: 11,
    marginTop: 1,
  },
});
