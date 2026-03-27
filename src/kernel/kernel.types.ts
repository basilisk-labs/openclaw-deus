/**
 * DEUS Cognitive Kernel — Core Types
 *
 * Self-recursive loop. Agents → traces → convergence → commit → reflection → agents.
 * Time is emergent. Wall-clock is not a citizen. Cognitive cycle is THE unit of time.
 * "Reptilian brain" = substrate services. Not legacy — biologically necessary.
 */

// ═══════════════════════════════════════════
// SIGNALS
// ═══════════════════════════════════════════

export type SignalType = 'perception' | 'prediction' | 'affect' | 'priority' | 'strategy';

export interface Signal {
  agent_id: string;
  agent_rank: number;
  type: SignalType;
  content: string;
  payload: Record<string, unknown>;
  confidence: number;
  novelty_cost: number;         // how expensive to produce (slow-path = high)
  used_slow_path: boolean;
  targets: string[];            // trace_ids this signal is about
  cycle: number;
}

// ═══════════════════════════════════════════
// TRACES — unified memory substrate
// ═══════════════════════════════════════════

export interface Trace {
  id?: string;
  trace_id: string;
  source_type: 'belief' | 'knowledge' | 'episode' | 'event' | 'decision' | 'signal' | 'commit' | 'lexical';
  source_id?: string;
  content: string;

  // Memory dynamics
  weight: number;
  initial_weight: number;
  freshness: number;
  confidence: number;
  emotional_charge: number;     // -1..1

  // Reactivation — key for time perception
  reactivation_count: number;
  last_reactivated_cycle: number;
  reactivation_history: number[];

  // Temporal identity (cognitive cycle as first-class citizen)
  created_at_cycle: number;
  cycle_distance?: number;      // computed: current_cycle - created_at_cycle
  reactivation_distance?: number; // computed: current_cycle - last_reactivated_cycle

  // Concept space position (adaptive, grows with dimensions)
  position: number[];           // N-dimensional, expands as dimensions are born
  velocity: number[];           // momentum for smooth movement

  // State
  suppressed: boolean;
  archived: boolean;
}

export type TraceRelation = 'activates' | 'inhibits' | 'precedes' | 'caused_by' | 'similar_to';

// ═══════════════════════════════════════════
// COMMITS — typed, not flat
// ═══════════════════════════════════════════

export type CommitType =
  | 'perceptual'     // "I saw X" — raw observation entered awareness
  | 'interpretive'   // "X means Y" — inference from perception
  | 'priority'       // "Y is important because Z" — urgency/relevance shift
  | 'self_model'     // "I now know/believe/can ..." — identity change
  | 'action'         // "I should do X" — action queued
  | 'meta';          // "My process is doing Z" — meta-cognition about own state

export interface CommitDelta {
  id?: string;
  commit_id: string;
  cycle: number;
  type: CommitType;

  // Provenance
  source_agents: string[];
  convergence_score: number;
  is_escalation: boolean;

  // What changed
  changes: {
    traces_activated: string[];
    traces_suppressed: string[];
    traces_created: string[];
    world_model_delta?: Record<string, unknown>;
    self_model_delta?: Record<string, unknown>;
    risk_delta?: Record<string, unknown>;
    actions_queued?: string[];
  };

  // Energy metrics (for stabilization criterion)
  novelty_cost: number;
  prediction_error: number;
  maturity: number;
  urgency: number;
  energy: number;               // composite: novelty + prediction_error + urgency
}

// ═══════════════════════════════════════════
// STABILIZATION — energy-based, not counter-based
// ═══════════════════════════════════════════

export interface StabilizationState {
  convergence_pressure: number;  // total unresolved signal energy
  new_high_energy_traces: number;
  commit_delta_magnitude: number; // |commit_N - commit_N-1|
  prediction_error_trend: number; // rising / falling / flat
  pending_escalations: number;
  energy: number;                 // composite metric
  stable: boolean;                // energy < threshold
}

// Guardrails against self-confirming hallucination
export interface RecursionGuard {
  consecutive_self_model_commits: number; // max 1 without new independent evidence
  uncertainty_trend: number[];            // must decrease or explanatory power must increase
  orthogonal_signal_deficit: number;      // cycles without new ⊥ signals → suspected loop
}

// ═══════════════════════════════════════════
// TIME-SENSE — emergent, derived, never stored
// ═══════════════════════════════════════════

export interface TimeSense {
  cycle: number;
  tempo: number;
  novelty_rate: number;
  prediction_error_rate: number;
  trace_decay_velocity: number;
  dilation: number;
  rhythm_phase: 'active' | 'consolidating' | 'resting';
}

// ═══════════════════════════════════════════
// PHENOMENAL STATE — snapshot of what system "experiences"
// ═══════════════════════════════════════════

export interface PhenomenalState {
  cycle: number;
  dominant_traces: Array<{ trace_id: string; content: string; weight: number }>;
  top_conflicts: Array<{ trace_a: string; trace_b: string; tension: number }>;
  active_priorities: string[];
  self_world_tension: number;     // disagreement between self-model and world-model
  prediction_error_hotspots: Array<{ domain: string; error: number }>;
  temporal_dilation: number;
  felt_valence: number;           // -1..1: overall "mood" (threat vs reward)
  felt_urgency: number;           // 0-1
}

// ═══════════════════════════════════════════
// KERNEL OUTPUT — "remainder after stabilization"
// ═══════════════════════════════════════════

export interface KernelOutput {
  total_cycles: number;
  total_commits: number;
  converged: boolean;
  convergence_reason: string;

  // What changed (operator-facing)
  what_changed: string[];         // key changes that stabilized
  what_became_clearer: string[];  // reduced uncertainties
  what_remains_tense: string[];   // unresolved tensions
  actions_matured: string[];      // actions ready to execute
  unresolved: string[];           // what system couldn't resolve

  // Internal state
  time_sense: TimeSense;
  phenomenal_state: PhenomenalState;
  affect: {
    hormones: { cortisol: number; dopamine: number; norepinephrine: number; serotonin: number };
    pain: { intensity: number; source: string; chronic: boolean };
    valence: number;
    arousal: number;
    mode: string;
  };
  commits: CommitDelta[];
}

// ═══════════════════════════════════════════
// NARRATIVE
// ═══════════════════════════════════════════

export interface NarrativeFrame {
  timeframe: string;
  summary: string;
  temporal_quality: string;
  key_events: string[];
  unresolved: string[];
}
