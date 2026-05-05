import { useMemo, useState, useEffect } from 'react';
import {
  Thermometer,
  Droplets,
  Waves,
  Zap,
 
  Clock,
  AlertTriangle,
  Radio,
  Users,
  Fish,
  ShieldCheck,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { auth } from '../firebase';
import { getCurrentUserProfile, getAllUsers } from '../services/userService';
import { getAllAquariums, getAquariumsByOwner } from '../services/aquariumService';
import type { Aquarium } from '../types/aquarium';
import type { UserRole } from '../types/user';

type DashboardAquarium = Aquarium & {
  status: 'healthy' | 'warning';
  fishCount: number;
};

type OwnerGroup = {
  ownerId: string;
  ownerName: string;
  aquariums: DashboardAquarium[];
  warningCount: number;
};

function getAquariumStatus(aquarium: Aquarium): 'healthy' | 'warning' {
  if (aquarium.level < 75 || aquarium.quality < 80) {
    return 'warning';
  }

  return 'healthy';
}

function mapDashboardAquariums(aquariums: Aquarium[]): DashboardAquarium[] {
  return aquariums.map((aquarium) => ({
    ...aquarium,
    status: getAquariumStatus(aquarium),
    fishCount: Array.isArray(aquarium.species) ? aquarium.species.length : 0,
  }));
}

function MiniSparkline({ data, color }: { data: number[]; color: string }) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => `${(index / (data.length - 1)) * 60},${30 - ((value - min) / range) * 25}`)
    .join(' ');

  return (
    <svg width="60" height="30" className="opacity-60">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function getStatsForTank(tank: DashboardAquarium) {
  return [
    {
      title: 'Temperature',
      value: `${tank.temp.toFixed(1)}°C`,
      icon: Thermometer,
      change: tank.temp >= tank.minTemp && tank.temp <= tank.maxTemp ? 'Normal' : 'Check range',
      trend: tank.temp >= tank.minTemp && tank.temp <= tank.maxTemp ? 'good' : 'warning',
      sparkline: [tank.temp - 1.5, tank.temp - 1, tank.temp - 0.5, tank.temp - 0.2, tank.temp + 0.1, tank.temp],
    },
    {
      title: 'Water Level',
      value: `${tank.level}%`,
      icon: Droplets,
      change: tank.level >= 75 ? 'Normal' : 'Needs attention',
      trend: tank.level >= 75 ? 'good' : 'warning',
      sparkline: [tank.level + 5, tank.level + 3, tank.level + 2, tank.level + 1, tank.level, tank.level],
    },
    {
      title: 'Water Quality',
      value: `${tank.quality}%`,
      icon: Waves,
      change: tank.quality >= 80 ? 'Good' : 'Needs attention',
      trend: tank.quality >= 80 ? 'good' : 'warning',
      sparkline: [tank.quality - 4, tank.quality - 3, tank.quality - 2, tank.quality - 1, tank.quality, tank.quality],
    },
    {
      title: 'System Status',
      value: tank.status === 'healthy' ? 'Stable' : 'Warning',
      icon: Zap,
      change: tank.status === 'healthy' ? 'All normal' : 'Check tank',
      trend: tank.status === 'healthy' ? 'good' : 'warning',
      sparkline: [100, 100, 100, 100, 100, tank.status === 'healthy' ? 100 : 85],
    },
  ];
}

export default function Dashboard() {
  const [aquariums, setAquariums] = useState<DashboardAquarium[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [totalUsers, setTotalUsers] = useState(0);

  const [selectedOwnerId, setSelectedOwnerId] = useState('');
  const [selectedTankId, setSelectedTankId] = useState('');

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setAquariums([]);
        return;
      }

      const userProfile = await getCurrentUserProfile(currentUser.uid);

      if (!userProfile) {
        setAquariums([]);
        return;
      }

      setUserRole(userProfile.role);

      if (userProfile.role === 'Admin') {
        const [allAquariums, allUsers] = await Promise.all([
          getAllAquariums(),
          getAllUsers(),
        ]);

        const mapped = mapDashboardAquariums(allAquariums);
        setAquariums(mapped);
        setTotalUsers(allUsers.length);
      } else {
        const ownAquariums = await getAquariumsByOwner(currentUser.uid);
        const mapped = mapDashboardAquariums(ownAquariums);
        setAquariums(mapped);
        setTotalUsers(0);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      setAquariums([]);
      setTotalUsers(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, []);

  const ownerGroups = useMemo<OwnerGroup[]>(() => {
    const groups = new Map<string, OwnerGroup>();

    for (const aquarium of aquariums) {
      const key = aquarium.ownerId || 'unknown';

      if (!groups.has(key)) {
        groups.set(key, {
          ownerId: aquarium.ownerId || '',
          ownerName: aquarium.ownerName || 'Unknown Owner',
          aquariums: [],
          warningCount: 0,
        });
      }

      const group = groups.get(key)!;
      group.aquariums.push(aquarium);

      if (aquarium.status === 'warning') {
        group.warningCount += 1;
      }
    }

    return Array.from(groups.values()).sort((a, b) => a.ownerName.localeCompare(b.ownerName));
  }, [aquariums]);

  useEffect(() => {
    if (userRole !== 'Admin') {
      if (aquariums.length > 0 && !aquariums.some((item) => item.id === selectedTankId)) {
        setSelectedTankId(aquariums[0].id);
      }
      return;
    }

    if (ownerGroups.length === 0) {
      setSelectedOwnerId('');
      setSelectedTankId('');
      return;
    }

    const hasOwner = ownerGroups.some((group) => group.ownerId === selectedOwnerId);
    const nextOwnerId = hasOwner ? selectedOwnerId : ownerGroups[0].ownerId;

    if (nextOwnerId !== selectedOwnerId) {
      setSelectedOwnerId(nextOwnerId);
    }

    const ownerAquariums = ownerGroups.find((group) => group.ownerId === nextOwnerId)?.aquariums ?? [];
    const hasTank = ownerAquariums.some((tank) => tank.id === selectedTankId);

    if (!hasTank && ownerAquariums.length > 0) {
      setSelectedTankId(ownerAquariums[0].id);
    }
  }, [userRole, aquariums, ownerGroups, selectedOwnerId, selectedTankId]);

  const selectedOwnerGroup = useMemo(() => {
    if (userRole !== 'Admin') return null;
    return ownerGroups.find((group) => group.ownerId === selectedOwnerId) ?? null;
  }, [userRole, ownerGroups, selectedOwnerId]);

  const visibleAquariums = useMemo(() => {
    if (userRole === 'Admin') {
      return selectedOwnerGroup?.aquariums ?? [];
    }

    return aquariums;
  }, [userRole, aquariums, selectedOwnerGroup]);

  const selectedTank = useMemo(() => {
    if (visibleAquariums.length === 0) {
      return null;
    }

    return visibleAquariums.find((tank) => tank.id === selectedTankId) ?? visibleAquariums[0];
  }, [visibleAquariums, selectedTankId]);

  const totalAquariums = aquariums.length;
  const warningAquariums = aquariums.filter((tank) => tank.status === 'warning').length;
  const healthyAquariums = aquariums.filter((tank) => tank.status === 'healthy').length;

  const ownersNeedingAttention = ownerGroups.filter((group) => group.warningCount > 0);
  const ownersMostTanks = [...ownerGroups]
    .sort((a, b) => b.aquariums.length - a.aquariums.length)
    .slice(0, 5);

  const userWarningTanks = aquariums.filter((tank) => tank.status === 'warning').length;
  const stats = selectedTank ? getStatsForTank(selectedTank) : [];

  const adminAlerts = ownersNeedingAttention.length === 0
    ? ['No owners currently have aquariums needing attention.']
    : ownersNeedingAttention.map(
        (group) => `${group.ownerName} has ${group.warningCount} aquarium${group.warningCount > 1 ? 's' : ''} needing attention.`
      );

  const userAlerts = userWarningTanks === 0
    ? ['All of your aquariums are currently stable.']
    : aquariums
        .filter((tank) => tank.status === 'warning')
        .map((tank) => `${tank.name} needs attention based on current monitoring values.`);

  const adminActivities = ownersMostTanks.length === 0
    ? ['No aquarium records available yet.']
    : ownersMostTanks.map(
        (group) => `${group.ownerName} currently has ${group.aquariums.length} aquarium${group.aquariums.length > 1 ? 's' : ''} in the system.`
      );

  const userActivities = aquariums.length === 0
    ? ['You have not added any aquariums yet.']
    : aquariums.map(
        (tank) => `${tank.name} is registered with ${tank.species.length} species entr${tank.species.length !== 1 ? 'ies' : 'y'}.`
      );

  if (loading) {
    return <div className="text-slate-300">Loading dashboard...</div>;
  }

  if (aquariums.length === 0) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">
            {userRole === 'Admin'
              ? 'No aquarium records exist yet.'
              : 'You have not added any aquariums yet.'}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (userRole === 'Admin') {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-white">Admin Dashboard</h2>
          <p className="text-sm text-slate-400 mt-1">
            System-wide management overview for users, aquariums, and owner activity.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Users</p>
                  <p className="text-2xl font-bold text-white">{totalUsers}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                  <Users className="w-6 h-6 text-cyan-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Total Aquariums</p>
                  <p className="text-2xl font-bold text-white">{totalAquariums}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Fish className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Warning Aquariums</p>
                  <p className="text-2xl font-bold text-white">{warningAquariums}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400">Healthy Aquariums</p>
                  <p className="text-2xl font-bold text-white">{healthyAquariums}</p>
                </div>
                <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Owners With Most Aquariums</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ownersMostTanks.map((group) => (
                  <div
                    key={group.ownerId}
                    className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3"
                  >
                    <span className="text-slate-300">{group.ownerName}</span>
                    <Badge variant="info">{group.aquariums.length} tanks</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Owners Needing Attention</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {ownersNeedingAttention.length === 0 ? (
                  <p className="text-slate-400">No owners need attention right now.</p>
                ) : (
                  ownersNeedingAttention.map((group) => (
                    <div
                      key={group.ownerId}
                      className="flex items-center justify-between bg-slate-800/50 rounded-lg px-4 py-3"
                    >
                      <span className="text-slate-300">{group.ownerName}</span>
                      <Badge variant="warning">{group.warningCount} warning</Badge>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Owner Selection</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {ownerGroups.map((group) => (
                  <button
                    key={group.ownerId}
                    onClick={() => setSelectedOwnerId(group.ownerId)}
                    className={`w-full text-left px-4 py-3 rounded-lg transition-all ${
                      selectedOwnerId === group.ownerId
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{group.ownerName}</span>
                      <span className="text-xs">{group.aquariums.length} tanks</span>
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {selectedOwnerGroup && (
          <>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-xl font-semibold text-white">
                  {selectedOwnerGroup.ownerName}&apos;s Aquariums
                </h3>
                <p className="text-sm text-slate-400 mt-1">
                  Select a tank below to inspect its latest values.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selectedOwnerGroup.aquariums.map((tank) => (
                  <button
                    key={tank.id}
                    onClick={() => setSelectedTankId(tank.id)}
                    className={`px-3 py-2 rounded-lg text-sm transition-all ${
                      selectedTankId === tank.id
                        ? 'bg-cyan-600 text-white'
                        : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                  >
                    {tank.name}
                  </button>
                ))}
              </div>
            </div>

            {selectedTank && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                  {stats.map((stat) => {
                    const Icon = stat.icon;

                    return (
                      <Card key={stat.title}>
                        <CardContent className="p-5">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="text-sm text-slate-400 mb-1">{stat.title}</p>
                              <p className="text-2xl font-bold text-white">{stat.value}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <span
                                  className={`text-xs ${
                                    stat.trend === 'good' ? 'text-emerald-400' : 'text-amber-400'
                                  }`}
                                >
                                  {stat.change}
                                </span>
                              </div>
                            </div>

                            <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                              <Icon className="w-6 h-6 text-white" />
                            </div>
                          </div>

                          <div className="mt-3">
                            <MiniSparkline
                              data={stat.sparkline}
                              color={stat.trend === 'good' ? '#10b981' : '#f59e0b'}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>

                <Card>
                  <CardHeader>
                    <h3 className="text-lg font-semibold text-white">Selected Owner Aquarium Overview</h3>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedOwnerGroup.aquariums.map((tank) => (
                        <div
                          key={tank.id}
                          className={`rounded-lg p-4 transition-all ${
                            selectedTankId === tank.id
                              ? 'bg-cyan-500/10 ring-2 ring-cyan-500/40'
                              : 'bg-slate-800/50'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="font-medium text-white">{tank.name}</h4>
                            <Badge variant={tank.status === 'healthy' ? 'success' : 'warning'}>
                              {tank.status}
                            </Badge>
                          </div>

                          <div className="grid grid-cols-3 gap-3 text-center">
                            <div>
                              <p className="text-xs text-slate-500">Temp</p>
                              <p className="text-sm font-semibold text-white">{tank.temp}°C</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Level</p>
                              <p className="text-sm font-semibold text-white">{tank.level}%</p>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500">Quality</p>
                              <p className="text-sm font-semibold text-white">{tank.quality}%</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </>
        )}

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">System Alerts</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminAlerts.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">System Activity</h3>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {adminActivities.map((item, index) => (
                  <div key={index} className="flex items-start gap-3">
                    <Clock className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">My Dashboard</h2>
        <p className="text-sm text-slate-400 mt-1">
          Personal overview of your aquariums and current monitoring status.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">My Aquariums</p>
                <p className="text-2xl font-bold text-white">{aquariums.length}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <Fish className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Tanks Needing Attention</p>
                <p className="text-2xl font-bold text-white">{userWarningTanks}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Healthy Tanks</p>
                <p className="text-2xl font-bold text-white">{healthyAquariums}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Selected Aquarium</p>
                <p className="text-lg font-bold text-white">{selectedTank?.name || 'None'}</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <Radio className="w-6 h-6 text-cyan-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">My Aquariums</h3>
          <p className="text-sm text-slate-400 mt-1">
            Select one of your aquariums to view its latest values.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {aquariums.map((tank) => (
            <button
              key={tank.id}
              onClick={() => setSelectedTankId(tank.id)}
              className={`px-3 py-2 rounded-lg text-sm transition-all ${
                selectedTankId === tank.id
                  ? 'bg-cyan-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {tank.name}
            </button>
          ))}
        </div>
      </div>

      {selectedTank && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
            {stats.map((stat) => {
              const Icon = stat.icon;

              return (
                <Card key={stat.title}>
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm text-slate-400 mb-1">{stat.title}</p>
                        <p className="text-2xl font-bold text-white">{stat.value}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <span
                            className={`text-xs ${
                              stat.trend === 'good' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {stat.change}
                          </span>
                        </div>
                      </div>

                      <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    <div className="mt-3">
                      <MiniSparkline
                        data={stat.sparkline}
                        color={stat.trend === 'good' ? '#10b981' : '#f59e0b'}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card>
            <CardHeader>
              <h3 className="text-lg font-semibold text-white">Selected Aquarium Overview</h3>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {aquariums.map((tank) => (
                  <div
                    key={tank.id}
                    className={`rounded-lg p-4 transition-all ${
                      selectedTankId === tank.id
                        ? 'bg-cyan-500/10 ring-2 ring-cyan-500/40'
                        : 'bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-white">{tank.name}</h4>
                      <Badge variant={tank.status === 'healthy' ? 'success' : 'warning'}>
                        {tank.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center">
                      <div>
                        <p className="text-xs text-slate-500">Temp</p>
                        <p className="text-sm font-semibold text-white">{tank.temp}°C</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Level</p>
                        <p className="text-sm font-semibold text-white">{tank.level}%</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Quality</p>
                        <p className="text-sm font-semibold text-white">{tank.quality}%</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">My Alerts</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userAlerts.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h3 className="text-lg font-semibold text-white">My Recent Activity</h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {userActivities.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-cyan-400 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-slate-300">{item}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}