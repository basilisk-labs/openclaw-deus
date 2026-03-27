export const ACTIVITY_TYPES = ['git', 'command', 'decision', 'interaction', 'event'] as const;
export type ActivityType = typeof ACTIVITY_TYPES[number];

export const MEMORY_SECTIONS = [
  'Git Activity',
  'Commands Executed',
  'Decisions',
  'Interactions',
  'System Events',
] as const;
export type MemorySection = typeof MEMORY_SECTIONS[number];

export interface ActivityLogEntry {
  id?: string;
  type: ActivityType;
  description: string;
  context: Record<string, unknown>;
  agent: string;
  day_key: string;
  timestamp: string;
}

export interface DailyMemory {
  id?: string;
  day_key: string;
  sections: Record<string, string[]>;
  entry_count: number;
  generated_at: string;
}

export interface AggregateResult {
  day_key: string;
  entries_processed: number;
  sections_updated: string[];
}

export interface MemorySearchResult {
  entries: ActivityLogEntry[];
  total: number;
  query: string;
}
