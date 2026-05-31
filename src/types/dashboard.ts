import type { LucideIcon } from 'lucide-react';
import type { Aquarium } from './aquarium';
import type { DeviceTelemetryState } from './device';
import type { UserData } from './user';

export type DashboardStatus = 'healthy' | 'warning';

export type DashboardTrend = 'good' | 'warning';

export type DashboardAquarium = Aquarium & {
  status: DashboardStatus;
  fishCount: number;
  hasFreshTelemetry: boolean;
  hasFreshPurityTelemetry: boolean;
  telemetryState: DeviceTelemetryState;
};

export type OwnerGroup = {
  ownerId: string;
  ownerName: string;
  aquariums: DashboardAquarium[];
  warningCount: number;
};

export type DashboardTankStat = {
  title: string;
  value: string;
  icon: LucideIcon;
  change: string;
  trend: DashboardTrend;
  sparkline: number[];
};

export type DashboardSummaryCard = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  iconClassName: string;
  iconWrapperClassName: string;
};

export type DashboardData = {
  userProfile: UserData;
  aquariums: DashboardAquarium[];
  users: UserData[];
};
