import { useEffect, useMemo, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';

import Sidebar from './Sidebar';
import Header from './Header';
import Dashboard from '../../pages/Dashboard';
import Monitoring from '../../pages/Monitoring';
import Automation from '../../pages/Automation';
import Alerts from '../../pages/Alerts';
import DataLogs from '../../pages/DataLogs';
import Aquariums from '../../pages/Aquariums';
import Users from '../../pages/Users';
import Settings from '../../pages/Settings';
import Login from '../../pages/Login';
import Landing from '../../pages/Landing';
import Signup from '../../pages/Signup';

import { getCurrentUserProfile } from '../../services/userService';
import type { UserData, UserRole } from '../../types/user';
import { normalizeRole } from '../../utils/roleHelpers';

const pages: Record<string, React.FC> = {
  dashboard: Dashboard,
  monitoring: Monitoring,
  automation: Automation,
  alerts: Alerts,
  datalogs: DataLogs,
  aquariums: Aquariums,
  users: Users,
  settings: Settings,
};

type AppPage = 'landing' | 'login' | 'signup' | 'app';

const rolePermissions: Record<UserRole, string[]> = {
  Admin: ['dashboard', 'monitoring', 'automation', 'alerts', 'datalogs', 'aquariums', 'users', 'settings'],
  User: ['dashboard', 'monitoring', 'automation', 'alerts', 'datalogs', 'aquariums', 'settings'],
};

export default function Layout() {
  const [currentPage, setCurrentPage] = useState(() => {
    return localStorage.getItem('currentPage') || 'dashboard';
  });
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [user, setUser] = useState<UserData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (!firebaseUser) {
          setUser(null);
          setAppPage('landing');
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
      localStorage.removeItem('currentPage');
      setUser(null);
      setAppPage('landing');
      setCurrentPage('dashboard');
      setSidebarOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
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
          setAppPage('login');
        }}
        onGoToLogin={() => setAppPage('login')}
      />
    );
  }

  if (appPage === 'login' || !user) {
    return (
      <Login
        onLogin={(userData) => {
          setUser({
            ...userData,
            role: normalizeRole(userData.role),
          });
          setAppPage('app');
        }}
        onGoToSignup={() => setAppPage('signup')}
        onGoBack={() => setAppPage('landing')}
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

      <div className="lg:ml-64">
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
  );
}