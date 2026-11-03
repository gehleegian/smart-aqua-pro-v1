import { useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, signOut } from 'firebase/auth';
import { auth } from '../../firebase';

import Sidebar from './Sidebar';
import Header from './Header';
import Dashboard from '../../pages/Dashboard';
import Monitoring from '../../pages/Monitoring';
import Alerts from '../../pages/Alerts';
import DataLogs from '../../pages/DataLogs';
import Aquariums from '../../pages/Aquariums';
import Users from '../../pages/Users';
import Settings from '../../pages/Settings';
import Login from '../../pages/Login';
import Landing from '../../pages/Landing';
import Signup from '../../pages/Signup';
import VerifyEmail from '../../pages/VerifyEmail';
import Support from '../../pages/Support';

import {
  getCurrentUserProfile,
  subscribeToCurrentUserProfile,
} from '../../services/userService';
import type { UserData, UserRole } from '../../types/user';
import {
  getCurrentEmailAccessState,
  isVerificationPolicyUnavailableError,
  VERIFICATION_POLICY_UNAVAILABLE_MESSAGE,
} from '../../services/emailVerificationPolicyService';
import { normalizeRole } from '../../utils/roleHelpers';

const pages: Record<string, React.FC> = {
  dashboard: Dashboard,
  monitoring: Monitoring,
  alerts: Alerts,
  datalogs: DataLogs,
  aquariums: Aquariums,
  users: Users,
  settings: Settings,
  support: Support,
};

type AppPage = 'landing' | 'login' | 'signup' | 'verify-email' | 'app';
type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'smartAquaTheme';

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
};

const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['dashboard', 'users', 'support', 'settings'],
  User: ['dashboard', 'monitoring', 'alerts', 'datalogs', 'aquariums', 'support', 'settings'],
};

export default function Layout() {
  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('currentPage') || 'dashboard';
  });
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [user, setUser] = useState<UserData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    let unsubscribeProfile: (() => void) | undefined;

    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      unsubscribeProfile?.();
      unsubscribeProfile = undefined;

      try {
        if (!firebaseUser) {
          setUser(null);
          setAppPage('landing');
          setCurrentPage('dashboard');
          setLoadingAuth(false);
          return;
        }

        // Do not render the previous account while this account's trusted
        // verification policy and profile are being resolved.
        setLoadingAuth(true);
        setUser(null);
        setSessionError('');

        if ((await getCurrentEmailAccessState(firebaseUser)) !== 'access-allowed') {
          setUser(null);
          setAppPage('verify-email');
          setLoadingAuth(false);
          return;
        }

        const userProfile = await getCurrentUserProfile(firebaseUser.uid);

        if (!userProfile) {
          setUser(null);
          setSessionError(
            'Your credentials were accepted, but your SmartAqua Pro user profile was not found. Please contact the system administrator.'
          );
          setAppPage('login');
          setLoadingAuth(false);
          return;
        }

        const normalizedRole = normalizeRole(userProfile.role);

        setUser({
          id: userProfile.id,
          name: userProfile.name,
          email: userProfile.email,
          role: normalizedRole,
          createdAt: userProfile.createdAt,
          status: userProfile.status,
        });

        setAppPage('app');

        const savedPage = localStorage.getItem('currentPage') || 'dashboard';
        const allowed = rolePermissions[normalizedRole] ?? rolePermissions.User;

        if (allowed.includes(savedPage)) {
          setCurrentPage(savedPage);
        } else {
          setCurrentPage('dashboard');
          localStorage.setItem('currentPage', 'dashboard');
        }

        unsubscribeProfile = subscribeToCurrentUserProfile(
          firebaseUser.uid,
          (updatedProfile) => {
            if (!updatedProfile) {
              void signOut(auth).finally(() => {
                setUser(null);
                setAppPage('login');
                setCurrentPage('dashboard');
                localStorage.removeItem('currentPage');
              });
              return;
            }

            setUser((currentUser) => ({
              ...updatedProfile,
              name: updatedProfile.name,
              email: updatedProfile.email,
              role: normalizeRole(updatedProfile.role),
              status: updatedProfile.status,
              createdAt: updatedProfile.createdAt,
              id: updatedProfile.id || currentUser?.id || firebaseUser.uid,
            }));
          },
          () => {
            setSessionError(
              'Your profile access was denied. Your account may have been revoked or the deployed security rules may be incompatible.'
            );
            void signOut(auth).finally(() => {
              setUser(null);
              setAppPage('login');
              setCurrentPage('dashboard');
              localStorage.removeItem('currentPage');
            });
          },
          (profileError) => {
            console.error('User profile subscription failed:', profileError);
          }
        );
      } catch (error) {
        console.error('Failed to load user session:', error);
        setUser(null);
        setSessionError(
          isVerificationPolicyUnavailableError(error)
            ? VERIFICATION_POLICY_UNAVAILABLE_MESSAGE
            : 'Your sign-in succeeded, but SmartAqua Pro could not load your account. Please try again or contact the system administrator.'
        );
        setAppPage('login');
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => {
      unsubscribeProfile?.();
      unsubscribe();
    };
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('currentPage');
      setUser(null);
      setAppPage('landing');
      setCurrentPage('dashboard');
      setSidebarOpen(false);
      setSessionError('');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  const allowedPages = useMemo(() => {
    if (!user) return [];
    return rolePermissions[user.role] ?? rolePermissions.User;
  }, [user]);

  const handleNavigate = (page: string) => {
    if (!allowedPages.includes(page)) {
      setCurrentPage('dashboard');
      localStorage.setItem('currentPage', 'dashboard');
      setSidebarOpen(false);
      return;
    }

    setCurrentPage(page);
    localStorage.setItem('currentPage', page);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (user && !allowedPages.includes(currentPage)) {
      const redirectTimer = window.setTimeout(() => {
        setCurrentPage('dashboard');
        localStorage.setItem('currentPage', 'dashboard');
      }, 0);

      return () => window.clearTimeout(redirectTimer);
    }
  }, [user, currentPage, allowedPages]);

  if (loadingAuth) {
    return (
      <div
        className="smart-aqua-app flex min-h-screen items-center justify-center bg-slate-950 text-lg text-slate-200"
        data-theme={theme}
      >
        Loading...
      </div>
    );
  }

  if (appPage === 'landing') {
    return <Landing onGetStarted={() => setAppPage('login')} />;
  }

  if (appPage === 'signup') {
    return (
      <Signup
        onVerificationRequired={() => setAppPage('verify-email')}
        onGoToLogin={() => {
          void signOut(auth).finally(() => setAppPage('login'));
        }}
      />
    );
  }

  if (appPage === 'verify-email' && auth.currentUser) {
    return (
      <VerifyEmail
        email={auth.currentUser.email ?? ''}
        onVerified={(userData) => {
          setUser({
            ...userData,
            role: normalizeRole(userData.role),
          });
          setAppPage('app');
        }}
        onSignOut={async () => {
          await signOut(auth);
          setAppPage('login');
        }}
      />
    );
  }

  if (appPage === 'login' || !user) {
    return (
      <Login
        onLogin={(userData) => {
          setSessionError('');
          setUser({
            ...userData,
            role: normalizeRole(userData.role),
          });
          setAppPage('app');
        }}
        onGoToSignup={() => {
          setSessionError('');
          setAppPage('signup');
        }}
        onGoBack={() => {
          setSessionError('');
          setAppPage('landing');
        }}
        externalError={sessionError}
      />
    );
  }

  const PageComponent =
    allowedPages.includes(currentPage) && pages[currentPage]
      ? pages[currentPage]
      : Dashboard;

  return (
    <div className="smart-aqua-app min-h-screen bg-slate-950 text-slate-100" data-theme={theme}>
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        userRole={user.role}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="lg:ml-64">
        <Header
          currentPage={currentPage}
          user={user}
          onLogout={handleLogout}
          onMenuClick={() => setSidebarOpen(true)}
          theme={theme}
          onThemeToggle={handleThemeToggle}
        />
        <main className="p-4 md:p-6">
          <PageComponent />
        </main>
      </div>
    </div>
  );
}
