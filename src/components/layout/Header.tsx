import { Bell, LogOut, Menu, X, AlertCircle, AlertTriangle, Sun, Moon } from 'lucide-react';
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
  assessment: 'Aquarium Assessment',
  recommendations: 'Recommendations',
  maintenance: 'Aquarium Maintenance',
  alerts: 'Alerts & Notifications',
  datalogs: 'Data Logs',
  reports: 'Reports',
  aquariums: 'Aquarium Management',
  users: 'User & Aquarium Directory',
  support: 'Support Messages',
  settings: 'Settings & Configuration',
  'add-device': 'Add Device',
  setup: 'Aquarium Setup',
  team: 'Team',
  organizations: 'Organizations',
  'device-inventory': 'Device Inventory',
  audit: 'Audit Log',
  'admin-audit': 'Audit Log',
  rules: 'Rules & Species Editor',
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
  const [showNotifications, setShowNotifications] = useState(false);
  const isAdmin = user.role === 'Admin';
  const headerAlerts = useHeaderAlerts(!isAdmin);
  const unreadCount = headerAlerts.unread.length;

  const markAllRead = () => headerAlerts.unread.forEach((alert) => void headerAlerts.markRead(alert.id));

  return (
    <>
      <header className="relative z-30 flex h-16 items-center justify-between gap-4 border-b border-slate-700 bg-slate-900 px-4 md:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onMenuClick} aria-label="Open menu" className="rounded-lg p-2 text-slate-300 transition-colors hover:text-white focus-visible:outline-2 focus-visible:outline-teal-300 lg:hidden">
            <Menu className="w-5 h-5" aria-hidden="true" />
          </button>
          <h2 className="truncate text-lg font-semibold tracking-tight text-white">{pageNames[currentPage] || 'Dashboard'}</h2>
        </div>

        <div className="flex flex-shrink-0 items-center gap-1 sm:gap-2">

          {!isAdmin && <OrgSwitcher />}

          <button
            type="button"
            onClick={onThemeToggle}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
          >
            {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" aria-hidden="true" /> : <Moon className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>

          {!isAdmin && <button
            type="button"
            onClick={() => setShowNotifications(!showNotifications)}
            aria-label={`Notifications, ${unreadCount} unread${headerAlerts.unreadSeverity === 'critical' ? ', including critical' : ''}`}
            aria-expanded={showNotifications}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
          >
            <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
            {unreadCount > 0 && (
              <span className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${headerAlerts.unreadSeverity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'}`}>
                {unreadCount}
              </span>
            )}
          </button>}

          <div className="ml-1 flex items-center gap-3 border-l border-slate-700 pl-3 sm:ml-2 sm:pl-4" title={user.name}>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-teal-600">
              <span className="text-xs font-semibold text-teal-950">{getInitials(user.name)}</span>
            </div>
            <div className="hidden min-w-0 text-left xl:block">
              <p className="max-w-40 truncate text-sm font-medium leading-tight text-white">{user.name}</p>
              <RoleBadge platformRole={user.role} />
            </div>
          </div>

          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            title="Log out"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-300"
          >
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Notification Dropdown - OUTSIDE the header */}
      {!isAdmin && showNotifications && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifications(false)} />
          <div className="fixed left-4 right-4 top-16 z-[999] sm:left-auto sm:right-20 sm:w-80">
            <div className="overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-xl">
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
