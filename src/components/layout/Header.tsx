import { Search, Bell, Wifi, LogOut, Menu, X, AlertCircle, AlertTriangle, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import OrgSwitcher from '../org/OrgSwitcher';
import RoleBadge from '../org/RoleBadge';
import { getInitials } from '../../utils/monitoringHelpers';
import { useHeaderAlerts } from '../../hooks/useHeaderAlerts';

interface HeaderProps {
  currentPage: string;
  user: { name: string; email: string; role: string };
  onLogout: () => void;
  onMenuClick: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onNavigate?: (page: string) => void;
}

const pageNames: Record<string, string> = {
  dashboard: 'Dashboard',
  monitoring: 'Real-time Monitoring',
  alerts: 'Alerts & Notifications',
  datalogs: 'Data Logs & Reports',
  aquariums: 'Aquarium Management',
  users: 'User & Aquarium Directory',
  support: 'Support Messages',
  settings: 'Settings & Configuration',
  'add-device': 'Add Device',
  setup: 'Aquarium Setup',
  team: 'Team',
  organizations: 'Organizations',
  invite: 'Accept Invite',
};

export default function Header({
  currentPage,
  user,
  onLogout,
  onMenuClick,
  theme,
  onThemeToggle,
  onNavigate,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const isAdmin = user.role === 'Admin';
  const headerAlerts = useHeaderAlerts(!isAdmin);
  const unreadCount = headerAlerts.unread.length;

  const markAllRead = () => headerAlerts.unread.forEach((alert) => void headerAlerts.markRead(alert.id));

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-slate-600/30 bg-slate-900/80 px-4 shadow-sm shadow-slate-950/10 backdrop-blur md:px-6 relative z-30">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onMenuClick} aria-label="Open menu" className="rounded-lg p-2 text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300 lg:hidden">
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 className="truncate text-lg md:text-xl font-semibold text-white">{pageNames[currentPage] || 'Dashboard'}</h2>
        </div>

        <div className="flex flex-shrink-0 items-center gap-2 md:gap-4">
          {!isAdmin && <div className="relative hidden md:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search (coming soon)"
              aria-label="Search (coming soon)"
              disabled
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-52 cursor-not-allowed rounded-lg border border-slate-600/40 bg-slate-950/25 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/70"
            />
          </div>}

          {!isAdmin && <div className="hidden items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-300 sm:flex">
            <Wifi className="w-3.5 h-3.5" />
            Online
          </div>}

          {!isAdmin && <OrgSwitcher />}

          <button
            type="button"
            onClick={onThemeToggle}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-600/40 bg-slate-950/25 px-2.5 py-2 text-xs font-medium text-slate-300 transition-all hover:bg-slate-800/60 hover:text-white sm:px-3"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            <span className="hidden sm:inline">{theme === 'dark' ? 'Light' : 'Dark'}</span>
          </button>

          {!isAdmin && <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={`Notifications, ${unreadCount} unread`}
            aria-expanded={showNotifications}
            className="relative rounded-lg p-2 text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300"
          >
            <Bell className="w-5 h-5" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>}

          <div className="hidden items-center gap-3 border-l border-slate-600/40 pl-4 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 ring-1 ring-teal-300/30">
              <span className="text-xs font-bold text-white">{getInitials(user.name)}</span>
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">{user.name}</p>
              <RoleBadge platformRole={user.role} />
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/12 px-2 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-200 focus-visible:outline-2 focus-visible:outline-rose-300 md:px-3"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Log out</span>
          </button>
        </div>
      </header>

      {/* Notification Dropdown - OUTSIDE the header */}
      {!isAdmin && showNotifications && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifications(false)} />
          <div className="fixed left-4 right-4 top-16 z-[999] sm:left-auto sm:right-20 sm:w-80">
            <div className="overflow-hidden rounded-xl border border-slate-600/40 bg-slate-900/95 shadow-2xl shadow-slate-950/30 backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-600/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">Notifications</h3>
                </div>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-teal-200 hover:text-teal-100">Mark all read</button>
                  )}
                  <button type="button" onClick={() => setShowNotifications(false)} aria-label="Close notifications" className="rounded text-slate-300 hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300">
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '288px' }}>
                {headerAlerts.alerts.length === 0 && (
                  <p className="px-4 py-6 text-center text-sm text-slate-400">No active alerts.</p>
                )}
                {headerAlerts.alerts.map((alert) => {
                  const TypeIcon = alert.type === 'critical' ? AlertCircle : AlertTriangle;
                  const iconColor = alert.type === 'critical' ? 'text-rose-300' : 'text-amber-300';
                  const bgColor = alert.type === 'critical' ? 'bg-rose-500/10' : 'bg-amber-500/10';
                  const unread = alert.acknowledgedAt === null;
                  return (
                    <button
                      type="button"
                      key={alert.id}
                      onClick={() => { if (unread) void headerAlerts.markRead(alert.id); }}
                      className={`flex w-full items-start gap-3 border-b border-slate-600/25 px-4 py-3 text-left transition-all hover:bg-slate-800/60 ${unread ? bgColor : ''}`}
                    >
                      <TypeIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${iconColor}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${unread ? 'font-medium text-white' : 'text-slate-400'}`}>{alert.tankName}: {alert.title ?? alert.message}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{new Date(alert.lastDetectedAt).toLocaleString()}</p>
                      </div>
                      {unread && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-teal-300" />}
                    </button>
                  );
                })}
              </div>

              <div className="border-t border-slate-600/30 px-4 py-3">
                <button onClick={() => { setShowNotifications(false); onNavigate?.('alerts'); }} className="w-full text-center text-xs font-medium text-teal-200 hover:text-teal-100">
                  View all alerts
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
