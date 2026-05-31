import type { AlertCategory, AlertSeverity } from './alerts';

export type HeaderConnectionTone = 'online' | 'warning' | 'offline';

export type HeaderConnectionStatus = {
  label: string;
  detail: string;
  tone: HeaderConnectionTone;
};

export type HeaderNotification = {
  id: string;
  fingerprint: string;
  type: AlertSeverity;
  category: AlertCategory;
  message: string;
  tankName: string;
  ownerName: string;
  timestamp: number;
  read: boolean;
};
