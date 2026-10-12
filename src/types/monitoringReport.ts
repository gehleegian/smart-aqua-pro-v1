export interface MonitoringReportSummary {
  temperature?: string;
  waterLevel?: string;
  tds?: string;
  ph?: string;
  turbidity?: string;
  ammonia?: string;
  powerStatus?: string;
  equipmentStatus?: string;
}

export interface MonitoringReportDocument {
  report_id: string;
  aquarium_id: string;
  report_type: string;
  start_date: Date;
  end_date: Date;
  summary: string;
  sensor_summary?: MonitoringReportSummary;
  alert_summary?: Record<string, unknown>;
  maintenance_summary?: Record<string, unknown>;
  fileUrl: string | null;
  generated_at: Date;
  generated_by: string;
}
