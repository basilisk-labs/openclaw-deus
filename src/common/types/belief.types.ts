export const BELIEF_CLASSES = ['axiom', 'self_model', 'user_model', 'operational', 'hypothesis'] as const;
export type BeliefClass = typeof BELIEF_CLASSES[number];

export const DECAY_MODES = ['no_decay', 'slow', 'normal', 'fast'] as const;
export type DecayMode = typeof DECAY_MODES[number];

export const BELIEF_STATUSES = ['active', 'archived', 'review_needed', 'deprecated'] as const;
export type BeliefStatus = typeof BELIEF_STATUSES[number];

export interface DriftEntry {
  timestamp: string;
  old_confidence?: number;
  new_confidence?: number;
  confidence?: number;
  reason: string;
  source?: string;
  with?: string;
  old_status?: string;
  new_status?: string;
  belief_class?: string;
  decay_mode?: string;
  decay_rate?: number;
  confidence_floor?: number;
  evidence?: string;
}

export interface Belief {
  id?: string; // SurrealDB record id
  belief_id: string;
  content: string;
  confidence: number;
  evidence_set: string[];
  source_type: string;
  belief_class: BeliefClass;
  decay_mode: DecayMode;
  confidence_floor: number;
  review_threshold: number;
  context_scope: string;
  status: BeliefStatus;
  drift_history: DriftEntry[];
  ontological_anchor?: string;
  inference_trace?: string[];
  archivable?: boolean;
  refresh_strategy?: string;
  timestamp_created: string;
  timestamp_updated: string;
}

export interface DecayProfile {
  belief_class: BeliefClass;
  decay_mode: DecayMode;
  decay_rate: number;
  confidence_floor: number;
  review_threshold: number;
  archivable: boolean;
}

export interface DecayResult {
  changed: boolean;
  belief: Belief;
  profile: DecayProfile;
  rawDecayedConfidence: number;
}

export interface DecayStats {
  timestamp: string;
  total_beliefs: number;
  decayed: number;
  flagged: number;
  deprecated: number;
  archived: number;
  restored_exempt: number;
  avg_confidence: number;
}

export interface ExtractionCandidate {
  content: string;
  confidence: number;
  category: string;
  prefix: string;
  type: string;
  autoPromote: boolean;
  provenance?: string;
}

export interface ExtractionStats {
  timestamp: string;
  files_processed: number;
  extracted: number;
  updated: number;
  deferred: number;
  total_beliefs: number;
}

export interface Contradiction {
  belief_1: string;
  belief_2: string;
  content_1: string;
  content_2: string;
  severity: 'high' | 'medium';
  scope: string;
  reason?: string;
}

export interface ContradictionStats {
  timestamp: string;
  total_checked: number;
  contradictions_found: number;
  high_severity: number;
  medium_severity: number;
}

export interface ReviewCandidate {
  id?: string;
  content: string;
  confidence_proposal: number;
  recurrence: number;
  source: string;
  category: string;
  prefix: string;
  human_review_needed: string;
  status: 'pending' | 'promoted' | 'deferred' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface PromotionStats {
  timestamp: string;
  total_reviewed: number;
  promoted: number;
  deferred: number;
  rejected: number;
  refreshed: number;
}
