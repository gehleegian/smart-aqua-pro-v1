import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
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
import aquariumHero from '../../assets/aquarium-hero.jpg';

import { getCurrentUserProfile } from '../../services/userService';
import type { UserData, UserRole } from '../../types/user';
import { normalizeRole } from '../../utils/roleHelpers';

const pages: Record<string, React.FC> = {
  dashboard: Dashboard,
  monitoring: Monitoring,
  alerts: Alerts,
  datalogs: DataLogs,
  aquariums: Aquariums,
  users: Users,
  settings: Settings,
};

type AppPage = 'landing' | 'login' | 'signup' | 'app';

const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['dashboard', 'monitoring', 'alerts', 'datalogs', 'aquariums', 'users', 'settings'],
  User: ['dashboard', 'monitoring', 'alerts', 'datalogs', 'aquariums', 'settings'],
};

export default function Layout() {
  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('currentPage') || 'dashboard';
  });
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [user, setUser] = useState<UserData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [authNotice, setAuthNotice] = useState('');
  const logoutTargetRef = useRef<AppPage>('landing');

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setAppPage(logoutTargetRef.current);
          logoutTargetRef.current = 'landing';
          setCurrentPage('dashboard');
          setLoadingAuth(false);
          return;
        }

        const userProfile = await getCurrentUserProfile(firebaseUser.uid);

        if (!userProfile) {
          setUser(null);
          setAppPage('login');
          setLoadingAuth(false);
          return;
        }

        const normalizedRole = normalizeRole(userProfile.role);

        setUser({
          id: userProfile.id,
          name: userProfile.name,
          fullName: userProfile.fullName,
          email: userProfile.email,
          contactNumber: userProfile.contactNumber,
          role: normalizedRole,
          createdAt: userProfile.createdAt,
          updatedAt: userProfile.updatedAt,
          accountStatus: userProfile.accountStatus,
          status: userProfile.status,
        });

        setAppPage('app');
        setAuthNotice('');

        const savedPage = localStorage.getItem('currentPage') || 'dashboard';
        const allowed = rolePermissions[normalizedRole] ?? rolePermissions.User;

        if (allowed.includes(savedPage)) {
          setCurrentPage(savedPage);
        } else {
          setCurrentPage('dashboard');
          localStorage.setItem('currentPage', 'dashboard');
        }
      } catch (error) {
        console.error('Failed to load user session:', error);
        setUser(null);
        setAppPage('login');
      } finally {
        setLoadingAuth(false);
      }
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const handleProfileUpdated = async () => {
      const firebaseUser = auth.currentUser;

      if (!firebaseUser) {
        return;
      }

      try {
        const userProfile = await getCurrentUserProfile(firebaseUser.uid);

        if (!userProfile) {
          return;
        }

        const normalizedRole = normalizeRole(userProfile.role);

        setUser({
          id: userProfile.id,
          name: userProfile.name,
          fullName: userProfile.fullName,
          email: userProfile.email,
          contactNumber: userProfile.contactNumber,
          role: normalizedRole,
          createdAt: userProfile.createdAt,
          updatedAt: userProfile.updatedAt,
          accountStatus: userProfile.accountStatus,
          status: userProfile.status,
        });
      } catch (error) {
        console.error('Failed to refresh updated user profile:', error);
      }
    };

    window.addEventListener(
      'smartaqua:userProfileUpdated',
      handleProfileUpdated as EventListener
    );

    return () => {
      window.removeEventListener(
        'smartaqua:userProfileUpdated',
        handleProfileUpdated as EventListener
      );
    };
  }, []);

  const handleLogout = useCallback(async (
    options: { nextPage?: AppPage; notice?: string } = {}
  ) => {
    try {
      logoutTargetRef.current = options.nextPage || 'landing';
      setAuthNotice(options.notice || '');
      await signOut(auth);
      localStorage.removeItem('currentPage');
      setUser(null);
      setAppPage(options.nextPage || 'landing');
      setCurrentPage('dashboard');
      setSidebarOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

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
      setCurrentPage('dashboard');
      localStorage.setItem('currentPage', 'dashboard');
    }
  }, [user, currentPage, allowedPages]);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-200 text-lg">
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
        onSignup={() => {
          setAuthNotice('');
          setAppPage('login');
        }}
        onGoToLogin={() => {
          setAuthNotice('');
          setAppPage('login');
        }}
      />
    );
  }

  if (appPage === 'login' || !user) {
    return (
      <Login
        onLogin={(userData) => {
          setAuthNotice('');
          setUser({
            ...userData,
            role: normalizeRole(userData.role),
          });
          setAppPage('app');
        }}
        onGoToSignup={() => {
          setAuthNotice('');
          setAppPage('signup');
        }}
        onGoBack={() => {
          setAuthNotice('');
          setAppPage('landing');
        }}
        infoMessage={authNotice}
      />
    );
  }

  const PageComponent =
    allowedPages.includes(currentPage) && pages[currentPage]
      ? pages[currentPage]
      : Dashboard;

  return (
    <div className="min-h-screen bg-slate-950">
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

      <div className="relative min-h-screen overflow-hidden lg:ml-64">
        <div className="pointer-events-none fixed inset-y-0 left-0 right-0 overflow-hidden lg:left-64">
          <img
            src={aquariumHero}
            alt=""
            className="app-aquarium-motion h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-slate-950/70" />
          <div className="absolute inset-0 bg-gradient-to-br from-slate-950/85 via-slate-950/65 to-slate-900/55" />
        </div>

        <div className="relative z-10">
          <Header
            currentPage={currentPage}
            user={user}
            onLogout={handleLogout}
            onMenuClick={() => setSidebarOpen(true)}
          />
          <main className="p-6">
            <PageComponent />
          </main>
        </div>
      </div>
    </div>
  );
}
