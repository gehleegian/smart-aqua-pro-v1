import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ActionButton from '../components/auth/ActionButton';
import AuthFrame from '../components/auth/AuthFrame';
import TextField from '../components/auth/TextField';
import { mobileTheme } from '../theme';

type SignupScreenProps = {
  onSignup: (name: string, email: string, password: string) => Promise<void>;
  onGoToLogin: () => void;
  loading?: boolean;
  error?: string;
};

export default function SignupScreen({
  onSignup,
  onGoToLogin,
  loading = false,
  error = '',
}: SignupScreenProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    if (!name.trim() || !email.trim() || !password.trim() || !confirmPassword.trim()) {
      setLocalError('Please fill in all fields.');
      return;
    }

    if (password !== confirmPassword) {
      setLocalError('Passwords do not match.');
      return;
    }

    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    setLocalError('');
    await onSignup(name.trim(), email.trim(), password);
  };

  return (
    <AuthFrame
      title="Create Account"
      subtitle="Register a SmartAqua account to access your system."
      footer={
        <Text style={styles.footerText} onPress={onGoToLogin}>
          Already have an account? <Text style={styles.footerLink}>Sign in</Text>
        </Text>
      }
    >
      <View style={styles.form}>
        <TextField
          autoCapitalize="words"
          label="Full Name"
          placeholder="Enter your full name"
          value={name}
          onChangeText={setName}
        />
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
          placeholder="Create a password"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextField
          label="Confirm Password"
          placeholder="Confirm your password"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />

        {(localError || error) ? (
          <View style={styles.alert}>
            <Text style={styles.alertText}>{localError || error}</Text>
          </View>
        ) : null}

        <ActionButton
          label={loading ? 'Creating account...' : 'Create Account'}
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
