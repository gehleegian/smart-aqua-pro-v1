import { useEffect, useMemo, useState } from 'react';
import {
  Thermometer,
  Droplets,
  Waves,
  Activity,
  Fish,
  Gauge,
  Cpu,
} from 'lucide-react';
import { Card, CardHeader, CardContent } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { auth } from '../firebase';
import { getCurrentUserProfile } from '../services/userService';
import { getAllAquariums, getAquariumsByOwner } from '../services/aquariumService';
import type { Aquarium } from '../types/aquarium';
import type { UserRole } from '../types/user';
import {
  getHealthStatus,
  getQualityLabel,
  getLevelLabel,
  getTemperatureLabel,
} from '../utils/monitoringHelpers';

type MonitoringAquarium = Aquarium & {
  healthStatus: 'healthy' | 'warning';
};

export default function Monitoring() {
  const [aquariums, setAquariums] = useState<MonitoringAquarium[]>([]);
  const [selectedAquariumId, setSelectedAquariumId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [userRole, setUserRole] = useState<UserRole>('User');
  const [userName, setUserName] = useState('');

  const loadMonitoringData = async () => {
    try {
      setLoading(true);
      setError('');

      const currentUser = auth.currentUser;

      if (!currentUser) {
        setError('No logged-in user found.');
        setAquariums([]);
        return;
      }

      const userProfile = await getCurrentUserProfile(currentUser.uid);

      if (!userProfile) {
        setError('User profile not found.');
        setAquariums([]);
        return;
      }

      setUserRole(userProfile.role);
      setUserName(userProfile.name);

      const aquariumData =
        userProfile.role === 'Admin'
          ? await getAllAquariums()
          : await getAquariumsByOwner(currentUser.uid);

      const monitoringData: MonitoringAquarium[] = aquariumData.map((aquarium) => ({
        ...aquarium,
        healthStatus: getHealthStatus(aquarium.level, aquarium.quality),
      }));

      setAquariums(monitoringData);

      if (monitoringData.length > 0) {
        setSelectedAquariumId((prev) =>
          prev && monitoringData.some((item) => item.id === prev)
            ? prev
            : monitoringData[0].id
        );
      } else {
        setSelectedAquariumId('');
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load monitoring data.');
      setAquariums([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMonitoringData();
  }, []);

  const selectedAquarium = useMemo(() => {
    return aquariums.find((item) => item.id === selectedAquariumId) || aquariums[0];
  }, [aquariums, selectedAquariumId]);

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

  if (aquariums.length === 0 || !selectedAquarium) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-slate-300">No monitoring data available. Add an aquarium first.</p>
        </CardContent>
      </Card>
    );
  }

  const temperatureLabel = getTemperatureLabel(
    selectedAquarium.temp,
    selectedAquarium.minTemp,
    selectedAquarium.maxTemp
  );
  const levelLabel = getLevelLabel(selectedAquarium.level);
  const qualityLabel = getQualityLabel(selectedAquarium.quality);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-white">Monitoring</h2>
          <p className="text-sm text-slate-400 mt-1">
            {userRole === 'Admin'
              ? 'Admin view: monitoring data for all aquariums'
              : `User view: monitoring data for ${userName || 'your aquariums'}`}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedAquariumId}
            onChange={(e) => setSelectedAquariumId(e.target.value)}
            className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-300 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {aquariums.map((aquarium) => (
              <option key={aquarium.id} value={aquarium.id}>
                {aquarium.name}
              </option>
            ))}
          </select>

          <button
            onClick={loadMonitoringData}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
          >
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
              {userRole === 'Admin' && (
                <p className="text-xs text-slate-500 mt-1">Owner: {selectedAquarium.ownerName}</p>
              )}
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
                <p className="text-2xl font-bold text-white">{selectedAquarium.temp}°C</p>
              </div>
              <div className="w-12 h-12 rounded-xl bg-orange-500/20 flex items-center justify-center">
                <Thermometer className="w-6 h-6 text-orange-400" />
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between text-slate-400">
                <span>Range</span>
                <span className="text-slate-300">
                  {selectedAquarium.minTemp}°C - {selectedAquarium.maxTemp}°C
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
            <h3 className="text-lg font-semibold text-white flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              System Status
            </h3>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Fish className="w-5 h-5 text-cyan-400" />
                  <span className="text-sm text-slate-300">Feeder</span>
                </div>
                <Badge variant={selectedAquarium.feeder === 'Active' ? 'success' : 'default'}>
                  {selectedAquarium.feeder}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Activity className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-slate-300">Light</span>
                </div>
                <Badge variant={selectedAquarium.light === 'On' ? 'info' : 'default'}>
                  {selectedAquarium.light}
                </Badge>
              </div>

              <div className="flex items-center justify-between p-3 rounded-lg bg-slate-800/60">
                <div className="flex items-center gap-3">
                  <Waves className="w-5 h-5 text-emerald-400" />
                  <span className="text-sm text-slate-300">Filter</span>
                </div>
                <Badge variant={selectedAquarium.filter === 'Active' ? 'success' : 'default'}>
                  {selectedAquarium.filter}
                </Badge>
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
                  {selectedAquarium.minTemp}°C - {selectedAquarium.maxTemp}°C
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
    </div>
  );
}