// --- Calibrated Probability ---
export interface CalibratedProbability {
  point: number;    // best estimate 0-1
  lower: number;    // 90% credible interval lower bound
  upper: number;    // 90% credible interval upper bound
}

export function calibrated(point: number, spread = 0.1): CalibratedProbability {
  return {
    point: clamp(point),
    lower: clamp(point - spread),
    upper: clamp(point + spread),
  };
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, Math.round(v * 1000) / 1000));
}

// --- Tension Edge (replaces binary Contradiction) ---
export type TensionRelation = 'entails' | 'contradicts' | 'tension' | 'neutral' | 'temporal_reversal' | 'desire_tension';

export interface TensionEdge {
  belief_a: string;
  belief_b: string;
  relation: TensionRelation;
  degree: number;        // 0.0 (mild) — 1.0 (hard contradiction)
  explanation: string;
  detected_at: string;
  resolvable: boolean;
  resolution?: {
    action: 'keep_both' | 'archive_older' | 'merge' | 'ask_user' | 'lower_confidence';
    merged_belief?: string;
    reasoning: string;
  };
}

// --- Enhanced Extraction ---
export type BeliefExtractionType = 'explicit' | 'implicit' | 'meta';
export type EvidenceQuality = 'explicit_statement' | 'strong_implication' | 'behavioral_pattern' | 'weak_inference';
export type UpdateType = 'new' | 'reinforces_existing' | 'updates_existing' | 'contradicts_existing';

export interface SemanticExtractionCandidate {
  content: string;
  original_language_content?: string;
  belief_type: 'preference' | 'constraint' | 'fact' | 'value' | 'skill' | 'goal';
  confidence: CalibratedProbability;
  evidence_quality: EvidenceQuality;
  category: string;
  update_type: UpdateType;
  related_existing_belief_id?: string;
  extraction_method: 'pattern' | 'llm_semantic' | 'behavioral_inference';
  depends_on: string[];
}

// --- Meta-Cognitive Report ---
export interface MetaCognitiveReport {
  helpfulness: {
    score: number;
    override_rate: number;
    reask_rate: number;
    acceptance_rate: number;
    trend: 'improving' | 'degrading' | 'stable';
  };
  calibration: {
    ece: number;              // Expected Calibration Error
    overconfident: boolean;
    underconfident: boolean;
    correction_factor: number;
    sample_size: number;
  };
  blind_spots: {
    uncovered_topics: string[];
    suggested_queries: string[];
  };
  strategy_eval: {
    effectiveness: number;
    suggested_adjustments: string[];
  };
  growth: {
    coherence_trend: number[];
    belief_count_trend: number[];
    trajectory: 'expanding' | 'consolidating' | 'degrading';
  };
  self_reflection?: string;
  insights: string[];
}

// --- User Mental State ---
export interface UserMentalState {
  phase: 'exploration' | 'focused_work' | 'review' | 'idle' | 'onboarding';
  mood_signal: 'engaged' | 'frustrated' | 'neutral' | 'exploratory';
  cognitive_load: 'low' | 'medium' | 'high';
  inferred_from: string[];
  confidence: number;
}

// --- Expected Value ---
export interface ExpectedValue {
  expected_value: number;
  net_value_over_inaction: number;
  p_success: number;
  success_value: number;
  failure_cost: number;
  inaction_cost: number;
}

// --- Historical Policy Adjustment ---
export interface HistoricalAdjustment {
  threshold_adjustment: number;
  trust_score: number;
  override_rate: number;
  sample_size: number;
  reason: string;
}

// --- Goal Prediction ---
export interface GoalPrediction {
  goal_id: string;
  success_probability: number;
  blockers: string[];
  suggested_next_action: string;
}

// --- Importance Score ---
export interface ImportanceScore {
  score: number;
  factors: {
    impact: number;
    uniqueness: number;
    relevance: number;
    user_involvement: number;
    belief_impact: number;
  };
}
