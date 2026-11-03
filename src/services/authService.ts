import {
  createUserWithEmailAndPassword,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserData } from '../types/user';
import { getAuthErrorCode } from '../utils/authErrors';
import { registerAuthAttempt, resetAuthRateLimit } from '../utils/authRateLimit';
import { getCurrentUserProfile } from './userService';

export class EmailVerificationRequiredError extends Error {
  constructor() {
    super('Please verify your email first.');
    this.name = 'EmailVerificationRequiredError';
  }
}

let activeAuthFlows = 0;

/**
 * True while signup, login, or resend is signing a user in and out. Layout's
 * onAuthStateChanged listener ignores events during this window, because those
 * sign-ins are temporary and the page running the flow owns the outcome.
 */
export function isAuthFlowActive(): boolean {
  return activeAuthFlows > 0;
}

async function runAuthFlow<T>(flow: () => Promise<T>): Promise<T> {
  activeAuthFlows += 1;

  try {
    return await flow();
  } finally {
    // Firebase notifies listeners in microtasks, so a macrotask delay keeps the
    // guard up until the flow's final auth event has been delivered.
    setTimeout(() => {
      activeAuthFlows -= 1;
    }, 0);
  }
}

async function signOutSafely(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Failed to sign out:', error);
  }
}

function buildUserProfile(firebaseUser: User, name: string) {
  // Firestore rules require email to equal the token's email, which Firebase
  // normalizes, so the typed value can differ (for example in letter case).
  if (!firebaseUser.email) {
    throw new Error('The signed-in account has no email address.');
  }

  const now = new Date().toISOString();

  return {
    full_name: name,
    name,
    email: firebaseUser.email,
    contact_number: '',
    role: 'User',
    account_status: 'active',
    created_at: now,
    updated_at: now,
    createdAt: now,
    updatedAt: now,
  };
}

async function recreateUserProfile(firebaseUser: User): Promise<UserData> {
  const name = firebaseUser.displayName?.trim() || firebaseUser.email?.split('@')[0] || '';

  await setDoc(doc(db, 'users', firebaseUser.uid), buildUserProfile(firebaseUser, name));

  const profile = await getCurrentUserProfile(firebaseUser.uid);

  if (!profile) {
    throw new Error('User profile could not be recreated.');
  }

  return profile;
}

/**
 * Loads the profile for a signed-in user. Unverified users still get one read,
 * so accounts exempted by the security rules can continue. A read the rules
 * allow is treated as "verified or exempt", which is what permits recreating a
 * missing profile.
 */
export async function resolveSessionProfile(firebaseUser: User): Promise<UserData> {
  await reload(firebaseUser);

  if (firebaseUser.emailVerified) {
    await firebaseUser.getIdToken(true);
  }

  let profile: UserData | null;

  try {
    profile = await getCurrentUserProfile(firebaseUser.uid);
  } catch (error) {
    if (!firebaseUser.emailVerified && getAuthErrorCode(error) === 'permission-denied') {
      throw new EmailVerificationRequiredError();
    }

    throw error;
  }

  return profile ?? recreateUserProfile(firebaseUser);
}

export async function endUnverifiedSession(): Promise<void> {
  await runAuthFlow(signOutSafely);
}

/** Resolves to whether the verification email was sent. */
export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<boolean> {
  registerAuthAttempt('signup');

  return runAuthFlow(async () => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const firebaseUser = userCredential.user;

    try {
      await setDoc(doc(db, 'users', firebaseUser.uid), buildUserProfile(firebaseUser, name));

      let verificationEmailSent = true;

      try {
        await sendEmailVerification(firebaseUser);
      } catch (error) {
        // The account already exists, so this must not read as a failed signup.
        console.error('Failed to send verification email:', error);
        verificationEmailSent = false;
      }

      resetAuthRateLimit('signup');

      return verificationEmailSent;
    } finally {
      await signOutSafely();
    }
  });
}

export async function loginUser(email: string, password: string): Promise<UserData> {
  registerAuthAttempt('login');

  return runAuthFlow(async () => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);

    try {
      const profile = await resolveSessionProfile(userCredential.user);

      resetAuthRateLimit('login');

      return profile;
    } catch (error) {
      await signOutSafely();
      throw error;
    }
  });
}

/**
 * Unverified users are signed out, so sending the email needs a fresh sign-in.
 * This counts toward the login rate limit because it checks the password.
 */
export async function resendVerificationEmail(
  email: string,
  password: string
): Promise<'sent' | 'already-verified'> {
  registerAuthAttempt('login');

  return runAuthFlow(async () => {
    const { user } = await signInWithEmailAndPassword(auth, email, password);

    try {
      await reload(user);

      if (user.emailVerified) {
        return 'already-verified';
      }

      await sendEmailVerification(user);

      return 'sent';
    } finally {
      await signOutSafely();
    }
  });
}

export async function requestPasswordReset(email: string): Promise<void> {
  try {
    await sendPasswordResetEmail(auth, email);
  } catch (error) {
    // Reported as success so the form does not reveal whether an account exists.
    if (getAuthErrorCode(error) !== 'auth/user-not-found') {
      throw error;
    }
  }
}
