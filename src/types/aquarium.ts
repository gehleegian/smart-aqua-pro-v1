export interface AutomationSettings {
  enabled: boolean;
  feedingTimes: string[];
  lightOnTime: string;
  lightOffTime: string;
  filtrationStartTime: string;
  filtrationRuntimeHours: number;
  ammoniaThreshold: number;
}

export interface ManualSystemStatus {
  feeder: string;
  light: string;
  filter: string;
}

export interface Aquarium {
  id: string;
  name: string;
  species: string[];
  bioload: 'low' | 'medium' | 'high';
  temp: number;
  level: number;
  quality: number;
  feeder: string;
  light: string;
  filter: string;
  minTemp: number;
  maxTemp: number;
  ownerId: string;
  ownerName: string;
  automationSettings?: AutomationSettings;
  manualStatus?: ManualSystemStatus;
}
