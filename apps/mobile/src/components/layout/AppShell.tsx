import { ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { mobileTheme } from '../../theme';
import BottomNav, { type NavItem, type NavKey } from '../navigation/BottomNav';

const smartAquaLogo = require('../../../assets/smartaqua-logo.png');

type AppShellProps = {
  title: string;
  navItems: NavItem[];
  activeTab: NavKey;
  onTabChange: (key: NavKey) => void;
  children: ReactNode;
  accessory?: ReactNode;
};

export default function AppShell({
  title,
  navItems,
  activeTab,
  onTabChange,
  children,
  accessory,
}: AppShellProps) {
  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <View style={styles.brandBlock}>
          <Image source={smartAquaLogo} style={styles.logo} resizeMode="contain" />
          <View>
            <Text style={styles.brand}>SmartAqua Pro</Text>
          </View>
        </View>
        <View>
          <Text style={styles.pageTitle}>{title}</Text>
        </View>
        <View style={styles.accessory}>{accessory}</View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>

      <BottomNav items={navItems} activeKey={activeTab} onChange={onTabChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: mobileTheme.colors.background,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  brandBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  logo: {
    width: 28,
    height: 28,
  },
  brand: {
    color: mobileTheme.colors.accent,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  pageTitle: {
    color: mobileTheme.colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  accessory: {
    alignItems: 'flex-end',
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 20,
    gap: 16,
  },
});
