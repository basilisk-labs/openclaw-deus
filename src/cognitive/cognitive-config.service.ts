import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';

/**
 * CognitiveConfigService: Runtime-tunable parameters for the entire cognitive system.
 * All magic numbers live here, stored in SurrealDB, adjustable by the agent's learning loop.
 *
 * To change a parameter: POST /config/cognitive { key: "similarity.belief_match", value: 0.75 }
 * To let the agent tune: call adjustFromFeedback() with accuracy metrics
 */

import { CognitiveParam } from '../common/types/cognitive-config.types';

// Defaults — these are the STARTING values. The agent can tune them.
const DEFAULTS: Record<string, Omit<CognitiveParam, 'key'>> = {
  // --- Similarity thresholds ---
  'similarity.belief_match': { value: 0.7, description: 'Threshold for matching existing belief', min: 0.3, max: 0.95, tunable: true },
  'similarity.contradiction_negation': { value: 0.6, description: 'Threshold for negation-based contradiction', min: 0.3, max: 0.9, tunable: true },
  'similarity.contradiction_content': { value: 0.5, description: 'Threshold for content similarity in contradiction', min: 0.2, max: 0.8, tunable: true },
  'similarity.knowledge_match': { value: 0.7, description: 'Threshold for matching existing knowledge', min: 0.3, max: 0.95, tunable: true },
  'similarity.cluster': { value: 0.6, description: 'Threshold for agglomerative clustering', min: 0.3, max: 0.9, tunable: true },
  'similarity.memory_recall': { value: 0.4, description: 'Threshold for associative memory recall', min: 0.1, max: 0.8, tunable: true },

  // --- Decay rates ---
  'decay.rate_slow': { value: 0.001, description: 'Decay rate for slow mode', min: 0.0001, max: 0.01, tunable: true },
  'decay.rate_normal': { value: 0.01, description: 'Decay rate for normal mode', min: 0.001, max: 0.05, tunable: true },
  'decay.rate_fast': { value: 0.02, description: 'Decay rate for fast mode', min: 0.005, max: 0.1, tunable: true },

  // --- Evidence weights ---
  'evidence.explicit_statement': { value: 0.9, description: 'Weight for explicit statements', min: 0.5, max: 1.0, tunable: true },
  'evidence.strong_implication': { value: 0.6, description: 'Weight for strong implications', min: 0.3, max: 0.9, tunable: true },
  'evidence.behavioral_pattern': { value: 0.4, description: 'Weight for behavioral patterns', min: 0.1, max: 0.7, tunable: true },
  'evidence.weak_inference': { value: 0.2, description: 'Weight for weak inferences', min: 0.05, max: 0.5, tunable: true },

  // --- Bayesian update ---
  'bayesian.learning_rate': { value: 0.3, description: 'Learning rate for evidence updates', min: 0.05, max: 0.8, tunable: true },
  'bayesian.reinforcement_boost_cap': { value: 0.1, description: 'Max confidence boost per reinforcement', min: 0.01, max: 0.3, tunable: true },
  'bayesian.ci_z_score': { value: 1.645, description: 'Z-score for credible interval (1.645=90%, 1.96=95%)', min: 1.0, max: 2.58, tunable: false },

  // --- Promotion ---
  'promotion.min_recurrence': { value: 3, description: 'Min times seen before promoting belief', min: 1, max: 10, tunable: true },
  'promotion.min_confidence': { value: 0.6, description: 'Min confidence for promotion', min: 0.3, max: 0.9, tunable: true },
  'promotion.defer_recurrence': { value: 2, description: 'Recurrence threshold for deferral', min: 1, max: 5, tunable: true },
  'promotion.confidence_boost': { value: 0.03, description: 'Confidence boost per reinforcement', min: 0.005, max: 0.1, tunable: true },

  // --- Contradiction resolution ---
  'contradiction.confidence_penalty': { value: 0.8, description: 'Multiplier applied to confidence on contradiction', min: 0.5, max: 0.95, tunable: true },
  'contradiction.divergence_threshold': { value: 0.5, description: 'Confidence difference for divergence detection', min: 0.2, max: 0.8, tunable: true },

  // --- Ripeness weights ---
  'ripeness.w_goal_clarity': { value: 0.22, description: 'Weight for goal clarity factor', min: 0.05, max: 0.5, tunable: true },
  'ripeness.w_world_quality': { value: 0.20, description: 'Weight for world model quality', min: 0.05, max: 0.5, tunable: true },
  'ripeness.w_dependency': { value: 0.20, description: 'Weight for dependency readiness', min: 0.05, max: 0.5, tunable: true },
  'ripeness.w_authorization': { value: 0.18, description: 'Weight for authorization', min: 0.05, max: 0.5, tunable: true },
  'ripeness.w_environment': { value: 0.12, description: 'Weight for environment readiness', min: 0.05, max: 0.3, tunable: true },
  'ripeness.w_freshness': { value: 0.08, description: 'Weight for context freshness', min: 0.02, max: 0.2, tunable: true },
  'ripeness.threshold_ready': { value: 0.8, description: 'Score threshold for "ready"', min: 0.5, max: 0.95, tunable: true },
  'ripeness.threshold_soon': { value: 0.6, description: 'Score threshold for "soon"', min: 0.3, max: 0.8, tunable: true },

  // --- Coherence / introspection ---
  'introspection.coherence_w_avgconf': { value: 0.6, description: 'Weight for avg confidence in coherence', min: 0.2, max: 0.9, tunable: true },
  'introspection.coherence_w_lowratio': { value: 0.3, description: 'Weight for low-ratio in coherence', min: 0.1, max: 0.5, tunable: true },
  'introspection.coherence_penalty_per_contradiction': { value: 0.05, description: 'Coherence penalty per contradiction', min: 0.01, max: 0.2, tunable: true },
  'introspection.threshold_stable': { value: 0.85, description: 'Coherence for stable posture', min: 0.7, max: 0.95, tunable: true },
  'introspection.threshold_review': { value: 0.8, description: 'Coherence for review posture', min: 0.5, max: 0.9, tunable: true },
  'introspection.low_confidence_threshold': { value: 0.7, description: 'What counts as low confidence', min: 0.3, max: 0.9, tunable: true },

  // --- World model ---
  'worldmodel.stale_after_hours': { value: 6, description: 'Hours before world model is stale', min: 1, max: 48, tunable: true },
  'worldmodel.memory_stale_days': { value: 3, description: 'Days before memory is considered stale', min: 1, max: 14, tunable: true },

  // --- Importance scoring ---
  'importance.w_impact': { value: 0.30, description: 'Weight for impact factor', min: 0.1, max: 0.5, tunable: true },
  'importance.w_uniqueness': { value: 0.20, description: 'Weight for uniqueness factor', min: 0.05, max: 0.4, tunable: true },
  'importance.w_relevance': { value: 0.25, description: 'Weight for relevance factor', min: 0.1, max: 0.5, tunable: true },
  'importance.w_user_involvement': { value: 0.15, description: 'Weight for user involvement', min: 0.05, max: 0.3, tunable: true },
  'importance.w_belief_impact': { value: 0.10, description: 'Weight for belief impact', min: 0.02, max: 0.25, tunable: true },

  // --- Context decay multipliers ---
  'context_decay.tools': { value: 1.5, description: 'Decay multiplier for tool knowledge', min: 0.5, max: 3.0, tunable: true },
  'context_decay.values': { value: 0.3, description: 'Decay multiplier for value knowledge', min: 0.1, max: 1.0, tunable: true },
  'context_decay.technical': { value: 1.2, description: 'Decay multiplier for technical knowledge', min: 0.5, max: 2.5, tunable: true },
  'context_decay.workflow': { value: 1.0, description: 'Decay multiplier for workflow knowledge', min: 0.3, max: 2.0, tunable: true },
  'context_decay.constraint': { value: 0.5, description: 'Decay multiplier for constraints', min: 0.1, max: 1.5, tunable: true },

  // --- Session tracking ---
  'session.active_threshold_ms': { value: 60000, description: 'Milliseconds for active engagement', min: 10000, max: 300000, tunable: true },
  'session.sporadic_threshold_ms': { value: 300000, description: 'Milliseconds for sporadic engagement', min: 60000, max: 900000, tunable: true },
  'session.high_load_length': { value: 500, description: 'Avg message length indicating high load', min: 100, max: 2000, tunable: true },
  'session.medium_load_length': { value: 100, description: 'Avg message length indicating medium load', min: 30, max: 500, tunable: true },

  // --- LLM ---
  'llm.max_tokens_recognition': { value: 1024, description: 'Max tokens for intention recognition', min: 256, max: 4096, tunable: false },
  'llm.max_tokens_extraction': { value: 1024, description: 'Max tokens for knowledge extraction', min: 256, max: 4096, tunable: false },
  'llm.max_tokens_deliberation': { value: 1024, description: 'Max tokens for deliberation', min: 256, max: 4096, tunable: false },

  // --- Query limits ---
  'query.episode_limit': { value: 30, description: 'Limit for episode queries in procedure extraction', min: 5, max: 100, tunable: false },
  'query.procedure_limit': { value: 5, description: 'Limit for procedure search results', min: 1, max: 20, tunable: false },
  'query.causal_decision_limit': { value: 100, description: 'Limit for policy decisions in causal graph', min: 10, max: 500, tunable: false },
  'query.embeddings_fallback_limit': { value: 500, description: 'Limit for brute-force embedding fallback', min: 50, max: 2000, tunable: false },

  // --- Kernel: spreading activation ---
  'kernel.activation_boost': { value: 0.15, description: 'Weight boost when trace reactivated', min: 0.01, max: 0.5, tunable: true },
  'kernel.spread_factor': { value: 0.3, description: 'Activation spread to neighbors', min: 0.05, max: 0.8, tunable: true },
  'kernel.inhibition_factor': { value: 0.2, description: 'Inhibition spread to opponents', min: 0.05, max: 0.6, tunable: true },
  'kernel.freshness_decay': { value: 0.02, description: 'Freshness decay per cycle', min: 0.001, max: 0.1, tunable: true },
  'kernel.archive_threshold': { value: 0.01, description: 'weight*freshness below this → archive', min: 0.001, max: 0.1, tunable: true },

  // --- Kernel: commit & stabilization ---
  'kernel.convergence_threshold': { value: 0.4, description: 'Min convergence score for commit', min: 0.1, max: 0.9, tunable: true },
  'kernel.escalation_threshold': { value: 0.9, description: 'Single-agent urgency for escalation commit', min: 0.7, max: 1.0, tunable: true },
  'kernel.pain_escalation_threshold': { value: 0.4, description: 'Pain intensity for affect escalation signal', min: 0.1, max: 0.9, tunable: true },
  'kernel.stress_hormone_threshold': { value: 0.6, description: 'Cortisol level for stress signal', min: 0.3, max: 0.9, tunable: true },
  'kernel.reward_hormone_threshold': { value: 0.6, description: 'Dopamine level for reward signal', min: 0.3, max: 0.9, tunable: true },
  'kernel.energy_stable_threshold': { value: 0.1, description: 'Energy below this = converged', min: 0.01, max: 0.5, tunable: true },
  'kernel.max_iterations': { value: 12, description: 'Hard ceiling on kernel cycles', min: 3, max: 50, tunable: true },
  'kernel.hallucination_cycles': { value: 3, description: 'Cycles without orthogonal signals → stop', min: 1, max: 10, tunable: true },
  'kernel.energy_w_novelty': { value: 0.4, description: 'Novelty weight in energy computation', min: 0.1, max: 0.8, tunable: true },
  'kernel.energy_w_pred_error': { value: 0.3, description: 'Prediction error weight in energy', min: 0.1, max: 0.8, tunable: true },
  'kernel.energy_w_urgency': { value: 0.3, description: 'Urgency weight in energy', min: 0.1, max: 0.8, tunable: true },
  'kernel.attention_window': { value: 20, description: 'Commits in working memory', min: 5, max: 100, tunable: true },

  // --- Kernel: graph learning ---
  'kernel.hebbian_learning_rate': { value: 0.05, description: 'Hebbian co-activation learning rate', min: 0.001, max: 0.2, tunable: true },
  'kernel.hebbian_decay_rate': { value: 0.02, description: 'Anti-Hebbian decay for inactive edges', min: 0.001, max: 0.1, tunable: true },
  'kernel.reinforcement_rate': { value: 0.1, description: 'Outcome reinforcement strength', min: 0.01, max: 0.5, tunable: true },
  'kernel.pred_error_backprop_rate': { value: 0.08, description: 'Prediction error backprop through edges', min: 0.01, max: 0.3, tunable: true },

  // --- Kernel: time-sense ---
  'kernel.dilation_novelty_w': { value: 0.7, description: 'Novelty weight in time dilation', min: 0.1, max: 2.0, tunable: true },
  'kernel.dilation_pred_error_w': { value: 0.5, description: 'Pred error weight in time dilation', min: 0.1, max: 2.0, tunable: true },
  'kernel.dilation_tempo_w': { value: 0.2, description: 'Tempo weight in time dilation', min: 0.0, max: 1.0, tunable: true },

  // --- Kernel: LLM budget per think() ---
  'kernel.llm_budget_per_think': { value: 8, description: 'Max LLM calls per think() invocation', min: 1, max: 30, tunable: true },

  // --- Kernel: concept space ---
  'kernel.conflict_radius': { value: 2.0, description: 'Max distance for conflict detection', min: 0.5, max: 10, tunable: true },
  'kernel.conflict_min_weight': { value: 0.3, description: 'Min trace weight for conflict candidacy', min: 0.1, max: 0.8, tunable: true },
  'kernel.separation_threshold': { value: 0.5, description: 'Min separation along dimension to resolve conflict', min: 0.1, max: 3, tunable: true },

  // --- Kernel: sleep & timeout ---
  'kernel.sleep_max_ms': { value: 2000, description: 'Max idle sleep duration', min: 100, max: 10000, tunable: true },
  'kernel.sleep_min_ms': { value: 50, description: 'Min idle sleep duration', min: 10, max: 500, tunable: true },
  'kernel.learning_sleep_ms': { value: 500, description: 'Sleep between learning cycles', min: 100, max: 5000, tunable: true },
  'kernel.think_timeout_ms': { value: 60000, description: 'Max wait time for think() result', min: 5000, max: 300000, tunable: false },

  // --- Kernel: learning phases ---
  'kernel.learning_phase_early': { value: 3, description: 'Cycle count threshold for early learning phase (fundamentals)', min: 1, max: 20, tunable: true },
  'kernel.learning_phase_mid': { value: 8, description: 'Cycle count threshold for mid learning phase (depth + connections)', min: 2, max: 50, tunable: true },

  // --- Sensory agent ---
  'sensory.bootstrap_confidence': { value: 0.95, description: 'Confidence when no active traces exist (bootstrap)', min: 0.5, max: 1.0, tunable: true },
  'sensory.default_confidence': { value: 0.8, description: 'Default sensory perception confidence', min: 0.3, max: 1.0, tunable: true },
  'sensory.novelty_signal_threshold': { value: 0.6, description: 'Novelty above this marks input as novel', min: 0.2, max: 0.95, tunable: true },
  'sensory.novelty_slow_path_threshold': { value: 0.8, description: 'Novelty above this triggers LLM slow-path extraction', min: 0.5, max: 1.0, tunable: true },
  'sensory.change_detection_threshold': { value: 0.05, description: 'Min trace weight delta to count as changed', min: 0.01, max: 0.2, tunable: true },

  // --- Predictive agent ---
  'predictive.error_threshold': { value: 0.15, description: 'Prediction error threshold for signaling', min: 0.05, max: 0.5, tunable: true },
  'predictive.confidence_max': { value: 0.8, description: 'Max confidence for prediction error signals', min: 0.5, max: 1.0, tunable: true },
  'predictive.confidence_base': { value: 0.3, description: 'Base confidence added to prediction error magnitude', min: 0.1, max: 0.7, tunable: true },
  'predictive.voi_threshold': { value: 0.1, description: 'Min value-of-information to signal', min: 0.01, max: 0.5, tunable: true },

  // --- Raw stream (cross-modal binding) ---
  'sensory.binding_window': { value: 3, description: 'Cross-modal binding window in cycles', min: 1, max: 10, tunable: true },
  'sensory.binding_weight': { value: 0.3, description: 'Edge weight for cross-modal binding links', min: 0.05, max: 0.8, tunable: true },

  // --- Modality discovery ---
  'sensory.novelty_threshold': { value: 0.4, description: 'Fingerprint distance above this births a new modality', min: 0.1, max: 1.0, tunable: true },

  // --- Affective state ---
  'affect.accumulator_decay_rate': { value: 0.03, description: 'Accumulator decay rate per cycle', min: 0.005, max: 0.1, tunable: true },
  'affect.config_delta_max': { value: 0.02, description: 'Max config delta per affect step (tanh scale)', min: 0.005, max: 0.1, tunable: true },
  'affect.mode_boundary_positive': { value: 0.5, description: 'Loss threshold for defensive mode', min: 0.1, max: 2.0, tunable: true },
  'affect.mode_boundary_negative': { value: -0.5, description: 'Loss threshold for explore mode', min: -2.0, max: -0.1, tunable: true },

  // --- Sensorimotor predictor ---
  'predictor.beta_kl': { value: 0.1, description: 'KL divergence weight in free energy loss', min: 0.01, max: 1.0, tunable: true },
};

@Injectable()
export class CognitiveConfigService implements OnModuleInit {
  private readonly logger = new Logger(CognitiveConfigService.name);
  private cache = new Map<string, number>();

  constructor(private readonly db: SurrealService) {}

  async onModuleInit(): Promise<void> {
    await this.loadAll();
  }

  /**
   * Get a parameter value. Returns from memory cache (fast).
   */
  get(key: string): number {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;
    const def = DEFAULTS[key];
    return def ? def.value : 0;
  }

  /**
   * Set a parameter value at runtime. Persists to DB.
   */
  async set(key: string, value: number, reason?: string): Promise<Result<void, DomainError>> {
    const def = DEFAULTS[key];
    if (!def) return err({ code: 'VALIDATION_ERROR', message: `Unknown config key: ${key}`, name: 'ValidationError' } as DomainError);

    // Clamp to bounds
    const clamped = Math.max(def.min, Math.min(def.max, value));
    this.cache.set(key, clamped);

    await this.db.execute(
      `UPSERT cognitive_config SET key = $key, value = $value, description = $desc, min_val = $min, max_val = $max, tunable = $tunable, last_adjusted = time::now(), adjustment_reason = $reason WHERE key = $key`,
      { key, value: clamped, desc: def.description, min: def.min, max: def.max, tunable: def.tunable, reason: reason || 'manual' },
    );

    this.logger.log(`Config ${key}: ${clamped} (${reason || 'manual'})`);
    return ok(undefined);
  }

  /**
   * Adjust a parameter by delta (for learning loop).
   * Respects min/max bounds and tunable flag.
   */
  async adjust(key: string, delta: number, reason: string): Promise<Result<number, DomainError>> {
    const def = DEFAULTS[key];
    if (!def || !def.tunable) return err({ code: 'VALIDATION_ERROR', message: `${key} is not tunable`, name: 'ValidationError' } as DomainError);

    const current = this.get(key);
    const newValue = Math.max(def.min, Math.min(def.max, current + delta));
    await this.set(key, newValue, reason);
    return ok(newValue);
  }

  /**
   * Adjust parameters based on accuracy feedback.
   * Called by calibration service after measuring prediction accuracy.
   */
  async adjustFromFeedback(feedback: {
    similarity_false_positives?: number; // too many false matches → increase threshold
    similarity_false_negatives?: number; // too many missed matches → decrease threshold
    decay_too_fast?: boolean;            // beliefs dying before they should
    decay_too_slow?: boolean;            // stale beliefs persisting
    overconfident?: boolean;             // predictions too confident
    underconfident?: boolean;            // predictions too cautious
  }): Promise<void> {
    const STEP = 0.02;

    if (feedback.similarity_false_positives && feedback.similarity_false_positives > 3) {
      await this.adjust('similarity.belief_match', STEP, `${feedback.similarity_false_positives} false positives`);
      await this.adjust('similarity.knowledge_match', STEP, `false positive reduction`);
    }
    if (feedback.similarity_false_negatives && feedback.similarity_false_negatives > 3) {
      await this.adjust('similarity.belief_match', -STEP, `${feedback.similarity_false_negatives} false negatives`);
      await this.adjust('similarity.knowledge_match', -STEP, `false negative reduction`);
    }
    if (feedback.decay_too_fast) {
      await this.adjust('decay.rate_normal', -0.002, 'beliefs decaying too fast');
      await this.adjust('decay.rate_fast', -0.003, 'beliefs decaying too fast');
    }
    if (feedback.decay_too_slow) {
      await this.adjust('decay.rate_normal', 0.002, 'stale beliefs persisting');
      await this.adjust('decay.rate_fast', 0.003, 'stale beliefs persisting');
    }
    if (feedback.overconfident) {
      await this.adjust('bayesian.learning_rate', -0.03, 'overconfident predictions');
      await this.adjust('bayesian.reinforcement_boost_cap', -0.01, 'overconfident');
    }
    if (feedback.underconfident) {
      await this.adjust('bayesian.learning_rate', 0.03, 'underconfident predictions');
      await this.adjust('bayesian.reinforcement_boost_cap', 0.01, 'underconfident');
    }
  }

  /**
   * Get all parameters with metadata (for API/dashboard).
   */
  getAll(): Array<CognitiveParam> {
    return Object.entries(DEFAULTS).map(([key, def]) => ({
      key,
      ...def,
      value: this.cache.get(key) ?? def.value,
    }));
  }

  /**
   * Load all parameters from DB into memory cache.
   */
  private async loadAll(): Promise<void> {
    // Initialize defaults into cache
    for (const [key, def] of Object.entries(DEFAULTS)) {
      this.cache.set(key, def.value);
    }

    // Override with DB values
    const result = await this.db.query<{ key: string; value: number }>('SELECT key, value FROM cognitive_config');
    if (result.isOk()) {
      for (const row of result.value) {
        if (row.key && row.value !== undefined) {
          this.cache.set(row.key, row.value);
        }
      }
      this.logger.log(`Loaded ${result.value.length} cognitive config overrides from DB`);
    }
  }
}
