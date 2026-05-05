import { useEffect, useMemo, useState } from 'react';
import {
  Thermometer,
  Droplets,
  Waves,
  Activity,
  Fish,
  Gauge,
  Cpu,
  Users,
  Eye,
  ArrowLeft,
  RefreshCw,
  MoreVertical,
  Pencil,
  X,
  Clock,
  Sun,
  Wind,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { auth } from '../firebase';
import { getAllUsers, getCurrentUserProfile } from '../services/userService';
import {
  getAllAquariums,
  getAquariumsByOwner,
  updateAquarium,
} from '../services/aquariumService';
import type { Aquarium, AutomationSettings, FilterMode } from '../types/aquarium';
import type { UserData, UserRole } from '../types/user';
import {
  getHealthStatus,
  getQualityLabel,
  getLevelLabel,
  getTemperatureLabel,
} from '../utils/monitoringHelpers';

type MonitoringAquarium = Aquarium & {
  healthStatus: 'healthy' | 'warning';
};

type OwnerStats = {
  totalTanks: number;
  healthyTanks: number;
  warningTanks: number;
  averageTemp: number;
  averageLevel: number;
  averageQuality: number;
  activeFeeders: number;
  activeFilters: number;
  lightsOn: number;
};

type MonitoringOwner = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  aquariums: MonitoringAquarium[];
  stats: OwnerStats;
};

type SystemField = 'feeder' | 'light' | 'filter';

const systemStatusConfig: Record<
  SystemField,
  { activeValue: string; inactiveValue: string }
> = {
  feeder: { activeValue: 'Active', inactiveValue: 'Inactive' },
  light: { activeValue: 'On', inactiveValue: 'Off' },
  filter: { activeValue: 'Active', inactiveValue: 'Inactive' },
};

const defaultAutomationSettings: AutomationSettings = {
  feedingTime: '08:00',
  lightOnTime: '06:00',
  lightOffTime: '22:00',
  filtrationMode: 'Medium',
  filtrationStartTime: '07:00',
  filtrationRuntimeHours: 8,
};

const getAutomationSettings = (
  aquarium: Pick<Aquarium, 'automationSettings'> | null
): AutomationSettings => ({
  ...defaultAutomationSettings,
  ...(aquarium?.automationSettings || {}),
});

const formatAutomationTime = (time: string) => {
  if (!time) {
    return 'Not set';
  }

  const [hourText, minuteText] = time.split(':');
  const hour = Number(hourText);
  const minute = Number(minuteText);

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return time;
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(2026, 0, 1, hour, minute));
};

const buildOwnerStats = (ownerAquariums: MonitoringAquarium[]): OwnerStats => {
  const totalTanks = ownerAquariums.length;
  const average = (field: 'temp' | 'level' | 'quality') =>
    totalTanks === 0
      ? 0
      : ownerAquariums.reduce((sum, aquarium) => sum + aquarium[field], 0) / totalTanks;

  return {
    totalTanks,
    healthyTanks: ownerAquariums.filter((aquarium) => aquarium.healthStatus === 'healthy').length,
    warningTanks: ownerAquariums.filter((aquarium) => aquarium.healthStatus === 'warning').length,
    averageTemp: average('temp'),
    averageLevel: average('level'),
    averageQuality: average('quality'),
    activeFeeders: ownerAquariums.filter((aquarium) => aquarium.feeder === 'Active').length,
    activeFilters: ownerAquariums.filter((aquarium) => aquarium.filter === 'Active').length,
    lightsOn: ownerAquariums.filter((aquarium) => aquarium.light === 'On').length,
  };
};

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'U';

const formatAverage = (value: number, total: number, suffix = '') =>
  total === 0 ? 'No data' : `${value.toFixed(1)}${suffix}`;

type IconComponent = React.ComponentType<{ className?: string }>;

type StatCardProps = {
  icon: IconComponent;
  label: string;
  value: React.ReactNode;
  caption: string;
  iconBg: string;
  iconColor: string;
};

function StatCard({ icon: Icon, label, value, caption, iconBg, iconColor }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">{label}</p>
            <p className="text-2xl font-bold text-white mt-1">{value}</p>
            <p className="text-xs text-slate-500 mt-1">{caption}</p>
          </div>
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${iconBg}`}>
            <Icon className={`w-6 h-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OwnerCard({
  owner,
  onView,
}: {
  owner: MonitoringOwner;
  onView: (owner: MonitoringOwner) => void;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-bold text-white">{getInitials(owner.name)}</span>
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-white truncate">{owner.name}</h3>
              <p className="text-xs text-slate-500 truncate">{owner.email}</p>
            </div>
          </div>

          <Badge variant={owner.role === 'Admin' ? 'danger' : 'info'}>{owner.role}</Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-white">{owner.stats.totalTanks}</p>
            <p className="text-xs text-slate-500">Tanks</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-emerald-400">{owner.stats.healthyTanks}</p>
            <p className="text-xs text-slate-500">Healthy</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-lg font-bold text-amber-400">{owner.stats.warningTanks}</p>
            <p className="text-xs text-slate-500">Warnings</p>
          </div>
        </div>

        <button
          onClick={() => onView(owner)}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </CardContent>
    </Card>
  );
}

function AquariumOverviewCard({
  aquarium,
  onView,
}: {
  aquarium: MonitoringAquarium;
  onView: (aquarium: MonitoringAquarium) => void;
}) {
  const temperatureLabel = getTemperatureLabel(aquarium.temp, aquarium.minTemp, aquarium.maxTemp);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-white truncate">{aquarium.name}</h3>
            <p className="text-sm text-slate-400 mt-1 truncate">
              {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species set'}
            </p>
          </div>
          <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
            {aquarium.healthStatus}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-5">
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Thermometer className="w-4 h-4 text-orange-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">{aquarium.temp}&deg;C</p>
            <p className="text-xs text-slate-500">{temperatureLabel}</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Droplets className="w-4 h-4 text-blue-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">{aquarium.level}%</p>
            <p className="text-xs text-slate-500">Level</p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3 text-center">
            <Waves className="w-4 h-4 text-emerald-400 mx-auto mb-1" />
            <p className="text-base font-bold text-white">{aquarium.quality}%</p>
            <p className="text-xs text-slate-500">Quality</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-4">
          <Badge variant={aquarium.feeder === 'Active' ? 'success' : 'default'}>
            Feeder: {aquarium.feeder}
          </Badge>
          <Badge variant={aquarium.light === 'On' ? 'info' : 'default'}>
            Light: {aquarium.light}
          </Badge>
          <Badge variant={aquarium.filter === 'Active' ? 'success' : 'default'}>
            Filter: {aquarium.filter}
          </Badge>
        </div>

        <button
          onClick={() => onView(aquarium)}
          className="mt-5 w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-all shadow-lg shadow-cyan-600/20"
        >
          <Eye className="w-4 h-4" />
          View
        </button>
      </CardContent>
    </Card>
  );
}

function TankCard({ aquarium }: { aquarium: MonitoringAquarium }) {
  const temperatureLabel = getTemperatureLabel(aquarium.temp, aquarium.minTemp, aquarium.maxTemp);
  const levelLabel = getLevelLabel(aquarium.level);
  const qualityLabel = getQualityLabel(aquarium.quality);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">{aquarium.name}</h3>
            <p className="text-sm text-slate-400 mt-1">
              {aquarium.species.length > 0 ? aquarium.species.join(', ') : 'No species set'}
            </p>
          </div>
          <Badge variant={aquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
            {aquarium.healthStatus}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="text-center">
            <Thermometer className="w-5 h-5 text-orange-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">
              {aquarium.temp}&deg;C
            </p>
            <p className="text-xs text-slate-500">{temperatureLabel}</p>
          </div>
          <div className="text-center">
            <Droplets className="w-5 h-5 text-blue-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{aquarium.level}%</p>
            <p className="text-xs text-slate-500">{levelLabel}</p>
          </div>
          <div className="text-center">
            <Waves className="w-5 h-5 text-emerald-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-white">{aquarium.quality}%</p>
            <p className="text-xs text-slate-500">{qualityLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm mb-4">
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-xs text-slate-500">Temperature Range</p>
            <p className="text-white font-medium">
              {aquarium.minTemp}&deg;C - {aquarium.maxTemp}&deg;C
            </p>
          </div>
          <div className="rounded-lg bg-slate-800/60 p-3">
            <p className="text-xs text-slate-500">Bioload</p>
            <p className="text-white font-medium capitalize">{aquarium.bioload}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant={aquarium.feeder === 'Active' ? 'success' : 'default'}>
            Feeder: {aquarium.feeder}
          </Badge>
          <Badge variant={aquarium.light === 'On' ? 'info' : 'default'}>
            Light: {aquarium.light}
          </Badge>
          <Badge variant={aquarium.filter === 'Active' ? 'success' : 'default'}>
            Filter: {aquarium.filter}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function SystemToggle({
  active,
  disabled,
  label,
  onToggle,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Toggle ${label}`}
      aria-pressed={active}
      disabled={disabled}
      onClick={onToggle}
      className={`w-12 h-6 rounded-full transition-all duration-200 ${
        active ? 'bg-cyan-600' : 'bg-slate-600'
      } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
    >
      <div
        className={`w-5 h-5 bg-white rounded-full transition-all duration-200 ${
          active ? 'translate-x-6' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

export default function Monitoring() {
  const [aquariums, setAquariums] = useState<MonitoringAquarium[]>([]);
  const [users, setUsers] = useState<UserData[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedAquariumId, setSelectedAquariumId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [systemError, setSystemError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [userName, setUserName] = useState('');
  const [savingSystemKey, setSavingSystemKey] = useState('');
  const [systemMenuOpen, setSystemMenuOpen] = useState(false);
  const [showAutomationModal, setShowAutomationModal] = useState(false);
  const [automationDraft, setAutomationDraft] = useState<AutomationSettings>(
    defaultAutomationSettings
  );
  const [automationError, setAutomationError] = useState('');
  const [savingAutomation, setSavingAutomation] = useState(false);

  const loadMonitoringData = async () => {
    try {
      setLoading(true);
      setError('');
      setSystemError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariums([]);
        setUsers([]);
        setSelectedOwnerId('');
        return;
      }

      const userProfile = await getCurrentUserProfile(currentUser.uid);

      if (!userProfile) {
        setError('User profile not found.');
        setAquariums([]);
        setUsers([]);
        setSelectedOwnerId('');
        return;
      }

      setUserRole(userProfile.role);
      setUserName(userProfile.name);

      let aquariumData: Aquarium[] = [];
      let userData: UserData[] = [];

      if (userProfile.role === 'Admin') {
        const [allAquariums, allUsers] = await Promise.all([
          getAllAquariums(),
          getAllUsers(),
        ]);

        aquariumData = allAquariums;
        userData = allUsers;
      } else {
        aquariumData = await getAquariumsByOwner(currentUser.uid);
      }

      const monitoringData: MonitoringAquarium[] = aquariumData.map((aquarium) => ({
        ...aquarium,
        healthStatus: getHealthStatus(aquarium.level, aquarium.quality),
      }));

      setAquariums(monitoringData);
      setUsers(userData);

      if (userProfile.role === 'Admin') {
        setSelectedOwnerId((prev) => {
          if (!prev) {
            return '';
          }

          const ownerStillExists =
            userData.some((user) => user.id === prev) ||
            monitoringData.some((aquarium) => aquarium.ownerId === prev);

          return ownerStillExists ? prev : '';
        });
        setSelectedAquariumId('');
      } else if (monitoringData.length > 0) {
        setSelectedAquariumId((prev) =>
          prev && monitoringData.some((item) => item.id === prev)
            ? prev
            : ''
        );
      } else {
        setSelectedAquariumId('');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load monitoring data.');
      setSystemError('');
      setAquariums([]);
      setUsers([]);
      setSelectedOwnerId('');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadMonitoringData();
    }, 0);

    return () => window.clearTimeout(loadTimer);
  }, []);

  const ownerCards = useMemo<MonitoringOwner[]>(() => {
    const aquariumsByOwner = new Map<string, MonitoringAquarium[]>();

    for (const aquarium of aquariums) {
      const ownerId = aquarium.ownerId || 'unknown';
      const ownerAquariums = aquariumsByOwner.get(ownerId) || [];

      ownerAquariums.push(aquarium);
      aquariumsByOwner.set(ownerId, ownerAquariums);
    }

    const ownersFromUsers = users
      .filter((user): user is UserData & { id: string } => Boolean(user.id))
      .map((user) => {
        const ownerAquariums = aquariumsByOwner.get(user.id) || [];

        aquariumsByOwner.delete(user.id);

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          aquariums: ownerAquariums,
          stats: buildOwnerStats(ownerAquariums),
        };
      });

    const ownersFromAquariums = Array.from(aquariumsByOwner.entries()).map(
      ([ownerId, ownerAquariums]) => ({
        id: ownerId,
        name: ownerAquariums[0]?.ownerName || 'Unknown Owner',
        email: 'No account record',
        role: 'User' as UserRole,
        aquariums: ownerAquariums,
        stats: buildOwnerStats(ownerAquariums),
      })
    );

    return [...ownersFromUsers, ...ownersFromAquariums].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [aquariums, users]);

  const selectedOwner = useMemo(() => {
    return ownerCards.find((owner) => owner.id === selectedOwnerId);
  }, [ownerCards, selectedOwnerId]);

  const selectedAquarium = useMemo(() => {
    return aquariums.find((item) => item.id === selectedAquariumId) || null;
  }, [aquariums, selectedAquariumId]);

  const updateAquariumStatusInState = (
    aquariumId: string,
    updates: Partial<Pick<Aquarium, SystemField>>
  ) => {
    setAquariums((prev) =>
      prev.map((aquarium) =>
        aquarium.id === aquariumId ? { ...aquarium, ...updates } : aquarium
      )
    );
  };

  const updateAquariumAutomationInState = (
    aquariumId: string,
    automationSettings: AutomationSettings | undefined
  ) => {
    setAquariums((prev) =>
      prev.map((aquarium) =>
        aquarium.id === aquariumId
          ? { ...aquarium, automationSettings }
          : aquarium
      )
    );
  };

  const openAutomationEditor = () => {
    if (!selectedAquarium) {
      return;
    }

    setAutomationDraft(getAutomationSettings(selectedAquarium));
    setAutomationError('');
    setSystemMenuOpen(false);
    setShowAutomationModal(true);
  };

  const updateAutomationDraft = <Field extends keyof AutomationSettings>(
    field: Field,
    value: AutomationSettings[Field]
  ) => {
    setAutomationDraft((prev) => ({ ...prev, [field]: value }));
  };

  const handleSystemToggle = async (field: SystemField) => {
    if (!selectedAquarium) {
      return;
    }

    const statusConfig = systemStatusConfig[field];
    const currentValue = selectedAquarium[field];
    const nextValue =
      currentValue === statusConfig.activeValue
        ? statusConfig.inactiveValue
        : statusConfig.activeValue;
    const previousValue = currentValue;
    const updates: Partial<Pick<Aquarium, SystemField>> = {};

    updates[field] = nextValue;
    setSavingSystemKey(`${selectedAquarium.id}-${field}`);
    setSystemError('');
    updateAquariumStatusInState(selectedAquarium.id, updates);

    try {
      await updateAquarium(selectedAquarium.id, updates);
    } catch (err) {
      console.error(err);
      updates[field] = previousValue;
      updateAquariumStatusInState(selectedAquarium.id, updates);
      setSystemError('Failed to update system status.');
    } finally {
      setSavingSystemKey('');
    }
  };

  const handleAutomationSave = async () => {
    if (!selectedAquarium) {
      return;
    }

    const runtimeHours = Number(automationDraft.filtrationRuntimeHours);

    if (
      !automationDraft.feedingTime ||
      !automationDraft.lightOnTime ||
      !automationDraft.lightOffTime ||
      !automationDraft.filtrationStartTime
    ) {
      setAutomationError('Please complete all automation times.');
      return;
    }

    if (!Number.isFinite(runtimeHours) || runtimeHours < 1 || runtimeHours > 24) {
      setAutomationError('Filtration runtime must be between 1 and 24 hours.');
      return;
    }

    const nextSettings: AutomationSettings = {
      ...automationDraft,
      filtrationRuntimeHours: runtimeHours,
    };
    const previousSettings = selectedAquarium.automationSettings;

    setSavingAutomation(true);
    setAutomationError('');
    updateAquariumAutomationInState(selectedAquarium.id, nextSettings);

    try {
      await updateAquarium(selectedAquarium.id, {
        automationSettings: nextSettings,
      });
      setShowAutomationModal(false);
    } catch (err) {
      console.error(err);
      updateAquariumAutomationInState(selectedAquarium.id, previousSettings);
      setAutomationError('Failed to save automation settings.');
    } finally {
      setSavingAutomation(false);
    }
  };

  if (loading) {
    return <div className="text-slate-300">Loading monitoring data...</div>;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">
        {error}
      </div>
    );
  }

  if (userRole === 'Admin') {
    if (selectedOwner) {
      const stats = selectedOwner.stats;

      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedOwnerId('')}
                className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Users
              </button>
              <div>
                <h2 className="text-xl font-semibold text-white">{selectedOwner.name}</h2>
                <p className="text-sm text-slate-400 mt-1">
                  Overall monitoring statistics and tanks
                </p>
              </div>
            </div>

            <button
              onClick={loadMonitoringData}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-lg font-bold text-white">
                      {getInitials(selectedOwner.name)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white truncate">
                      {selectedOwner.name}
                    </h3>
                    <p className="text-sm text-slate-400 truncate">{selectedOwner.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={selectedOwner.role === 'Admin' ? 'danger' : 'info'}>
                    {selectedOwner.role}
                  </Badge>
                  <Badge variant={stats.warningTanks > 0 ? 'warning' : 'success'}>
                    {stats.warningTanks > 0 ? 'Needs Attention' : 'All Clear'}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            <StatCard
              icon={Fish}
              label="Total Tanks"
              value={stats.totalTanks}
              caption="Aquariums owned"
              iconBg="bg-cyan-500/20"
              iconColor="text-cyan-400"
            />
            <StatCard
              icon={Activity}
              label="Healthy Tanks"
              value={stats.healthyTanks}
              caption={`${stats.warningTanks} warning tanks`}
              iconBg="bg-emerald-500/20"
              iconColor="text-emerald-400"
            />
            <StatCard
              icon={Thermometer}
              label="Average Temperature"
              value={
                stats.totalTanks === 0 ? (
                  'No data'
                ) : (
                  <>
                    {stats.averageTemp.toFixed(1)}&deg;C
                  </>
                )
              }
              caption="Across user tanks"
              iconBg="bg-orange-500/20"
              iconColor="text-orange-400"
            />
            <StatCard
              icon={Waves}
              label="Average Quality"
              value={formatAverage(stats.averageQuality, stats.totalTanks, '%')}
              caption="Water quality score"
              iconBg="bg-emerald-500/20"
              iconColor="text-emerald-400"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <StatCard
              icon={Droplets}
              label="Average Water Level"
              value={formatAverage(stats.averageLevel, stats.totalTanks, '%')}
              caption="Across user tanks"
              iconBg="bg-blue-500/20"
              iconColor="text-blue-400"
            />
            <StatCard
              icon={Fish}
              label="Active Feeders"
              value={
                stats.totalTanks === 0 ? 'No data' : `${stats.activeFeeders}/${stats.totalTanks}`
              }
              caption="Automated feeding"
              iconBg="bg-cyan-500/20"
              iconColor="text-cyan-400"
            />
            <StatCard
              icon={Cpu}
              label="Running Systems"
              value={
                stats.totalTanks === 0 ? 'No data' : `${stats.activeFilters}/${stats.totalTanks}`
              }
              caption={`${stats.lightsOn} lights on`}
              iconBg="bg-slate-500/20"
              iconColor="text-slate-300"
            />
          </div>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <h3 className="text-lg font-semibold text-white">Aquariums</h3>
                <Badge variant="default">{selectedOwner.aquariums.length} total</Badge>
              </div>
            </CardHeader>
            <CardContent>
              {selectedOwner.aquariums.length === 0 ? (
                <div className="py-8 text-center text-slate-400">
                  This user does not have any aquariums yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {selectedOwner.aquariums.map((aquarium) => (
                    <TankCard key={aquarium.id} aquarium={aquarium} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Monitoring</h2>
            <p className="text-sm text-slate-400 mt-1">
              Admin view: choose a user to view overall statistics and tanks
            </p>
          </div>

          <button
            onClick={loadMonitoringData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Users</h3>
              </div>
              <Badge variant="info">{ownerCards.length} accounts</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {ownerCards.length === 0 ? (
              <div className="py-8 text-center text-slate-400">No users found.</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {ownerCards.map((owner) => (
                  <OwnerCard
                    key={owner.id}
                    owner={owner}
                    onView={(viewedOwner) => setSelectedOwnerId(viewedOwner.id)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">No monitoring data available. Add an aquarium first.</p>
        </CardContent>
      </Card>
    );
  }

  if (!selectedAquarium) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold text-white">Monitoring</h2>
            <p className="text-sm text-slate-400 mt-1">
              {`User view: choose an aquarium to view monitoring details for ${
                userName || 'your account'
              }`}
            </p>
          </div>

          <button
            onClick={loadMonitoringData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Fish className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-semibold text-white">Aquariums</h3>
              </div>
              <Badge variant="info">{aquariums.length} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {aquariums.map((aquarium) => (
                <AquariumOverviewCard
                  key={aquarium.id}
                  aquarium={aquarium}
                  onView={(viewedAquarium) => {
                    setSystemMenuOpen(false);
                    setShowAutomationModal(false);
                    setAutomationError('');
                    setSelectedAquariumId(viewedAquarium.id);
                  }}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const temperatureLabel = getTemperatureLabel(
    selectedAquarium.temp,
    selectedAquarium.minTemp,
    selectedAquarium.maxTemp
  );
  const levelLabel = getLevelLabel(selectedAquarium.level);
  const qualityLabel = getQualityLabel(selectedAquarium.quality);
  const automationSettings = getAutomationSettings(selectedAquarium);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSystemMenuOpen(false);
              setShowAutomationModal(false);
              setAutomationError('');
              setSelectedAquariumId('');
            }}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Aquariums
          </button>
          <div>
            <h2 className="text-xl font-semibold text-white">{selectedAquarium.name}</h2>
            <p className="text-sm text-slate-400 mt-1">
              Monitoring details and controls
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={loadMonitoringData}
            className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-semibold text-white">{selectedAquarium.name}</h3>
              <p className="text-sm text-slate-400 mt-1">
                Species: {selectedAquarium.species.length > 0 ? selectedAquarium.species.join(', ') : 'No species set'}
              </p>
            </div>

            <Badge variant={selectedAquarium.healthStatus === 'healthy' ? 'success' : 'warning'}>
              {selectedAquarium.healthStatus}
            </Badge>
          </div>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-slate-400">Temperature</p>
                <p className="text-2xl font-bold text-white">{selectedAquarium.temp}&deg;C</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Thermometer className="w-6 h-6 text-orange-400" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Range</span>
                <span className="text-slate-300">
                  {selectedAquarium.minTemp}&deg;C - {selectedAquarium.maxTemp}&deg;C
                </span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Status</span>
                <span className={temperatureLabel === 'Normal' ? 'text-emerald-400' : 'text-amber-400'}>
                  {temperatureLabel}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-slate-400">Water Level</p>
                <p className="text-2xl font-bold text-white">{selectedAquarium.level}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Droplets className="w-6 h-6 text-blue-400" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Condition</span>
                <span
                  className={
                    levelLabel === 'High' || levelLabel === 'Normal'
                      ? 'text-emerald-400'
                      : levelLabel === 'Low'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }
                >
                  {levelLabel}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                <div
                  className="bg-blue-500 h-2 rounded-full"
                  style={{ width: `${selectedAquarium.level}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-slate-400">Water Quality</p>
                <p className="text-2xl font-bold text-white">{selectedAquarium.quality}%</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Waves className="w-6 h-6 text-emerald-400" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Condition</span>
                <span
                  className={
                    qualityLabel === 'Excellent' || qualityLabel === 'Good'
                      ? 'text-emerald-400'
                      : qualityLabel === 'Fair'
                      ? 'text-amber-400'
                      : 'text-red-400'
                  }
                >
                  {qualityLabel}
                </span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-2 mt-2">
                <div
                  className="bg-emerald-500 h-2 rounded-full"
                  style={{ width: `${selectedAquarium.quality}%` }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-slate-400">Bioload</p>
                <p className="text-2xl font-bold text-white capitalize">{selectedAquarium.bioload}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Gauge className="w-6 h-6 text-cyan-400" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Species Count</span>
                <span className="text-slate-300">{selectedAquarium.species.length}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Feeding</span>
                <span className="text-slate-300">{selectedAquarium.feeder}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="relative flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Cpu className="w-5 h-5 text-cyan-400" />
                System Status
              </h3>

              <button
                type="button"
                aria-label="Open system status options"
                onClick={() => setSystemMenuOpen((prev) => !prev)}
                className="w-9 h-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700/70 text-slate-300 hover:text-white flex items-center justify-center transition-all"
              >
                <MoreVertical className="w-5 h-5" />
              </button>

              {systemMenuOpen && (
                <div className="absolute right-0 top-11 z-20 w-52 rounded-xl border border-slate-700 bg-slate-900 shadow-xl shadow-black/30 p-2">
                  <button
                    type="button"
                    onClick={openAutomationEditor}
                    className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 transition-all"
                  >
                    <Pencil className="w-4 h-4 text-cyan-400" />
                    Edit automation
                  </button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {systemError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {systemError}
              </div>
            )}

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Fish className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm text-slate-300">Feeder</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {savingSystemKey === `${selectedAquarium.id}-feeder`
                      ? 'Saving...'
                      : selectedAquarium.feeder}
                  </span>
                  <SystemToggle
                    active={selectedAquarium.feeder === 'Active'}
                    disabled={Boolean(savingSystemKey)}
                    label="feeder"
                    onToggle={() => void handleSystemToggle('feeder')}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-slate-300">Light</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {savingSystemKey === `${selectedAquarium.id}-light`
                      ? 'Saving...'
                      : selectedAquarium.light}
                  </span>
                  <SystemToggle
                    active={selectedAquarium.light === 'On'}
                    disabled={Boolean(savingSystemKey)}
                    label="light"
                    onToggle={() => void handleSystemToggle('light')}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Waves className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-slate-300">Filter</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400">
                    {savingSystemKey === `${selectedAquarium.id}-filter`
                      ? 'Saving...'
                      : selectedAquarium.filter}
                  </span>
                  <SystemToggle
                    active={selectedAquarium.filter === 'Active'}
                    disabled={Boolean(savingSystemKey)}
                    label="filter"
                    onToggle={() => void handleSystemToggle('filter')}
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
              <div className="rounded-lg bg-slate-800/60 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-4 h-4 text-cyan-400" />
                  Feeding
                </div>
                <p className="text-sm font-medium text-white mt-2">
                  {formatAutomationTime(automationSettings.feedingTime)}
                </p>
              </div>

              <div className="rounded-lg bg-slate-800/60 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sun className="w-4 h-4 text-yellow-400" />
                  Light
                </div>
                <p className="text-sm font-medium text-white mt-2">
                  {formatAutomationTime(automationSettings.lightOnTime)} -{' '}
                  {formatAutomationTime(automationSettings.lightOffTime)}
                </p>
              </div>

              <div className="rounded-lg bg-slate-800/60 p-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Wind className="w-4 h-4 text-emerald-400" />
                  Filtration
                </div>
                <p className="text-sm font-medium text-white mt-2">
                  {automationSettings.filtrationMode}, {automationSettings.filtrationRuntimeHours}h
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">Monitoring Summary</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="flex justify-between border-b border-slate-700/50 pb-2">
                <span className="text-slate-400">Aquarium Name</span>
                <span className="text-white font-medium">{selectedAquarium.name}</span>
              </div>

              <div className="flex justify-between border-b border-slate-700/50 pb-2">
                <span className="text-slate-400">Owner</span>
                <span className="text-white font-medium">{selectedAquarium.ownerName}</span>
              </div>

              <div className="flex justify-between border-b border-slate-700/50 pb-2">
                <span className="text-slate-400">Temperature Range</span>
                <span className="text-white font-medium">
                  {selectedAquarium.minTemp}&deg;C - {selectedAquarium.maxTemp}&deg;C
                </span>
              </div>

              <div className="flex justify-between border-b border-slate-700/50 pb-2">
                <span className="text-slate-400">Health Status</span>
                <span
                  className={
                    selectedAquarium.healthStatus === 'healthy'
                      ? 'text-emerald-400 font-medium'
                      : 'text-amber-400 font-medium'
                  }
                >
                  {selectedAquarium.healthStatus}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-slate-400">Species</span>
                <span className="text-white font-medium">
                  {selectedAquarium.species.length > 0
                    ? selectedAquarium.species.join(', ')
                    : 'None'}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {showAutomationModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 px-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl w-full max-w-2xl p-6 shadow-2xl shadow-black/30">
            <div className="flex items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-xl font-semibold text-white">
                  Edit Automation
                </h2>
                <p className="text-sm text-slate-400 mt-1">
                  {selectedAquarium.name}
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAutomationModal(false);
                  setAutomationError('');
                }}
                className="w-9 h-9 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 flex items-center justify-center transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {automationError && (
              <div className="mb-4 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {automationError}
              </div>
            )}

            <div className="space-y-5">
              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Fish className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-semibold text-white">Feeding Schedule</h3>
                </div>

                <label className="block text-sm font-medium text-slate-300 mb-1">
                  Feeding time
                </label>
                <input
                  type="time"
                  value={automationDraft.feedingTime}
                  onChange={(event) =>
                    updateAutomationDraft('feedingTime', event.target.value)
                  }
                  className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Sun className="w-5 h-5 text-yellow-400" />
                  <h3 className="text-sm font-semibold text-white">Light Schedule</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Turn on
                    </label>
                    <input
                      type="time"
                      value={automationDraft.lightOnTime}
                      onChange={(event) =>
                        updateAutomationDraft('lightOnTime', event.target.value)
                      }
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Turn off
                    </label>
                    <input
                      type="time"
                      value={automationDraft.lightOffTime}
                      onChange={(event) =>
                        updateAutomationDraft('lightOffTime', event.target.value)
                      }
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/70 bg-slate-900/40 p-4">
                <div className="flex items-center gap-2 mb-4">
                  <Wind className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-sm font-semibold text-white">Filtration Settings</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Start time
                    </label>
                    <input
                      type="time"
                      value={automationDraft.filtrationStartTime}
                      onChange={(event) =>
                        updateAutomationDraft('filtrationStartTime', event.target.value)
                      }
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Runtime hours
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="24"
                      value={automationDraft.filtrationRuntimeHours}
                      onChange={(event) =>
                        updateAutomationDraft(
                          'filtrationRuntimeHours',
                          Number(event.target.value)
                        )
                      }
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">
                      Flow mode
                    </label>
                    <select
                      value={automationDraft.filtrationMode}
                      onChange={(event) =>
                        updateAutomationDraft(
                          'filtrationMode',
                          event.target.value as FilterMode
                        )
                      }
                      className="w-full px-4 py-2 bg-slate-700/50 border border-slate-600 rounded-lg text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <button
                type="button"
                onClick={() => {
                  setShowAutomationModal(false);
                  setAutomationError('');
                }}
                disabled={savingAutomation}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 disabled:cursor-not-allowed text-slate-300 rounded-lg text-sm font-medium transition-all"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() => void handleAutomationSave()}
                disabled={savingAutomation}
                className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-all"
              >
                {savingAutomation ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
