import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mobileTheme } from '../../theme';

type SectionCardProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  action?: ReactNode;
};

export default function SectionCard({ title, subtitle, children, action }: SectionCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.headingRow}>
        <View style={styles.heading}>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
        {action ? <View>{action}</View> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 16,
    gap: 12,
  },
  headingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  heading: {
    gap: 4,
    flex: 1,
  },
  title: {
    color: mobileTheme.colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  subtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
});
