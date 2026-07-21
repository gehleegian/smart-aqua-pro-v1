import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import { mobileTheme } from '../../theme';

export type NavKey = 'dashboard' | 'monitoring' | 'alerts' | 'datalogs' | 'aquariums' | 'users' | 'settings';

export type NavItem = {
  key: NavKey;
  label: string;
  icon: ComponentType<any>;
};

type BottomNavProps = {
  items: NavItem[];
  activeKey: NavKey;
  onChange: (key: NavKey) => void;
};

export default function BottomNav({ items, activeKey, onChange }: BottomNavProps) {
  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = activeKey === item.key;

        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={({ pressed }) => [
              styles.item,
              isActive && styles.itemActive,
              pressed && styles.itemPressed,
            ]}
          >
            <Icon size={16} stroke={isActive ? mobileTheme.colors.accent : mobileTheme.colors.textMuted} />
            <Text style={[styles.label, isActive && styles.labelActive]} numberOfLines={1}>
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    paddingTop: 10,
    paddingBottom: 12,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  itemActive: {
    opacity: 1,
  },
  itemPressed: {
    opacity: 0.75,
  },
  label: {
    color: mobileTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '600',
  },
  labelActive: {
    color: mobileTheme.colors.accent,
  },
});
