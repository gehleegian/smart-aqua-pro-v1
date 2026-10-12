import { useState } from 'react';
import {
  LayoutDashboard,
  Activity,
  Cpu,
  Bell,
  BarChart3,
  Fish,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  Waves,
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
  { id: 'automation', label: 'Automation', icon: Cpu, roles: ['Admin'] },
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
        className={`fixed left-0 top-0 z-50 h-full w-64 border-r border-slate-600/30 bg-slate-900/95 shadow-xl shadow-slate-950/20 backdrop-blur transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-600/30 px-4 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-500/15 ring-1 ring-teal-300/30">
              <Waves className="h-6 w-6 text-teal-200" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">SmartAqua</h1>
              <p className="text-xs text-teal-300">AquariTech Solutions</p>
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
                    ? 'border-r-2 border-teal-300 bg-teal-400/12 text-teal-200'
                    : 'text-slate-300 hover:bg-slate-800/65 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                <span className="text-sm font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-600/30">
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
        className={`fixed left-0 top-0 z-50 hidden h-full border-r border-slate-600/30 bg-slate-900/95 shadow-xl shadow-slate-950/20 backdrop-blur transition-all duration-300 lg:block ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="flex items-center gap-3 border-b border-slate-600/30 px-4 py-5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-teal-500/15 ring-1 ring-teal-300/30">
            <Waves className="h-6 w-6 text-teal-200" />
          </div>

          {!collapsed && (
            <div>
              <h1 className="text-lg font-bold text-white">SmartAqua</h1>
              <p className="text-xs text-teal-300">AquariTech Solutions</p>
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
                    ? 'border-r-2 border-teal-300 bg-teal-400/12 text-teal-200'
                    : 'text-slate-300 hover:bg-slate-800/65 hover:text-white'
                }`}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span className="text-sm font-medium">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-600/30">
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
            className="flex w-full items-center justify-center border-t border-slate-600/30 py-4 text-slate-400 transition-colors hover:text-white"
          >
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
          </button>
        </div>
      </aside>
    </>
  );
}
