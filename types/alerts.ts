export type AlertSeverity = "info" | "warning" | "critical";

export type SmartAlert = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  href: string;
  category: string;
};

export type AlertPreferences = {
  id?: string;
  user_id?: string;
  low_stock_enabled: boolean;
  service_due_enabled: boolean;
  overdue_jobs_enabled: boolean;
  negative_margin_enabled: boolean;
  unpriced_grain_enabled: boolean;
  upcoming_jobs_days: number;
};

