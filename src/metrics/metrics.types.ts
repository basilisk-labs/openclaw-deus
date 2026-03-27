export interface CoherenceDimension {
  score: number;
  posture: string;
  contradictions: number;
}

export interface CalibrationDimension {
  ece: number;
  overconfident: boolean;
  sample_size: number;
}

export interface KnowledgeDimension {
  total: number;
  gaps_open: number;
  gaps_high_impact: number;
  extraction_rate: number;
}

export interface BeliefsDimension {
  total: number;
  active: number;
  avg_confidence: number;
  decay_rate: number;
  promotion_rate: number;
}

export interface IntentionsDimension {
  active: number;
  completion_rate: number;
  stale_count: number;
  avg_duration_ms: number;
}

export interface DeliberationDimension {
  total: number;
  safety_pass_rate: number;
  avg_options: number;
}

export interface EpisodesDimension {
  total: number;
  success_rate: number;
  trend: string;
}

export interface PipelineDimension {
  avg_duration_ms: number;
  error_rate: number;
  throughput: number;
}

export interface WorldModelDimension {
  confidence: number;
  freshness_hours: number;
}

export interface LlmDimension {
  daily_tokens_used: number;
  budget_utilization: number;
  cache_hit_rate: number;
}

export interface CognitiveDimensions {
  coherence: CoherenceDimension;
  calibration: CalibrationDimension;
  knowledge: KnowledgeDimension;
  beliefs: BeliefsDimension;
  intentions: IntentionsDimension;
  deliberation: DeliberationDimension;
  episodes: EpisodesDimension;
  pipeline: PipelineDimension;
  world_model: WorldModelDimension;
  llm: LlmDimension;
}

export interface CognitiveSnapshot {
  id?: string;
  timestamp: string;
  dimensions: CognitiveDimensions;
  health_score: number;
  weak_dimensions: string[];
}

export type DimensionName = keyof CognitiveDimensions;

export const DIMENSION_WEIGHTS: Record<DimensionName, number> = {
  coherence: 0.15,
  calibration: 0.10,
  knowledge: 0.12,
  beliefs: 0.12,
  intentions: 0.10,
  deliberation: 0.10,
  episodes: 0.10,
  pipeline: 0.06,
  world_model: 0.10,
  llm: 0.05,
};

export const DIMENSION_THRESHOLDS: Record<DimensionName, number> = {
  coherence: 0.7,
  calibration: 0.85,  // inverted: 1 - ece
  knowledge: 0.5,
  beliefs: 0.6,
  intentions: 0.5,
  deliberation: 0.7,
  episodes: 0.6,
  pipeline: 0.7,
  world_model: 0.6,
  llm: 0.5,
};
