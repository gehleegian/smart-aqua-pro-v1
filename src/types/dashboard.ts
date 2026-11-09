import type { LucideIcon } from 'lucide-react';
import type { Aquarium, AquariumDirectoryEntry } from './aquarium';
import type { CommandStatus, DeviceTelemetryState, TelemetryValidity } from './device';
import type { UserData } from './user';
import type { AquariumConditionAssessment, TelemetrySource } from './monitoring';
import type { EffectiveThresholds } from '../utils/monitoringAssessmentCore';
import type { AquariumEngineState } from '../services/ruleConfigService';

export type DashboardStatus = 'healthy' | 'warning';

export type DashboardTrend = 'good' | 'warning';

export type DashboardAquarium = Aquarium & {
  turbidityState?: 'Clear' | 'Cloudy';
  status: DashboardStatus;
  assessment: AquariumConditionAssessment;
  telemetrySource: TelemetrySource;
  fishCount: number;
  hasFreshTelemetry: boolean;
  hasFreshWaterLevelTelemetry?: boolean;
  waterLevelMessage?: string;
  hasFreshTemperatureTelemetry: boolean;
  hasFreshPurityTelemetry: boolean;
  hasFreshPhTelemetry: boolean;
  hasFreshTurbidityTelemetry: boolean;
  hasFreshPowerTelemetry: boolean;
  telemetryState: DeviceTelemetryState;
  lastUpdatedAt: number | null;
  sensorValidity: TelemetryValidity | null;
  commandStatus: CommandStatus;
  /** Effective thresholds (species defaults + per-aquarium overrides) from Firestore. */
  thresholds: EffectiveThresholds | null;
  /** Parameters whose range differs from the species default ("Custom"). */
  customThresholds?: string[];
  /** Server condition / cleaning summaries from the aquarium doc. */
  engineState: AquariumEngineState | null;
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
  aquariumDirectory: AquariumDirectoryEntry[];
  users: UserData[];
};
