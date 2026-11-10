import { useEffect, useMemo, useState } from 'react';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import { auth } from '../../firebase';

import Sidebar from './Sidebar';
import Header from './Header';
import Dashboard from '../../views/Dashboard';
import Monitoring from '../../views/Monitoring';
import Assessment from '../../views/Assessment';
import Recommendations from '../../views/Recommendations';
import Maintenance from '../../views/Maintenance';
import Automation from '../../views/Automation';
import Alerts from '../../views/Alerts';
import DataLogs from '../../views/DataLogs';
import Aquariums from '../../views/Aquariums';
import Users from '../../views/Users';
import Settings from '../../views/Settings';
import Login from '../../views/Login';
import Landing from '../../views/Landing';
import Signup from '../../views/Signup';
import Support from '../../views/Support';
import AddDevice from '../../views/AddDevice';
import SetupWizard from '../../views/SetupWizard';
import Team from '../../views/Team';
import Organizations from '../../views/Organizations';
import AcceptInvite from '../../views/AcceptInvite';
import AuditLog, { AdminAuditLog } from '../../views/AuditLog';
import RulesEditor from '../../views/RulesEditor';
import Reports from '../../views/Reports';
import ConfirmModal from '../ui/ConfirmModal';
import NoOrgState, { SuspendedOrgState } from '../org/NoOrgState';
import type { NavRole } from './Sidebar';
import { useOrg } from '../../hooks/useOrg';
import { refreshOrgContext } from '../../services/orgService';
import { clearOrgContext, readPendingInvite } from '../../services/orgContext';
import { captureTankFromUrl } from '../../services/tankFocus';
import { refreshPushToken } from '../../services/pushService';
import { currentUserFactors, mfaEnabled } from '../../services/mfaService';
import { mfaRequirement } from '../../utils/mfa';
import MfaSettings from '../settings/MfaSettings';

import {
  EmailVerificationRequiredError,
  endUnverifiedSession,
  isAuthFlowActive,
  resolveSessionProfile,
} from '../../services/authService';
import type { UserData, UserRole } from '../../types/user';
import { normalizeRole } from '../../utils/roleHelpers';

const pages: Record<string, React.FC<{ onNavigate: (page: string) => void }>> = {
  dashboard: Dashboard,
  monitoring: Monitoring,
  assessment: Assessment,
  recommendations: Recommendations,
  maintenance: Maintenance,
  automation: Automation,
  alerts: Alerts,
  datalogs: DataLogs,
  aquariums: Aquariums,
  users: Users,
  settings: Settings,
  support: Support,
  'add-device': AddDevice,
  setup: SetupWizard,
  team: Team,
  organizations: Organizations,
  invite: AcceptInvite,
  audit: AuditLog,
  'admin-audit': AdminAuditLog,
  rules: RulesEditor,
  reports: Reports,
};

type AppPage = 'landing' | 'login' | 'signup' | 'app';
type ThemeMode = 'dark' | 'light';

const THEME_STORAGE_KEY = 'smartAquaTheme';

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'dark';
  }

  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  return savedTheme === 'light' || savedTheme === 'dark' ? savedTheme : 'dark';
};

// Sprint 3: pages follow the access role (docs/access-model.md). The rules
// enforce the same boundaries; this only decides what is shown.
const rolePermissions: Record<NavRole, string[]> = {
  Admin: ['dashboard', 'organizations', 'users', 'rules', 'admin-audit', 'settings', 'support'],
  owner: ['dashboard', 'monitoring', 'assessment', 'recommendations', 'maintenance', 'automation', 'alerts', 'datalogs', 'reports', 'aquariums', 'add-device', 'setup', 'team', 'audit', 'settings', 'support', 'invite'],
  caretaker: ['dashboard', 'monitoring', 'assessment', 'recommendations', 'maintenance', 'alerts', 'datalogs', 'reports', 'add-device', 'setup', 'settings', 'support', 'invite'],
  none: ['dashboard', 'add-device', 'setup', 'settings', 'support', 'invite'],
};
// Pages that need an active (not suspended) organization's data.
const orgDataPages = new Set(['monitoring', 'assessment', 'recommendations', 'maintenance', 'automation', 'alerts', 'datalogs', 'reports', 'aquariums', 'team', 'setup', 'audit']);

function navRoleFor(platformRole: UserRole | undefined, orgRole: 'owner' | 'caretaker' | null): NavRole {
  if (platformRole === 'Admin') return 'Admin';
  return orgRole ?? 'none';
}

export default function Layout() {
  const [currentPage, setCurrentPage] = useState(() => {
    if (typeof window === 'undefined') {
      return 'dashboard';
    }

    // A notification click opens /?tank=<id>: show that tank's dashboard.
    if (captureTankFromUrl()) {
      localStorage.setItem('currentPage', 'dashboard');
      return 'dashboard';
    }
    return localStorage.getItem('currentPage') || 'dashboard';
  });
  const [appPage, setAppPage] = useState<AppPage>('landing');
  const [user, setUser] = useState<UserData | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [loginNotice, setLoginNotice] = useState('');
  const [verificationRequired, setVerificationRequired] = useState(false);
  const [orgReadyFor, setOrgReadyFor] = useState<string | null>(null);
  // Bumped after an enrollment so the platform-admin MFA gate re-checks.
  const [, setMfaVersion] = useState(0);
  const org = useOrg();
  const navRole = navRoleFor(user?.role, org.role);

  // Memberships load before any page renders, so every query is org-scoped.
  useEffect(() => {
    const uid = user?.id;
    if (!user || !uid) {
      clearOrgContext();
      return;
    }
    if (user.role === 'Admin') {
      // Platform admins have no org membership (orgReady below).
      clearOrgContext();
      return;
    }
    let cancelled = false;
    // Alerts already turned on in this browser: keep the token fresh (no prompt).
    void refreshPushToken().catch((error) => console.warn('Push token refresh failed.', error));
    refreshOrgContext(uid)
      .catch((error) => {
        console.error('Failed to load organizations:', error);
        clearOrgContext();
      })
      .finally(() => {
        if (!cancelled) {
          setOrgReadyFor(uid);
          if (readPendingInvite()) setCurrentPage('invite');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    localStorage.setItem('currentPage', currentPage);
  }, [currentPage]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    let latestRun = 0;

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      latestRun += 1;
      const run = latestRun;
      const isOutdated = () => run !== latestRun || isAuthFlowActive();

      try {
        // Signup, login, and resend finish on their own page; acting on their
        // temporary sign-ins here would unmount that page and hide its messages.
        if (isOutdated()) {
          return;
        }

        if (!firebaseUser) {
          setUser(null);
          setAppPage('landing');
          setCurrentPage('dashboard');
          setLoadingAuth(false);
          return;
        }

        const userProfile = await resolveSessionProfile(firebaseUser);

        if (isOutdated()) {
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

        setCurrentPage(localStorage.getItem('currentPage') || 'dashboard');
      } catch (error) {
        if (error instanceof EmailVerificationRequiredError) {
          console.warn('Email verification is required before accessing SmartAqua Pro.');
        } else {
          console.error('Failed to load user session:', error);
        }

        if (isOutdated()) {
          return;
        }

        if (error instanceof EmailVerificationRequiredError) {
          await endUnverifiedSession();
          setVerificationRequired(true);
        }

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
      clearOrgContext();
      setOrgReadyFor(null);
      localStorage.removeItem('currentPage');
      setUser(null);
      setAppPage('landing');
      setCurrentPage('dashboard');
      setSidebarOpen(false);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  const handleConfirmLogout = () => {
    setLogoutConfirmOpen(false);
    void handleLogout();
  };

  const handleThemeToggle = () => {
    setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
  };

  const orgReady = Boolean(user?.id) && (user?.role === 'Admin' || orgReadyFor === user?.id);
  const allowedPages = useMemo(() => {
    if (!user || !orgReady) return [];
    return rolePermissions[navRole];
  }, [user, orgReady, navRole]);

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
    if (user && orgReady && !allowedPages.includes(currentPage)) {
      const redirectTimer = window.setTimeout(() => {
        setCurrentPage('dashboard');
        localStorage.setItem('currentPage', 'dashboard');
      }, 0);

      return () => window.clearTimeout(redirectTimer);
    }
  }, [user, orgReady, currentPage, allowedPages]);

  if (loadingAuth || (user && appPage === 'app' && !orgReady)) {
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
        onSignup={(message) => {
          setLoginNotice(message);
          setAppPage('login');
        }}
        onGoToLogin={() => setAppPage('login')}
      />
    );
  }

  if (appPage === 'login' || !user) {
    return (
      <Login
        infoMessage={loginNotice}
        verificationRequired={verificationRequired}
        onLogin={(userData) => {
          setLoginNotice('');
          setVerificationRequired(false);
          setUser({
            ...userData,
            role: normalizeRole(userData.role),
          });
          setAppPage('app');
        }}
        onGoToSignup={() => {
          setLoginNotice('');
          setVerificationRequired(false);
          setAppPage('signup');
        }}
        onGoBack={() => {
          setLoginNotice('');
          setVerificationRequired(false);
          setAppPage('landing');
        }}
      />
    );
  }

  const PageComponent =
    allowedPages.includes(currentPage) && pages[currentPage]
      ? pages[currentPage]
      : Dashboard;
  const suspended = org.active?.org.status === 'suspended' && navRole !== 'Admin';
  const pageId = allowedPages.includes(currentPage) ? currentPage : 'dashboard';
  // Sprint 5: platform admins must enroll a TOTP factor before using the app
  // once MFA is switched on (the callables enforce it too: REQUIRE_PLATFORM_ADMIN_MFA).
  const adminMfaMissing = navRole === 'Admin'
    && mfaRequirement({ enabled: mfaEnabled, platformRole: user?.role, factors: currentUserFactors() }) === 'required_missing';
  const pageContent = adminMfaMissing ? (
    <div className="space-y-4">
      <div role="alert" className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        Platform administrators must turn on two-step verification before using SmartAqua Pro.
      </div>
      <MfaSettings required onEnrolled={() => setMfaVersion((value) => value + 1)} />
    </div>
  ) :
    suspended && (orgDataPages.has(pageId) || pageId === 'dashboard') ? (
      <SuspendedOrgState orgName={org.active?.org.name ?? 'This organization'} />
    ) : navRole === 'none' && pageId === 'dashboard' ? (
      <NoOrgState onNavigate={handleNavigate} />
    ) : (
      <PageComponent onNavigate={handleNavigate} />
    );

  return (
    <div className="smart-aqua-app min-h-screen bg-slate-950 text-slate-100" data-theme={theme}>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Sidebar
        currentPage={currentPage}
        onNavigate={handleNavigate}
        navRole={navRole}
        onLogout={() => setLogoutConfirmOpen(true)}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((collapsed) => !collapsed)}
      />

      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className={`transition-[margin] duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-64'}`}>
        <Header
          currentPage={currentPage}
          user={user}
          onLogout={() => setLogoutConfirmOpen(true)}
          onMenuClick={() => setSidebarOpen(true)}
          theme={theme}
          onThemeToggle={handleThemeToggle}
          onNavigate={handleNavigate}
        />
        <main id="main-content" tabIndex={-1} className="p-4 focus:outline-none md:p-6">
          {pageContent}
        </main>
      </div>

      {logoutConfirmOpen && (
        <ConfirmModal
          title="Log out of SmartAqua Pro?"
          confirmLabel="Log out"
          danger
          onConfirm={handleConfirmLogout}
          onCancel={() => setLogoutConfirmOpen(false)}
        />
      )}
    </div>
  );
}
