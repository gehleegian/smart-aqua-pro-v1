export type FilterMode = 'Low' | 'Medium' | 'High';

export interface AutomationSettings {
  feedingTime: string;
  lightOnTime: string;
  lightOffTime: string;
  filtrationMode: FilterMode;
  filtrationStartTime: string;
  filtrationRuntimeHours: number;
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
}
