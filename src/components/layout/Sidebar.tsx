import { useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  Bell,
  BarChart3,
  Fish,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  X,
} from 'lucide-react';
import type { UserRole } from '../../types/user';
import { normalizeRole } from '../../utils/roleHelpers';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  userRole: UserRole;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
}

type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: UserRole[];
};

const allMenuItems: MenuItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'User'] },
  { id: 'monitoring', label: 'Monitoring', icon: Activity, roles: ['Admin', 'User'] },
  { id: 'alerts', label: 'Alerts', icon: Bell, roles: ['Admin', 'User'] },
  { id: 'datalogs', label: 'Data Logs', icon: BarChart3, roles: ['Admin', 'User'] },
  { id: 'aquariums', label: 'Aquariums', icon: Fish, roles: ['Admin', 'User'] },
  { id: 'users', label: 'Users', icon: Users, roles: ['Admin'] },
  { id: 'settings', label: 'Settings', icon: Settings, roles: ['Admin', 'User'] },
];

export default function Sidebar({
  currentPage,
  onNavigate,
  userRole,
  onLogout,
  isOpen,
  onClose,
}: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  const normalizedRole = normalizeRole(userRole);
  const menuItems = allMenuItems.filter((item) => item.roles.includes(normalizedRole));

  return (
    <>
      <aside
        className={`fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-700/50 z-50 w-64 transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-5 border-b border-slate-700/50">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
              <img
                src="/smartaqua-logo.png"
                alt="SmartAqua logo"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-white leading-none">SmartAqua</h1>
              <p className="text-xs text-cyan-400 mt-1">AquariTech Solutions</p>
            </div>
          </div>

          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-600/20 text-cyan-400 border-r-2 border-cyan-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-700/50">
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      <aside
        className={`hidden lg:block fixed left-0 top-0 h-full bg-slate-900 border-r border-slate-700/50 z-50 transition-all duration-300 ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex items-center gap-2.5 px-4 py-5 border-b border-slate-700/50">
          <div className="w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden flex-shrink-0">
            <img
              src="/smartaqua-logo.png"
              alt="SmartAqua logo"
              className="w-full h-full object-contain"
            />
          </div>

          {!collapsed && (
            <div className="leading-tight">
              <h1 className="text-lg font-bold text-white leading-none">SmartAqua</h1>
              <p className="text-xs text-cyan-400 mt-1">AquariTech Solutions</p>
            </div>
          )}
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 transition-all duration-200 ${
                  isActive
                    ? 'bg-cyan-600/20 text-cyan-400 border-r-2 border-cyan-400'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-700/50">
          <button
            onClick={onLogout}
            className={`w-full flex items-center gap-3 px-4 py-4 text-red-400 hover:bg-red-500/10 transition-all ${
              collapsed ? 'justify-center' : ''
            }`}
            title="Sign Out"
          >
            <LogOut className="w-5 h-5 flex-shrink-0" />
            {!collapsed && <span className="text-sm font-medium">Sign Out</span>}
          </button>

          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-center py-4 border-t border-slate-700/50 text-slate-400 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </aside>
    </>
  );
}
