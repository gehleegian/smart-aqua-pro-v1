export interface MonitoringReportDocument {
  report_id: string;
  aquarium_id: string;
  report_type: string;
  start_date: Date;
  end_date: Date;
  summary: string;
  fileUrl: string | null;
  generated_at: Date;
  generated_by: string;
}
