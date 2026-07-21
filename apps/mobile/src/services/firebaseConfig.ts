function requireMobileEnv(key: string) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required mobile environment variable: ${key}.`);
  }

  return value;
}

export function readMobileFirebaseConfig() {
  return {
    apiKey: requireMobileEnv('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: requireMobileEnv('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: requireMobileEnv('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: requireMobileEnv('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: requireMobileEnv('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: requireMobileEnv('EXPO_PUBLIC_FIREBASE_APP_ID'),
    measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || undefined,
    databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || undefined,
  };
}
