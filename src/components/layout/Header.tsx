import { Search, Bell, Wifi, LogOut, Menu, X, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';

interface HeaderProps {
  currentPage: string;
  user: { name: string; email: string; role: string };
  onLogout: () => void;
  onMenuClick: () => void;
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

export default function Header({ currentPage, user, onLogout, onMenuClick }: HeaderProps) {
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
      <header className="h-16 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center justify-between px-4 md:px-6" style={{ position: 'relative', zIndex: 100 }}>
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
              className="pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 w-48"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/20 text-emerald-400">
            <Wifi className="w-3.5 h-3.5" />
            Online
          </div>

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

          <div className="hidden md:flex items-center gap-3 pl-4 border-l border-slate-700">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">{user.name.split(' ').map((n) => n[0]).join('')}</span>
            </div>
            <div className="text-left">
              <p className="text-sm text-white font-medium">{user.name}</p>
              <p className="text-xs text-slate-500">{user.role}</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 hover:text-red-300 rounded-lg text-xs font-medium transition-all"
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
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <h3 className="text-sm font-semibold text-white">Notifications</h3>
                <div className="flex items-center gap-2">
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="text-xs text-cyan-400 hover:text-cyan-300">Mark all read</button>
                  )}
                  <button onClick={() => setShowNotifications(false)} className="text-slate-400 hover:text-white">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '288px' }}>
                {notifList.map((notif) => {
                  const TypeIcon = notif.type === 'critical' ? AlertCircle : notif.type === 'warning' ? AlertTriangle : Info;
                  const iconColor = notif.type === 'critical' ? 'text-red-400' : notif.type === 'warning' ? 'text-amber-400' : 'text-cyan-400';
                  const bgColor = notif.type === 'critical' ? 'bg-red-500/10' : notif.type === 'warning' ? 'bg-amber-500/10' : 'bg-cyan-500/10';

                  return (
                    <div
                      key={notif.id}
                      onClick={() => markAsRead(notif.id)}
                      className={`flex items-start gap-3 px-4 py-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-all ${!notif.read ? bgColor : ''}`}
                    >
                      <TypeIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm ${!notif.read ? 'text-white font-medium' : 'text-slate-400'}`}>{notif.message}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{notif.time}</p>
                      </div>
                      {!notif.read && <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0" />}
                    </div>
                  );
                })}
              </div>

              <div className="px-4 py-3 border-t border-slate-700">
                <button onClick={() => setShowNotifications(false)} className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300 font-medium">
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