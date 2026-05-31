export type AuthRateLimitAction = 'login' | 'signup';

type AuthRateLimitPolicy = {
  blockMs: number;
  maxAttempts: number;
  windowMs: number;
};

type AuthRateLimitRecord = {
  attempts: number[];
  blockedUntil: number;
};

type AuthRateLimitState = Record<AuthRateLimitAction, AuthRateLimitRecord>;

const STORAGE_KEY = 'smartaqua-auth-rate-limit-v1';

const policies: Record<AuthRateLimitAction, AuthRateLimitPolicy> = {
  login: {
    windowMs: 60_000,
    maxAttempts: 5,
    blockMs: 5 * 60_000,
  },
  signup: {
    windowMs: 10 * 60_000,
    maxAttempts: 3,
    blockMs: 15 * 60_000,
  },
};

const defaultState: AuthRateLimitState = {
  login: {
    attempts: [],
    blockedUntil: 0,
  },
  signup: {
    attempts: [],
    blockedUntil: 0,
  },
};

export class AuthRateLimitError extends Error {
  action: AuthRateLimitAction;
  retryAfterMs: number;

  constructor(action: AuthRateLimitAction, retryAfterMs: number) {
    super(
      `Too many ${action === 'login' ? 'sign-in' : 'sign-up'} attempts. Try again in ${formatAuthRateLimitDuration(
        retryAfterMs
      )}.`
    );

    this.name = 'AuthRateLimitError';
    this.action = action;
    this.retryAfterMs = retryAfterMs;
  }
}

function isBrowser() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function readRateLimitState(): AuthRateLimitState {
  if (!isBrowser()) {
    return defaultState;
  }

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY);

    if (!rawValue) {
      return defaultState;
    }

    const parsed = JSON.parse(rawValue) as Partial<AuthRateLimitState>;

    return {
      login: {
        attempts: Array.isArray(parsed.login?.attempts) ? parsed.login?.attempts : [],
        blockedUntil:
          typeof parsed.login?.blockedUntil === 'number' ? parsed.login.blockedUntil : 0,
      },
      signup: {
        attempts: Array.isArray(parsed.signup?.attempts) ? parsed.signup?.attempts : [],
        blockedUntil:
          typeof parsed.signup?.blockedUntil === 'number' ? parsed.signup.blockedUntil : 0,
      },
    };
  } catch {
    return defaultState;
  }
}

function writeRateLimitState(state: AuthRateLimitState) {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function normalizeRecord(
  action: AuthRateLimitAction,
  record: AuthRateLimitRecord,
  now: number
): AuthRateLimitRecord {
  const policy = policies[action];
  const attempts = record.attempts.filter((timestamp) => now - timestamp < policy.windowMs);
  const blockedUntil = record.blockedUntil > now ? record.blockedUntil : 0;

  return {
    attempts,
    blockedUntil,
  };
}

export function getAuthRateLimitStatus(action: AuthRateLimitAction, now = Date.now()) {
  const state = readRateLimitState();
  const record = normalizeRecord(action, state[action], now);
  const policy = policies[action];
  const retryAfterMs = Math.max(0, record.blockedUntil - now);

  if (
    record.attempts.length !== state[action].attempts.length ||
    record.blockedUntil !== state[action].blockedUntil
  ) {
    writeRateLimitState({
      ...state,
      [action]: record,
    });
  }

  return {
    blocked: retryAfterMs > 0,
    retryAfterMs,
    remainingAttempts: Math.max(0, policy.maxAttempts - record.attempts.length),
  };
}

export function registerAuthAttempt(action: AuthRateLimitAction, now = Date.now()) {
  const state = readRateLimitState();
  const record = normalizeRecord(action, state[action], now);
  const policy = policies[action];

  if (record.blockedUntil > now) {
    writeRateLimitState({
      ...state,
      [action]: record,
    });
    throw new AuthRateLimitError(action, record.blockedUntil - now);
  }

  const attempts = [...record.attempts, now];

  if (attempts.length > policy.maxAttempts) {
    const blockedUntil = now + policy.blockMs;
    writeRateLimitState({
      ...state,
      [action]: {
        attempts: [],
        blockedUntil,
      },
    });
    throw new AuthRateLimitError(action, policy.blockMs);
  }

  writeRateLimitState({
    ...state,
    [action]: {
      attempts,
      blockedUntil: 0,
    },
  });
}

export function resetAuthRateLimit(action: AuthRateLimitAction) {
  const state = readRateLimitState();

  writeRateLimitState({
    ...state,
    [action]: {
      attempts: [],
      blockedUntil: 0,
    },
  });
}

export function isAuthRateLimitError(error: unknown): error is AuthRateLimitError {
  return error instanceof AuthRateLimitError;
}

export function formatAuthRateLimitDuration(durationMs: number) {
  const totalSeconds = Math.max(1, Math.ceil(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes > 0 && seconds > 0) {
    return `${minutes}m ${seconds}s`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}
