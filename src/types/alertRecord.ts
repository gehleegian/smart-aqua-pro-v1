export interface AlertRecordDocument {
  alert_id: string;
  aquarium_id: string;
  device_id: string;
  type: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  status?: 'active' | 'resolved';
  triggered_at: Date;
  resolved_at: Date | null;
}
