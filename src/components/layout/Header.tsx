import { Search, Bell, Wifi, LogOut, Menu, X, AlertCircle, AlertTriangle, Info, Sun, Moon } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  currentPage: string;
  user: { name: string; email: string; role: string };
  onLogout: () => void;
  onMenuClick: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
}

const pageNames: Record<string, string> = {
  dashboard: 'Dashboard',
  monitoring: 'Real-time Monitoring',
  automation: 'Automation & Control',
  alerts: 'Alerts & Notifications',
  datalogs: 'Data Logs & Reports',
  aquariums: 'Aquarium Management',
  users: 'User Management',
  settings: 'Settings & Configuration',
};

const notifications = [
  { id: 1, type: 'critical', message: 'Power outage detected - running on backup', time: '2 min ago', read: false },
  { id: 2, type: 'warning', message: 'Water level below threshold in Tank D', time: '15 min ago', read: false },
  { id: 3, type: 'critical', message: 'Temperature spike detected in Tank A', time: '1 hr ago', read: false },
  { id: 4, type: 'info', message: 'Feeding completed for Tank A', time: '2 hrs ago', read: true },
  { id: 5, type: 'info', message: 'Filtration cycle completed', time: '3 hrs ago', read: true },
  { id: 6, type: 'warning', message: 'Water quality dropping in Tank D', time: '4 hrs ago', read: true },
];

export default function Header({
  currentPage,
  user,
  onLogout,
  onMenuClick,
  theme,
  onThemeToggle,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifList, setNotifList] = useState(notifications);

  const unreadCount = notifList.filter((n) => !n.read).length;

  const markAsRead = (id: number) => {
    setNotifList(notifList.map((n) => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifList(notifList.map((n) => ({ ...n, read: true })));
  };

  return (
    <>
      <header className="flex h-16 items-center justify-between border-b border-slate-600/30 bg-slate-900/80 px-4 shadow-sm shadow-slate-950/10 backdrop-blur md:px-6" style={{ position: 'relative', zIndex: 100 }}>
        <div className="flex items-center gap-3">
          <button onClick={onMenuClick} className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg md:text-xl font-semibold text-white">{pageNames[currentPage] || 'Dashboard'}</h2>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="relative hidden md:block">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-48 rounded-lg border border-slate-600/40 bg-slate-950/25 py-2 pl-10 pr-4 text-sm text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/70"
            />
          </div>

          <div className="hidden items-center gap-2 rounded-lg border border-emerald-400/20 bg-emerald-500/12 px-3 py-1.5 text-xs font-medium text-emerald-300 sm:flex">
            <Wifi className="w-3.5 h-3.5" />
            Online
          </div>

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

          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>

          <div className="hidden items-center gap-3 border-l border-slate-600/40 pl-4 md:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-500/20 ring-1 ring-teal-300/30">
              <span className="text-xs font-bold text-white">{user.name.split(' ').map((n) => n[0]).join('')}</span>
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 rounded-lg border border-rose-400/25 bg-rose-500/12 px-2 py-1.5 text-xs font-medium text-rose-300 transition-all hover:bg-rose-500/20 hover:text-rose-200 md:px-3"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Notification Dropdown - OUTSIDE the header */}
      {showNotifications && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setShowNotifications(false)} />
          <div style={{ position: 'fixed', top: '64px', right: '80px', zIndex: 999, width: '320px' }}>
            <div className="overflow-hidden rounded-xl border border-slate-600/40 bg-slate-900/95 shadow-2xl shadow-slate-950/30 backdrop-blur">
              <div className="flex items-center justify-between border-b border-slate-600/30 px-4 py-3">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-teal-200 hover:text-teal-100">Mark all read</button>
                  )}
                  <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '288px' }}>
                {notifList.map((notif) => {
                  const TypeIcon = notif.type === 'critical' ? AlertCircle : notif.type === 'warning' ? AlertTriangle : Info;
                  const iconColor = notif.type === 'critical' ? 'text-rose-300' : notif.type === 'warning' ? 'text-amber-300' : 'text-teal-200';
                  const bgColor = notif.type === 'critical' ? 'bg-rose-500/10' : notif.type === 'warning' ? 'bg-amber-500/10' : 'bg-teal-500/10';

                  return (
                    <div
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className={`flex cursor-pointer items-start gap-3 border-b border-slate-600/25 px-4 py-3 transition-all hover:bg-slate-800/60 ${!notif.read ? bgColor : ''}`}
                    >
                      <TypeIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.read ? 'text-white font-medium' : 'text-slate-400'}`}>{notif.message}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{notif.time}</p>
                      </div>
                      {!notif.read && <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-teal-300" />}
                    </div>
                  );
                })}
              </div>

              <div className="border-t border-slate-600/30 px-4 py-3">
                <button onClick={() => setShowNotifications(false)} className="w-full text-center text-xs font-medium text-teal-200 hover:text-teal-100">
                  View All Notifications
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
