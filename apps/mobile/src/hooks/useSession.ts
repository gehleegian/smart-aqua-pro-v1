import { onAuthStateChanged } from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import type { UserData } from '@smartaqua/shared';
import { auth } from '../services/firebase';
import { loginUser, logoutUser, registerUser } from '../services/authService';
import { getCurrentUserProfile } from '../services/userService';

function getFriendlyAuthError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return 'Authentication failed.';
  }

  const code = 'code' in error ? String(error.code) : '';

  if (code === 'auth/email-already-in-use') {
    return 'Email is already in use.';
  }

  if (code === 'auth/invalid-email') {
    return 'Invalid email address.';
  }

  if (code === 'auth/weak-password') {
    return 'Password is too weak.';
  }

  if (code === 'auth/user-not-found' || code === 'auth/wrong-password') {
    return 'Invalid email or password.';
  }

  if (code === 'auth/invalid-credential') {
    return 'Invalid email or password.';
  }

  return 'Authentication failed.';
}

export function useSession() {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          return;
        }

        const profile = await getCurrentUserProfile(firebaseUser.uid);
        setUser(profile);
      } catch (nextError) {
        console.error('Failed to load mobile session:', nextError);
        setUser(null);
        setError('Unable to restore your session.');
        await logoutUser();
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, []);

  const session = useMemo(
    () => ({
      user,
      loading,
      busy,
      error,
      clearError: () => setError(''),
      async signIn(email: string, password: string) {
        try {
          setBusy(true);
          setError('');
          const profile = await loginUser(email, password);
          setUser(profile);
        } catch (nextError) {
          setError(getFriendlyAuthError(nextError));
          throw nextError;
        } finally {
          setBusy(false);
        }
      },
      async signUp(name: string, email: string, password: string) {
        try {
          setBusy(true);
          setError('');
          await registerUser(name, email, password);
        } catch (nextError) {
          setError(getFriendlyAuthError(nextError));
          throw nextError;
        } finally {
          setBusy(false);
        }
      },
      async signOut() {
        try {
          setBusy(true);
          await logoutUser();
          setUser(null);
        } finally {
          setBusy(false);
        }
      },
    }),
    [busy, error, loading, user]
  );

  return session;
}
