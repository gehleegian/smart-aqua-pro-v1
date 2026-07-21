import { StyleSheet, Text, View } from 'react-native';
import { mobileTheme } from '../../theme';

type StatPillProps = {
  label: string;
  value: string;
  tone?: 'accent' | 'success' | 'warning';
};

export default function StatPill({ label, value, tone = 'accent' }: StatPillProps) {
  return (
    <View style={styles.pill}>
      <Text style={styles.label}>{label}</Text>
      <Text
        style={[
          styles.value,
          tone === 'success' && styles.success,
          tone === 'warning' && styles.warning,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    padding: 14,
    gap: 6,
  },
  label: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  value: {
    color: mobileTheme.colors.accent,
    fontSize: 24,
    fontWeight: '800',
  },
  success: {
    color: mobileTheme.colors.success,
  },
  warning: {
    color: mobileTheme.colors.warning,
  },
});
