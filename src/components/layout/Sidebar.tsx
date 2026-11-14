import {
  LayoutDashboard,
  Activity,
  ClipboardCheck,
  ClipboardList,
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
  LifeBuoy,
  PlusCircle,
  UserPlus,
  Building2,
  ScrollText,
  SlidersHorizontal,
  FileBarChart,
  Wrench,
} from 'lucide-react';

/** Sprint 3: navigation follows the access role, not only the platform role. */
export type NavRole = 'Admin' | 'owner' | 'caretaker' | 'none';

interface SidebarProps {
  currentPage: string;
  onNavigate: (page: string) => void;
  navRole: NavRole;
  onLogout: () => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

type MenuItem = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles: NavRole[];
};

const menuGroups: { label: string; items: MenuItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'owner', 'caretaker', 'none'] },
      { id: 'monitoring', label: 'Monitoring', icon: Activity, roles: ['owner', 'caretaker'] },
      { id: 'assessment', label: 'Assessment', icon: ClipboardCheck, roles: ['owner', 'caretaker'] },
      { id: 'recommendations', label: 'Recommendations', icon: ClipboardList, roles: ['owner', 'caretaker'] },
      { id: 'alerts', label: 'Alerts', icon: Bell, roles: ['owner', 'caretaker'] },
    ],
  },
  {
    label: 'Manage',
    items: [
      { id: 'aquariums', label: 'Aquariums', icon: Fish, roles: ['owner'] },
      { id: 'maintenance', label: 'Maintenance', icon: Wrench, roles: ['owner', 'caretaker'] },
      { id: 'add-device', label: 'Add Device', icon: PlusCircle, roles: ['owner', 'caretaker', 'none'] },
      { id: 'team', label: 'Team', icon: UserPlus, roles: ['owner'] },
      { id: 'audit', label: 'Audit Log', icon: ScrollText, roles: ['owner'] },
      { id: 'automation', label: 'Automation', icon: Cpu, roles: ['owner'] },
      { id: 'datalogs', label: 'Data Logs', icon: BarChart3, roles: ['owner', 'caretaker'] },
      { id: 'reports', label: 'Reports', icon: FileBarChart, roles: ['owner', 'caretaker'] },
      { id: 'organizations', label: 'Organizations', icon: Building2, roles: ['Admin'] },
      { id: 'device-inventory', label: 'Device Inventory', icon: Cpu, roles: ['Admin'] },
      { id: 'users', label: 'User Directory', icon: Users, roles: ['Admin'] },
      { id: 'rules', label: 'Rules Editor', icon: SlidersHorizontal, roles: ['Admin'] },
      { id: 'admin-audit', label: 'Audit Log', icon: ScrollText, roles: ['Admin'] },
    ],
  },
  {
    label: 'Account',
    items: [
      { id: 'settings', label: 'Settings', icon: Settings, roles: ['Admin', 'owner', 'caretaker', 'none'] },
      { id: 'support', label: 'Support', icon: LifeBuoy, roles: ['Admin', 'owner', 'caretaker', 'none'] },
    ],
  },
];

const insetFocus = 'focus-visible:outline-offset-[-2px]';

export default function Sidebar({
  currentPage,
  onNavigate,
  navRole,
  onLogout,
  isOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}: SidebarProps) {

  const renderBrand = (showText: boolean) => (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-teal-600">
        <Waves className="h-5 w-5 text-teal-950" aria-hidden="true" />
      </div>
      {showText && (
        <div>
          <p className="text-base font-semibold text-white">SmartAqua</p>
          <p className="text-xs text-slate-400">AquariTech Solutions</p>
        </div>
      )}
    </div>
  );

  const renderNav = (showLabels: boolean) => (
    <nav aria-label="Main" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {menuGroups.map((group) => {
        const items = group.items.filter((item) => item.roles.includes(navRole));

        if (items.length === 0) {
          return null;
        }

        return (
          <div key={group.label} className="space-y-1">
            {showLabels && <p className="px-3 pb-1 text-xs font-medium text-slate-400">{group.label}</p>}
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.id)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.label}
                  title={showLabels ? undefined : item.label}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 transition-colors duration-150 ${insetFocus} ${
                    showLabels ? '' : 'justify-center'
                  } ${
                    isActive
                      ? 'bg-teal-600 font-semibold text-white'
                      : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                  {showLabels && <span className="text-sm">{item.label}</span>}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const renderLogout = (showLabel: boolean) => (
    <button
      type="button"
      onClick={onLogout}
      aria-label="Log out"
      title="Log out"
      className={`flex w-full items-center gap-3 px-6 py-4 text-slate-400 transition-colors hover:bg-slate-800 hover:text-rose-300 ${insetFocus} ${
        showLabel ? '' : 'justify-center'
      }`}
    >
      <LogOut className="h-5 w-5 flex-shrink-0" />
      {showLabel && <span className="text-sm font-medium">Log out</span>}
    </button>
  );

  return (
    <>
      <aside
        inert={!isOpen}
        className={`fixed left-0 top-0 z-50 flex h-full w-64 flex-col border-r border-slate-700 bg-slate-900 transition-transform duration-300 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-700 px-4 py-5">
          {renderBrand(true)}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-slate-300 hover:text-white"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {renderNav(true)}
        <div className="border-t border-slate-700">{renderLogout(true)}</div>
      </aside>

      <aside
        className={`fixed left-0 top-0 z-50 hidden h-full flex-col border-r border-slate-700 bg-slate-900 transition-all duration-300 lg:flex ${
          collapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="border-b border-slate-700 px-5 py-5">{renderBrand(!collapsed)}</div>
        {renderNav(!collapsed)}
        <div className="border-t border-slate-700">
          {renderLogout(!collapsed)}
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            className={`flex w-full items-center justify-center border-t border-slate-700 py-4 text-slate-300 transition-colors hover:text-white ${insetFocus}`}
          >
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
          </button>
        </div>
      </aside>
    </>
  );
}
