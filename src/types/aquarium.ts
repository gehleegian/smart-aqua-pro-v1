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
}