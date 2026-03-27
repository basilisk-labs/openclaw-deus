export const DISSENSUS_DECISIONS = ['allow', 'signal_l1', 'pause_l2', 'refuse_l3'] as const;
export type DissensusLevel = typeof DISSENSUS_DECISIONS[number];

export const CANONICAL_ACTION_TYPES = [
  'analyze', 'belief_mutation', 'git_commit', 'destructive',
  'deploy', 'external_message', 'read', 'repo_mutation', 'write_internal', 'unknown',
] as const;
export type CanonicalActionType = typeof CANONICAL_ACTION_TYPES[number];

export const URGENCY_VALUES = ['low', 'medium', 'high', 'critical'] as const;
export type Urgency = typeof URGENCY_VALUES[number];

export type TargetClass = 'identity_root' | 'durable_belief_state' | 'runtime_state' | 'third_party' | 'local' | 'unknown';

export interface NormalizedIntent {
  version: number;
  goal: string;
  action_type: CanonicalActionType;
  target: string | null;
  external: boolean;
  destructive: boolean;
  confirmed_by_human: boolean;
  dependencies: string[];
  urgency: Urgency;
  context_sources: string[];
  repo_mutation: boolean;
  belief_mutation: boolean;
  requires_human_confirmation: boolean;
  high_impact: boolean;
  scope: 'external' | 'internal';
}

export interface DissensusDecision {
  evaluated_at: string;
  decision: DissensusLevel;
  trigger_type: string;
  action_type: string;
  target: string | null;
  target_class: TargetClass;
  reason: string;
  override_allowed: boolean;
  override_token_kind: string;
}

export interface RipenessScore {
  score: number;
  class: string;
  blockers: string[];
  missing_preconditions: string[];
  factor_scores: Record<string, number>;
  rationale: string;
}

export interface PolicyDecision {
  version: number;
  evaluated_at: string;
  intent: NormalizedIntent;
  decision: string;
  shouldActNow: boolean;
  ripeness: RipenessScore;
  dissensus: DissensusDecision;
  blockers: string[];
  requiresHumanConfirmation: boolean;
  decisionSummary: string;
}

export interface ActionTypeProfile {
  action_type: string;
  external: boolean;
  destructive: boolean;
  repo_mutation: boolean;
  belief_mutation: boolean;
  human_confirmation_required: boolean;
  high_impact: boolean;
  impact: string;
  reversibility: string;
}
