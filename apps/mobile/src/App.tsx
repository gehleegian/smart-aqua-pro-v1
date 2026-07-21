import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet, Text, View } from 'react-native';
import {
  Activity,
  BarChart3,
  Bell,
  Fish,
  LayoutDashboard,
  Settings,
  Users,
  Wifi,
} from 'lucide-react-native';
import AppShell from './components/layout/AppShell';
import { SelectedAquariumProvider } from './context/SelectedAquariumContext';
import LoginScreen from './screens/LoginScreen';
import SignupScreen from './screens/SignupScreen';
import DashboardScreen from './screens/DashboardScreen';
import MonitoringScreen from './screens/MonitoringScreen';
import AlertsScreen from './screens/AlertsScreen';
import DataLogsScreen from './screens/DataLogsScreen';
import AquariumsScreen from './screens/AquariumsScreen';
import UsersScreen from './screens/UsersScreen';
import SettingsScreen from './screens/SettingsScreen';
import { useSession } from './hooks/useSession';
import { mobileTheme } from './theme';
import type { NavKey, NavItem } from './components/navigation/BottomNav';

type AuthMode = 'login' | 'signup';
const userNavItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'monitoring', label: 'Monitoring', icon: Activity },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'datalogs', label: 'Logs', icon: BarChart3 },
  { key: 'aquariums', label: 'Aquariums', icon: Fish },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const adminNavItems: NavItem[] = [
  { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { key: 'monitoring', label: 'Monitoring', icon: Activity },
  { key: 'alerts', label: 'Alerts', icon: Bell },
  { key: 'datalogs', label: 'Logs', icon: BarChart3 },
  { key: 'aquariums', label: 'Aquariums', icon: Fish },
  { key: 'users', label: 'Users', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
];

export default function App() {
  const session = useSession();
  const [mode, setMode] = useState<AuthMode>('login');
  const [activeTab, setActiveTab] = useState<NavKey>('dashboard');
  const WifiIcon = Wifi as ComponentType<any>;
  const navItems = useMemo(
    () => (session.user?.role === 'Admin' ? adminNavItems : userNavItems),
    [session.user?.role]
  );

  useEffect(() => {
    if (!navItems.some((item) => item.key === activeTab)) {
      setActiveTab('dashboard');
    }
  }, [activeTab, navItems]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar
        backgroundColor={mobileTheme.colors.surface}
        barStyle="light-content"
        translucent={false}
      />
      <View style={styles.shell}>
        {session.loading ? (
          <View style={styles.loadingState}>
            <Text style={styles.loadingTitle}>SmartAqua Pro</Text>
            <Text style={styles.loadingBody}>Restoring session...</Text>
          </View>
        ) : !session.user ? (
          mode === 'login' ? (
            <LoginScreen
              loading={session.busy}
              error={session.error}
              onGoToSignup={() => {
                session.clearError();
                setMode('signup');
              }}
              onLogin={async (email, password) => {
                await session.signIn(email, password);
              }}
            />
          ) : (
            <SignupScreen
              loading={session.busy}
              error={session.error}
              onGoToLogin={() => {
                session.clearError();
                setMode('login');
              }}
              onSignup={async (name, email, password) => {
                await session.signUp(name, email, password);
                setMode('login');
              }}
            />
          )
        ) : (
          <SelectedAquariumProvider userId={session.user?.id ?? null}>
            <AppShell
              accessory={
                <View style={styles.connectionPill}>
                  <WifiIcon size={12} stroke={mobileTheme.colors.accent} />
                  <Text style={styles.connectionText}>Connected</Text>
                </View>
              }
              activeTab={activeTab}
              navItems={navItems}
              onTabChange={setActiveTab}
              title={pageTitle(activeTab)}
            >
              {activeTab === 'dashboard' ? <DashboardScreen /> : null}
              {activeTab === 'monitoring' ? <MonitoringScreen /> : null}
              {activeTab === 'alerts' ? <AlertsScreen /> : null}
              {activeTab === 'datalogs' ? <DataLogsScreen /> : null}
              {activeTab === 'aquariums' ? <AquariumsScreen /> : null}
              {activeTab === 'users' && session.user?.role === 'Admin' ? <UsersScreen /> : null}
              {activeTab === 'settings' ? (
                <SettingsScreen signingOut={session.busy} onSignOut={session.signOut} />
              ) : null}
            </AppShell>
          </SelectedAquariumProvider>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight || 0 : 0,
  },
  shell: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  connectionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  connectionText: {
    color: mobileTheme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  loadingState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  loadingTitle: {
    color: mobileTheme.colors.text,
    fontSize: 24,
    fontWeight: '800',
  },
  loadingBody: {
    color: mobileTheme.colors.textMuted,
    fontSize: 14,
  },
});

function pageTitle(activeTab: NavKey) {
  if (activeTab === 'monitoring') return 'Monitoring';
  if (activeTab === 'alerts') return 'Alerts';
  if (activeTab === 'datalogs') return 'Data Logs';
  if (activeTab === 'aquariums') return 'Aquariums';
  if (activeTab === 'users') return 'Users';
  if (activeTab === 'settings') return 'Settings';
  return 'Dashboard';
}
