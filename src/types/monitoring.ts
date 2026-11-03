import type { Aquarium } from './aquarium';
import type { DeviceTelemetryState } from './device';
import type { UserData, UserRole } from './user';

export type HealthStatus = 'healthy' | 'warning';
export type {
  AssessmentSeverity, TelemetrySource, SimulationScenario, MonitoringParameter,
  ParameterAssessment, AquariumConditionAssessment,
} from '../utils/monitoringAssessmentCore';
import type { AquariumConditionAssessment, TelemetrySource } from '../utils/monitoringAssessmentCore';

export type MonitoringAquarium = Aquarium & {
  healthStatus: HealthStatus;
  assessment: AquariumConditionAssessment;
  telemetrySource: TelemetrySource;
  hasFreshTelemetry: boolean;
  hasFreshTemperatureTelemetry: boolean;
  hasFreshPurityTelemetry: boolean;
  hasFreshPhTelemetry: boolean;
  hasFreshTurbidityTelemetry: boolean;
  hasFreshPowerTelemetry: boolean;
  telemetryState: DeviceTelemetryState;
};

export type OwnerStats = {
  totalTanks: number;
  liveDataTanks: number;
  healthyTanks: number;
  warningTanks: number;
  averageTemp: number;
  averageLevel: number;
  averageQuality: number;
  activeFeeders: number;
  activeFilters: number;
  lightsOn: number;
};

export type MonitoringOwner = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  aquariums: MonitoringAquarium[];
  stats: OwnerStats;
};

export type MonitoringData = {
  userProfile: UserData;
  aquariums: MonitoringAquarium[];
  users: UserData[];
};

export type SystemField = 'feeder' | 'light' | 'filter';
export type SystemMode = 'manual' | 'automation';

export type ManualActionLock = {
  activeUntil: number;
  cooldownUntil: number;
};

export type ManualActionTone = 'ready' | 'busy' | 'waiting';

export type ManualActionDisplay = {
  status: string;
  buttonLabel: string;
  disabled: boolean;
  tone: ManualActionTone;
};
