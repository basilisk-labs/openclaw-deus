export interface HealthSummary {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  database: { connected: boolean };
  beliefs: { count: number; active: number };
  memory: { recent_entries: number; latest_day: string | null };
  introspection: { latest_date: string | null };
}
