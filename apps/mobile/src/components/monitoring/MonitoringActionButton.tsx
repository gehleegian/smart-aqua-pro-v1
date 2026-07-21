import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ComponentType } from 'react';
import { mobileTheme } from '../../theme';

type IconProps = {
  stroke?: string;
  size?: number;
};

type MonitoringActionButtonProps = {
  icon: ComponentType<any>;
  label: string;
  status: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: 'accent' | 'success' | 'warning';
};

export default function MonitoringActionButton({
  icon: Icon,
  label,
  status,
  onPress,
  disabled = false,
  loading = false,
  tone = 'accent',
}: MonitoringActionButtonProps) {
  const color =
    tone === 'success'
      ? mobileTheme.colors.success
      : tone === 'warning'
        ? mobileTheme.colors.warning
        : mobileTheme.colors.accent;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'success' && styles.success,
        tone === 'warning' && styles.warning,
        (disabled || loading) && styles.disabled,
        pressed && !(disabled || loading) && styles.pressed,
      ]}
    >
      <View style={styles.iconWrap}>
        {loading ? (
          <ActivityIndicator color={color} size="small" />
        ) : (
          <Icon size={18} stroke={color} />
        )}
      </View>
      <View style={styles.copy}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.status} numberOfLines={1}>
          {status}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 66,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surfaceAlt,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  success: {
    borderColor: mobileTheme.colors.successBorder,
  },
  warning: {
    borderColor: mobileTheme.colors.warningBorder,
  },
  disabled: {
    opacity: 0.64,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    color: mobileTheme.colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  status: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
});
