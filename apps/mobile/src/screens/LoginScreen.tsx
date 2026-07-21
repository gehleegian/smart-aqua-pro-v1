import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/auth/ActionButton';
import AuthFrame from '../components/auth/AuthFrame';
import TextField from '../components/auth/TextField';
import { mobileTheme } from '../theme';

type LoginScreenProps = {
  onLogin: (email: string, password: string) => Promise<void>;
  onGoToSignup: () => void;
  loading?: boolean;
  error?: string;
};

export default function LoginScreen({
  onLogin,
  onGoToSignup,
  loading = false,
  error = '',
}: LoginScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    if (!email.trim() || !password.trim()) {
      setLocalError('Please fill in all fields.');
      return;
    }

    setLocalError('');
    await onLogin(email.trim(), password);
  };

  return (
    <AuthFrame
      title="Sign In"
      subtitle="Use your SmartAqua account to continue."
      footer={
        <Text style={styles.footerText} onPress={onGoToSignup}>
          No account yet? <Text style={styles.footerLink}>Create one</Text>
        </Text>
      }
    >
      <View style={styles.form}>
        <TextField
          autoCapitalize="none"
          keyboardType="email-address"
          label="Email"
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
        />
        <TextField
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        {(localError || error) ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{localError || error}</Text>
          </View>
        ) : null}

        <ActionButton
          label={loading ? 'Signing in...' : 'Sign In'}
          disabled={loading}
          onPress={() => void submit()}
        />
      </View>
    </AuthFrame>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 14,
  },
  alert: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: mobileTheme.colors.dangerBorder,
    backgroundColor: mobileTheme.colors.dangerSoft,
    padding: 12,
  },
  alertText: {
    color: mobileTheme.colors.danger,
    fontSize: 13,
    lineHeight: 18,
  },
  footerText: {
    color: mobileTheme.colors.textMuted,
    fontSize: 13,
  },
  footerLink: {
    color: mobileTheme.colors.accent,
    fontWeight: '700',
  },
});
