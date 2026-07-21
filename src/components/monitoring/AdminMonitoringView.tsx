import {
  Activity,
  ArrowLeft,
  Cpu,
  Droplets,
  Fish,
  RefreshCw,
  Thermometer,
  Users,
  Waves,
} from 'lucide-react';
import Badge from '../ui/Badge';
import { Card, CardContent, CardHeader } from '../ui/Card';
import type { MonitoringOwner } from '../../types/monitoring';
import { formatAverage, getInitials } from '../../utils/monitoringHelpers';
import { OwnerCard, StatCard, TankCard } from './MonitoringCards';

type AdminMonitoringViewProps = {
  ownerCards: MonitoringOwner[];
  selectedOwner: MonitoringOwner | undefined;
  onBackToUsers: () => void;
  onRefresh: () => void;
  onSelectOwner: (owner: MonitoringOwner) => void;
};

export function AdminMonitoringView({
  ownerCards,
  selectedOwner,
  onBackToUsers,
  onRefresh,
  onSelectOwner,
}: AdminMonitoringViewProps) {
  if (selectedOwner) {
    return (
      <SelectedOwnerView
        owner={selectedOwner}
        onBackToUsers={onBackToUsers}
        onRefresh={onRefresh}
      />
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

        <RefreshButton onClick={onRefresh} />
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
                <OwnerCard key={owner.id} owner={owner} onView={onSelectOwner} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

type SelectedOwnerViewProps = {
  owner: MonitoringOwner;
  onBackToUsers: () => void;
  onRefresh: () => void;
};

function SelectedOwnerView({ owner, onBackToUsers, onRefresh }: SelectedOwnerViewProps) {
  const stats = owner.stats;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToUsers}
            className="flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            Users
          </button>
          <div>
            <h2 className="text-xl font-semibold text-white">{owner.name}</h2>
            <p className="text-sm text-slate-400 mt-1">
              Overall monitoring statistics and tanks
            </p>
          </div>
        </div>

        <RefreshButton onClick={onRefresh} />
      </div>

      <Card>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-14 h-14 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-lg font-bold text-white">{getInitials(owner.name)}</span>
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-white truncate">{owner.name}</h3>
                <p className="text-sm text-slate-400 truncate">{owner.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={owner.role === 'Admin' ? 'danger' : 'info'}>{owner.role}</Badge>
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
            stats.liveDataTanks === 0 ? (
              'No data'
            ) : (
              <>
                {stats.averageTemp.toFixed(1)}&deg;C
              </>
            )
          }
          caption={
            stats.liveDataTanks === 0
              ? 'Waiting for live telemetry'
              : `Across ${stats.liveDataTanks} live tank${stats.liveDataTanks === 1 ? '' : 's'}`
          }
          iconBg="bg-orange-500/20"
          iconColor="text-orange-400"
        />
        <StatCard
          icon={Waves}
          label="Average Purity (TDS)"
          value={formatAverage(stats.averageQuality, stats.liveDataTanks, '%')}
          caption={
            stats.liveDataTanks === 0
              ? 'Waiting for live telemetry'
              : 'Water purity score from TDS readings'
          }
          iconBg="bg-teal-500/20"
          iconColor="text-teal-300"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={Droplets}
          label="Average Water Level"
          value={formatAverage(stats.averageLevel, stats.liveDataTanks, '%')}
          caption={
            stats.liveDataTanks === 0
              ? 'Waiting for live telemetry'
              : `Across ${stats.liveDataTanks} live tank${stats.liveDataTanks === 1 ? '' : 's'}`
          }
          iconBg="bg-blue-500/20"
          iconColor="text-blue-400"
        />
        <StatCard
          icon={Fish}
          label="Active Feeders"
          value={stats.totalTanks === 0 ? 'No data' : `${stats.activeFeeders}/${stats.totalTanks}`}
          caption="Automated feeding"
          iconBg="bg-cyan-500/20"
          iconColor="text-cyan-400"
        />
        <StatCard
          icon={Cpu}
          label="Running Systems"
          value={stats.totalTanks === 0 ? 'No data' : `${stats.activeFilters}/${stats.totalTanks}`}
          caption={`${stats.lightsOn} lights on`}
          iconBg="bg-slate-500/20"
          iconColor="text-slate-300"
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-semibold text-white">Aquariums</h3>
            <Badge variant="default">{owner.aquariums.length} total</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {owner.aquariums.length === 0 ? (
            <div className="py-8 text-center text-slate-400">
              This user does not have any aquariums yet.
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {owner.aquariums.map((aquarium) => (
                <TankCard key={aquarium.id} aquarium={aquarium} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium transition-all"
    >
      <RefreshCw className="w-4 h-4" />
      Refresh
    </button>
  );
}
