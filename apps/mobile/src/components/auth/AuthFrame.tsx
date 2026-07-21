import { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { mobileTheme } from '../../theme';

const smartAquaLogo = require('../../../assets/smartaqua-logo.png');

type AuthFrameProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
};

export default function AuthFrame({ title, subtitle, children, footer }: AuthFrameProps) {
  return (
    <View style={styles.card}>
      <View style={styles.brandBlock}>
        <View style={styles.brandMark}>
          <Image source={smartAquaLogo} style={styles.logo} resizeMode="contain" />
        </View>
        <Text style={styles.brandTitle}>SmartAqua Pro</Text>
        <Text style={styles.brandSubtitle}>Intelligent aquarium monitoring and automation</Text>
      </View>

      <View style={styles.headingBlock}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>

      {children}

      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: mobileTheme.colors.border,
    backgroundColor: mobileTheme.colors.surface,
    padding: 20,
    gap: 18,
  },
  brandBlock: {
    alignItems: 'center',
    gap: 6,
  },
  brandMark: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: mobileTheme.colors.accentSoft,
  },
  logo: {
    width: 36,
    height: 36,
  },
  brandTitle: {
    color: mobileTheme.colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  brandSubtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 12,
  },
  headingBlock: {
    gap: 4,
  },
  title: {
    color: mobileTheme.colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    alignItems: 'center',
  },
});
