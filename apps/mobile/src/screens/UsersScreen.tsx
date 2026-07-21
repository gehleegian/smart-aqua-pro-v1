import { type ComponentType } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { RefreshCw, Search, Shield, Trash2, User, Users, Wifi } from 'lucide-react-native';
import SectionCard from '../components/common/SectionCard';
import { useUsersScreen } from '../hooks/useUsersScreen';
import { mobileTheme } from '../theme';

const RefreshIcon = RefreshCw as ComponentType<any>;
const SearchIcon = Search as ComponentType<any>;
const UsersIcon = Users as ComponentType<any>;
const WifiIcon = Wifi as ComponentType<any>;
const ShieldIcon = Shield as ComponentType<any>;
const UserIcon = User as ComponentType<any>;
const TrashIcon = Trash2 as ComponentType<any>;

export default function UsersScreen() {
  const users = useUsersScreen();

  return (
    <View style={styles.stack}>
      {users.error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{users.error}</Text>
        </View>
      ) : null}

      {users.success ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>{users.success}</Text>
        </View>
      ) : null}

      <SectionCard
        title="User Management"
        subtitle="Admins can change roles and remove non-admin accounts."
        action={
          <Pressable onPress={users.actions.refresh} style={styles.refreshButton}>
            <RefreshIcon size={14} stroke={mobileTheme.colors.text} />
            <Text style={styles.refreshLabel}>Refresh</Text>
          </Pressable>
        }
      >
        <View style={styles.summaryGrid}>
          <SummaryTile label="Total Users" value={`${users.users.length}`} icon={UsersIcon} />
          <SummaryTile label="Online" value={`${users.onlineUsers.length}`} icon={WifiIcon} accent />
          <SummaryTile label="Admins" value={`${users.adminUsers.length}`} icon={ShieldIcon} />
          <SummaryTile label="Offline" value={`${users.offlineUsers.length}`} icon={UserIcon} warning />
        </View>
      </SectionCard>

      <SectionCard title="Filters" subtitle="Search by name or email, then narrow by role.">
        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <SearchIcon size={16} stroke={mobileTheme.colors.textMuted} />
            <TextInput
              placeholder="Search users"
              placeholderTextColor={mobileTheme.colors.textMuted}
              value={users.searchQuery}
              onChangeText={users.actions.setSearchQuery}
              style={styles.searchInput}
            />
          </View>
        </View>

        <View style={styles.filterRow}>
          {(['all', 'Admin', 'User'] as const).map((item) => (
            <Pressable
              key={item}
              onPress={() => users.actions.setRoleFilter(item)}
              style={[
                styles.filterChip,
                users.roleFilter === item && styles.filterChipActive,
              ]}
            >
              <Text
                style={[
                  styles.filterChipText,
                  users.roleFilter === item && styles.filterChipTextActive,
                ]}
              >
                {item === 'all' ? 'All Roles' : item}
              </Text>
            </Pressable>
          ))}
        </View>
      </SectionCard>

      {users.loading ? (
        <SectionCard title="Users" subtitle="Loading user accounts.">
          <View style={styles.centerState}>
            <ActivityIndicator color={mobileTheme.colors.accent} />
            <Text style={styles.loadingText}>Loading users...</Text>
          </View>
        </SectionCard>
      ) : users.filteredUsers.length === 0 ? (
        <SectionCard title="Users" subtitle="No users match the current filters.">
          <Text style={styles.emptyText}>No users found.</Text>
        </SectionCard>
      ) : (
        <View style={styles.list}>
          {users.filteredUsers.map((user) => (
            <UserCard
              key={user.id || user.email}
              deleting={users.deletingId === user.id}
              saving={users.savingId === user.id}
              user={user}
              onDelete={() => users.actions.deleteUser(user)}
              onRoleChange={(role) => users.actions.changeRole(user, role)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  accent = false,
  warning = false,
}: {
  label: string;
  value: string;
  icon: ComponentType<any>;
  accent?: boolean;
  warning?: boolean;
}) {
  return (
    <View style={styles.summaryTile}>
      <View style={[styles.summaryIcon, accent && styles.summaryIconAccent, warning && styles.summaryIconWarning]}>
        <Icon size={15} stroke={mobileTheme.colors.text} />
      </View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

function UserCard({
  user,
  saving,
  deleting,
  onRoleChange,
  onDelete,
}: {
  user: {
    id?: string;
    name: string;
    email: string;
    role: 'Admin' | 'User';
    status?: 'online' | 'offline';
    contactNumber?: string;
  };
  saving: boolean;
  deleting: boolean;
  onRoleChange: (role: 'Admin' | 'User') => void;
  onDelete: () => void;
}) {
  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const protectedUser = user.role === 'Admin';

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials || 'U'}</Text>
        </View>
        <View style={styles.cardHeaderCopy}>
          <Text style={styles.cardTitle}>{user.name}</Text>
          <Text style={styles.cardMeta} numberOfLines={1}>
            {user.email}
          </Text>
          {user.contactNumber ? <Text style={styles.cardMeta}>{user.contactNumber}</Text> : null}
        </View>
        <View style={styles.badgeStack}>
          <View style={[styles.statusBadge, user.status === 'online' ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusBadgeText}>{user.status === 'online' ? 'Online' : 'Offline'}</Text>
          </View>
          <View style={[styles.roleBadge, protectedUser ? styles.roleBadgeAdmin : styles.roleBadgeUser]}>
            <Text style={styles.roleBadgeText}>{user.role}</Text>
          </View>
        </View>
      </View>

      <View style={styles.roleRow}>
        <Pressable
          disabled={protectedUser || saving || deleting || user.role === 'User'}
          onPress={() => onRoleChange('User')}
          style={({ pressed }) => [
            styles.roleButton,
            user.role === 'User' && styles.roleButtonActive,
            (pressed && !protectedUser && !saving && !deleting) && styles.pressed,
            protectedUser && styles.disabled,
          ]}
        >
          <UserIcon size={14} stroke={mobileTheme.colors.text} />
          <Text style={styles.roleButtonText}>User</Text>
        </Pressable>

        <Pressable
          disabled={protectedUser || saving || deleting || user.role === 'Admin'}
          onPress={() => onRoleChange('Admin')}
          style={({ pressed }) => [
            styles.roleButton,
            user.role === 'Admin' && styles.roleButtonActive,
            (pressed && !protectedUser && !saving && !deleting) && styles.pressed,
            protectedUser && styles.disabled,
          ]}
        >
          <ShieldIcon size={14} stroke={mobileTheme.colors.text} />
          <Text style={styles.roleButtonText}>Admin</Text>
        </Pressable>
      </View>

      <View style={styles.cardFooter}>
        {protectedUser ? (
          <Text style={styles.protectedText}>Protected account</Text>
        ) : (
          <Pressable disabled={deleting || saving} onPress={onDelete} style={styles.deleteButton}>
            <TrashIcon size={14} stroke={mobileTheme.colors.danger} />
            <Text style={styles.deleteText}>{deleting ? 'Deleting...' : 'Delete'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 16,
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
    lineHeight: 18,
  },
  successBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.successBorder,
    backgroundColor: mobileTheme.colors.successSoft,
    padding: 12,
  },
  successText: {
    color: mobileTheme.colors.success,
    fontSize: 13,
    lineHeight: 18,
  },
  refreshButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  refreshLabel: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  summaryTile: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 12,
    gap: 6,
  },
  summaryIcon: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  summaryIconAccent: {
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  summaryIconWarning: {
    backgroundColor: mobileTheme.colors.warningSoft,
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
  searchRow: {
    gap: 10,
  },
  searchBox: {
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: mobileTheme.colors.text,
    fontSize: 14,
    paddingVertical: 10,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
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
    color: mobileTheme.colors.accent,
  },
  centerState: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  emptyText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  list: {
    gap: 12,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 14,
    gap: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  avatarText: {
    color: mobileTheme.colors.accent,
    fontSize: 13,
    fontWeight: '800',
  },
  cardHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  cardMeta: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  badgeStack: {
    alignItems: 'flex-end',
    gap: 6,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusOnline: {
    backgroundColor: mobileTheme.colors.successSoft,
  },
  statusOffline: {
    backgroundColor: mobileTheme.colors.warningSoft,
  },
  statusBadgeText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roleBadgeAdmin: {
    backgroundColor: mobileTheme.colors.dangerSoft,
  },
  roleBadgeUser: {
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  roleBadgeText: {
    color: mobileTheme.colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  roleButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  roleButtonActive: {
    borderColor: mobileTheme.colors.accent,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  roleButtonText: {
    color: mobileTheme.colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  protectedText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteText: {
    color: mobileTheme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.75,
  },
  disabled: {
    opacity: 0.45,
  },
});
