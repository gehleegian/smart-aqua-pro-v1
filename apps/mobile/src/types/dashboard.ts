import type { ComponentType } from 'react';
import type { Aquarium } from './aquarium';
import type { DeviceTelemetryState } from './device';
import type { UserData } from '@smartaqua/shared';

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
  icon: ComponentType<any>;
  change: string;
  trend: DashboardTrend;
  sparkline: number[];
};

export type DashboardSummaryCard = {
  title: string;
  value: string | number;
  icon: ComponentType<any>;
  tone: 'accent' | 'success' | 'warning';
};

export type DashboardData = {
  userProfile: UserData;
  aquariums: DashboardAquarium[];
  users: UserData[];
};
