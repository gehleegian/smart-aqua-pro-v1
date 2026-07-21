import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Info,
  LogOut,
  Menu,
  Search,
  Wifi,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useHeaderController } from '../../hooks/useHeaderController';
import type { UserData } from '../../types/user';
import { formatRelativeTime } from '../../utils/alertsHelpers';

interface HeaderProps {
  currentPage: string;
  user: UserData;
  onLogout: () => void;
  onMenuClick: () => void;
}

const pageNames: Record<string, string> = {
  dashboard: 'Dashboard',
  monitoring: 'Real-time Monitoring',
  alerts: 'Alerts & Notifications',
  datalogs: 'Data Logs & Reports',
  aquariums: 'Aquarium Management',
  users: 'User Management',
  settings: 'Settings & Configuration',
};

function getConnectionClasses(tone: 'online' | 'warning' | 'offline') {
  if (tone === 'online') {
    return 'bg-emerald-500/20 text-emerald-400';
  }

  if (tone === 'offline') {
    return 'bg-red-500/20 text-red-400';
  }

  return 'bg-amber-500/20 text-amber-300';
}

export default function Header({ currentPage, user, onLogout, onMenuClick }: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const header = useHeaderController(user);

  const connectionClasses = useMemo(
    () => getConnectionClasses(header.connectionStatus.tone),
    [header.connectionStatus.tone]
  );

  return (
    <>
      <header
        className="h-16 bg-slate-900/80 backdrop-blur-sm border-b border-slate-700/50 flex items-center justify-between px-4 md:px-6"
        style={{ position: 'relative', zIndex: 100 }}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 text-slate-400 hover:text-white transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <h2 className="text-lg md:text-xl font-semibold text-white">
            {pageNames[currentPage] || 'Dashboard'}
          </h2>
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

          <div
            className={`hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium ${connectionClasses}`}
            title={header.connectionStatus.detail}
          >
            <Wifi className="w-3.5 h-3.5" />
            {header.connectionStatus.label}
          </div>

          <button
            onClick={() => setShowNotifications((current) => !current)}
            className="relative p-2 text-slate-400 hover:text-white transition-colors"
            title={
              header.notifications.length > 0
                ? `${header.notifications.length} active notifications`
                : 'No active notifications'
            }
          >
            <Bell className="w-5 h-5" />
            {header.unreadCount > 0 && (
              <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                {header.unreadCount}
              </span>
            )}
          </button>

          <div className="hidden md:flex items-center gap-3 pl-4 border-l border-slate-700">
            <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {user.name
                  .split(' ')
                  .map((namePart) => namePart[0])
                  .join('')}
              </span>
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

      {showNotifications && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 998 }}
            onClick={() => setShowNotifications(false)}
          />
          <div
            style={{ position: 'fixed', top: '64px', right: '80px', zIndex: 999, width: '360px' }}
          >
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
                <div>
                  <h3 className="text-sm font-semibold text-white">Live Notifications</h3>
                  <p className="text-xs text-slate-500 mt-1">{header.connectionStatus.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  {header.unreadCount > 0 && (
                    <button
                      onClick={header.actions.markAllNotificationsRead}
                      className="text-xs text-cyan-400 hover:text-cyan-300"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-white"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="overflow-y-auto" style={{ maxHeight: '360px' }}>
                {header.notifications.length > 0 ? (
                  header.notifications.map((notification) => {
                    const TypeIcon =
                      notification.type === 'critical'
                        ? AlertCircle
                        : notification.type === 'warning'
                          ? AlertTriangle
                          : Info;
                    const iconColor =
                      notification.type === 'critical'
                        ? 'text-red-400'
                        : notification.type === 'warning'
                          ? 'text-amber-400'
                          : 'text-cyan-400';
                    const bgColor =
                      notification.type === 'critical'
                        ? 'bg-red-500/10'
                        : notification.type === 'warning'
                          ? 'bg-amber-500/10'
                          : 'bg-cyan-500/10';

                    return (
                      <div
                        key={notification.id}
                        onClick={() => header.actions.markNotificationRead(notification.id)}
                        className={`flex items-start gap-3 px-4 py-3 border-b border-slate-700/50 cursor-pointer hover:bg-slate-700/30 transition-all ${
                          !notification.read ? bgColor : ''
                        }`}
                      >
                        <TypeIcon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${iconColor}`} />
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm ${
                              !notification.read
                                ? 'text-white font-medium'
                                : 'text-slate-300'
                            }`}
                          >
                            {notification.message}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>Tank: {notification.tankName}</span>
                            {user.role === 'Admin' ? (
                              <span>Owner: {notification.ownerName}</span>
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {formatRelativeTime(notification.timestamp)}
                          </p>
                        </div>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0" />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div className="px-4 py-10 text-center">
                    <p className="text-sm text-slate-300">No active notifications right now.</p>
                    <p className="text-xs text-slate-500 mt-1">
                      The header will list real alert conditions as they appear.
                    </p>
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-slate-700">
                <button
                  onClick={() => setShowNotifications(false)}
                  className="w-full text-center text-xs text-cyan-400 hover:text-cyan-300 font-medium"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
