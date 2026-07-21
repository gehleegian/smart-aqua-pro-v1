import { Pressable, StyleSheet, Text } from 'react-native';
import { mobileTheme } from '../../theme';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'ghost';
};

export default function ActionButton({
  label,
  onPress,
  disabled = false,
  tone = 'primary',
}: ActionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        tone === 'ghost' && styles.ghost,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={[styles.label, tone === 'ghost' && styles.ghostLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accent,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
  },
  label: {
    color: mobileTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
  ghostLabel: {
    color: mobileTheme.colors.text,
  },
  disabled: {
    opacity: 0.6,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
