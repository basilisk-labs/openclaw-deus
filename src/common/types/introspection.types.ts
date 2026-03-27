export type IntrospectionProfile = 'full' | 'sleep';
export type IntrospectionPosture = 'stable' | 'review' | 'repair';

export interface IntrospectionStageResult {
  name: string;
  status: 'ok' | 'skipped' | 'error';
  data?: Record<string, unknown>;
  error?: string;
}

export interface IntrospectionReport {
  id?: string;
  profile: IntrospectionProfile;
  executed_stages: string[];
  coherence_score: number;
  posture: IntrospectionPosture;
  summary: IntrospectionSummary;
  stage_outputs: Record<string, unknown>;
  generated_at: string;
}

export interface IntrospectionSummary {
  total_beliefs: number;
  active_beliefs: number;
  low_confidence_count: number;
  avg_confidence: number;
  contradictions_found: number;
  memory_freshness_days: number;
  posture: IntrospectionPosture;
  coherence_score: number;
}

export interface NightlyRunResult {
  id?: string;
  stages: NightlyStageResult[];
  stage_order: string[];
  summary: Record<string, unknown>;
  started_at: string;
  finished_at: string;
}

export interface NightlyStageResult {
  name: string;
  status: string;
  result: Record<string, unknown>;
}
