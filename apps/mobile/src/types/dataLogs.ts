import type { Aquarium } from './aquarium';
import type { DeviceShadow, DeviceTelemetryLogEntry } from './device';
import type { UserRole } from '@smartaqua/shared';

export type PeriodKey = '24h' | '7d' | '30d' | '90d';

export type ChartPoint = {
  label: string;
  value: number;
};

export type SummaryItem = {
  label: string;
  value: string;
};

export type DataLogsPageData = {
  aquariums: Aquarium[];
  userRole: UserRole;
};

export type DataLogsHistoryState = {
  selectedAquarium: Aquarium | null;
  liveShadow: DeviceShadow | null;
  historyEntries: DeviceTelemetryLogEntry[];
  selectedDate: string;
  timePeriod: PeriodKey;
  userRole: UserRole;
};
