import type { Aquarium } from './aquarium';
import type { CommandStatus, DeviceTelemetryState, TelemetryValidity } from './device';
import type { UserData, UserRole } from './user';

export type HealthStatus = 'healthy' | 'warning';
export type {
  AssessmentSeverity, TelemetrySource, SimulationScenario, MonitoringParameter,
  ParameterAssessment, AquariumConditionAssessment,
} from '../utils/monitoringAssessmentCore';
import type { AquariumConditionAssessment, TelemetrySource } from '../utils/monitoringAssessmentCore';

export type MonitoringAquarium = Aquarium & {
  turbidityState?: 'Clear' | 'Cloudy' | 'Unknown';
  turbidityVoltage?: number;
  healthStatus: HealthStatus;
  assessment: AquariumConditionAssessment;
  telemetrySource: TelemetrySource;
  hasFreshTelemetry: boolean;
  hasFreshWaterLevelTelemetry?: boolean;
  waterLevelMessage?: string;
  waterLevelObservation?: {
    waterLevelPercent?: number;
    waterLevelReadingValid?: boolean;
    waterLevelTargetHeightCm?: number;
    updatedAt?: number;
  };
  hasFreshTemperatureTelemetry: boolean;
  hasFreshPurityTelemetry: boolean;
  hasFreshPhTelemetry: boolean;
  hasFreshTurbidityTelemetry: boolean;
  hasFreshPowerTelemetry: boolean;
  telemetryState: DeviceTelemetryState;
  lastUpdatedAt: number | null;
  reportedFilterState?: 'Active' | 'Inactive';
  reportedLightState?: 'On' | 'Off';
  reportedEquipmentStatus?: 'Normal' | 'Warning' | 'Fault' | 'Unknown';
  sensorValidity: TelemetryValidity | null;
  commandStatus: CommandStatus;
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
