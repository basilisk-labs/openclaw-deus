import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../database/surreal.service';
import { TraceGraphService } from './memory/trace-graph.service';
import { ConceptSpaceService } from './space/concept-space.service';
import { ModalityDiscoveryService } from './sensory/modality-discovery.service';
import { AffectiveStateService } from './affect/affective-state.service';
import { EnergyService } from './energy.service';
import { CommitKernelService } from './commit/commit-kernel.service';
import { CognitiveConfigService } from '../cognitive/cognitive-config.service';

/**
 * DevelopmentalMetricsService: Observe the whole entity as it LIVES.
 *
 * Not just "does it learn shapes" — how does it DEVELOP?
 * Is it curious? Is it happy? Is it becoming more autonomous?
 *
 * 5 metric domains:
 *   1. COGNITIVE — how the mind grows
 *   2. VITALITY — energy economy
 *   3. AFFECT — emotional development
 *   4. AGENCY — autonomy development
 *   5. WORLD MODEL — understanding quality
 *
 * Plus developmental stage detection (emergent, not hardcoded).
 */

export type DevelopmentalStage = 'sensory' | 'categorical' | 'predictive' | 'agentic' | 'reflective';

export interface CognitiveDevelopment {
  dimension_growth_rate: number;
  abstraction_count: number;
  schema_complexity: number;
  concept_space_coverage: number;
  knowledge_retention: number;
  cross_modal_binding_strength: number;
}

export interface VitalityMetrics {
  sleep_regularity: number;
  energy_efficiency: number;
  recovery_quality: number;
  fatigue_resilience: number;
  exploration_budget: number;
}

export interface AffectTrajectory {
  valence_trend: number;
  cortisol_baseline: number;
  curiosity_sustain: number;
  pain_resolution_rate: number;
  emotional_range: number;
  mode_diversity: number;
}

export interface AgencyMetrics {
  action_diversity: number;
  target_novelty_preference: number;
  explore_exploit_shift: number;
  help_seeking_frequency: number;
  prediction_action_coupling: number;
  consequence_learning: number;
}

export interface WorldModelQuality {
  object_coverage: number;
  property_accuracy: number;
  generalization_rate: number;
  prediction_precision: number;
  causal_understanding: number;
  physics_model: number;
}

export interface DevelopmentalSnapshot {
  tick: number;
  stage: DevelopmentalStage;
  stage_confidence: number;
  cognitive: CognitiveDevelopment;
  vitality: VitalityMetrics;
  affect: AffectTrajectory;
  agency: AgencyMetrics;
  world_model: WorldModelQuality;
  overall_health: number;
}

@Injectable()
export class DevelopmentalMetricsService {
  private readonly logger = new Logger(DevelopmentalMetricsService.name);

  // History for trend computation
  private snapshots: DevelopmentalSnapshot[] = [];
  private sleepCycles: number[] = [];
  private actionLog: Array<{ action: string; target: string; tick: number; wasExploration: boolean }> = [];
  private helpRequests: number[] = [];
  private painOnsets: Array<{ tick: number; resolved_at?: number }> = [];
  private lastDimensionCount = 0;
  private lastDimensionTick = 0;
  private accuracyHistory: Array<{ tick: number; accuracy: number }> = [];

  constructor(
    private readonly db: SurrealService,
    private readonly traceGraph: TraceGraphService,
    private readonly conceptSpace: ConceptSpaceService,
    private readonly modalities: ModalityDiscoveryService,
    private readonly affect: AffectiveStateService,
    private readonly energy: EnergyService,
    private readonly commitKernel: CommitKernelService,
    private readonly config: CognitiveConfigService,
  ) {}

  /**
   * Record an action for agency metrics.
   */
  recordAction(action: string, target: string, tick: number, wasExploration: boolean): void {
    this.actionLog.push({ action, target, tick, wasExploration });
  }

  /**
   * Record a sleep event for vitality metrics.
   */
  recordSleep(tick: number): void {
    this.sleepCycles.push(tick);
  }

  /**
   * Record a help request for agency metrics.
   */
  recordHelpRequest(tick: number): void {
    this.helpRequests.push(tick);
  }

  /**
   * Record pain onset/resolution for affect metrics.
   */
  recordPainOnset(tick: number): void {
    this.painOnsets.push({ tick });
  }

  recordPainResolution(tick: number): void {
    const unresolved = this.painOnsets.find(p => !p.resolved_at);
    if (unresolved) unresolved.resolved_at = tick;
  }

  /**
   * Record world model accuracy for tracking over time.
   */
  recordAccuracy(tick: number, accuracy: number): void {
    this.accuracyHistory.push({ tick, accuracy });
  }

  /**
   * Full developmental snapshot — observe the whole entity.
   */
  async snapshot(tick: number): Promise<DevelopmentalSnapshot> {
    const [cognitive, vitality, affectMetrics, agency, worldModel] = await Promise.all([
      this.computeCognitive(tick),
      this.computeVitality(tick),
      this.computeAffect(tick),
      this.computeAgency(tick),
      this.computeWorldModel(),
    ]);

    const stage = this.detectStage(cognitive, affectMetrics, agency, worldModel);
    const overall = this.computeOverallHealth(cognitive, vitality, affectMetrics, agency, worldModel);

    const snap: DevelopmentalSnapshot = {
      tick,
      stage: stage.stage,
      stage_confidence: stage.confidence,
      cognitive,
      vitality,
      affect: affectMetrics,
      agency,
      world_model: worldModel,
      overall_health: overall,
    };

    this.snapshots.push(snap);
    return snap;
  }

  /**
   * Get all historical snapshots.
   */
  getHistory(): DevelopmentalSnapshot[] {
    return this.snapshots;
  }

  /**
   * Get the most recent snapshot.
   */
  getLatest(): DevelopmentalSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  // ═══════════════════════════════════════════
  // COGNITIVE DEVELOPMENT
  // ═══════════════════════════════════════════

  private async computeCognitive(tick: number): Promise<CognitiveDevelopment> {
    const dimCount = this.conceptSpace.getDimensionCount();

    // Dimension growth rate: dims[t] - dims[t-N] / N
    const windowTicks = 50;
    const rate = tick > 0
      ? (dimCount - this.lastDimensionCount) / Math.max(1, tick - this.lastDimensionTick)
      : 0;
    if (tick - this.lastDimensionTick >= windowTicks) {
      this.lastDimensionCount = dimCount;
      this.lastDimensionTick = tick;
    }

    // Abstraction count: traces with [ABSTRACT] or [PROPERTY] in content
    const abstractResult = await this.db.query<{ count: number }>(
      `SELECT count() AS count FROM trace WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]') AND archived = false GROUP ALL`,
    );
    const abstractionCount = abstractResult.isOk() && abstractResult.value.length > 0
      ? (abstractResult.value[0].count ?? 0) : 0;

    // Schema complexity: max co-activation count across edges
    const schemaResult = await this.db.query<{ max_weight: number }>(
      `SELECT math::max(weight) AS max_weight FROM activates GROUP ALL`,
    );
    const schemaComplexity = schemaResult.isOk() && schemaResult.value.length > 0
      ? (schemaResult.value[0].max_weight ?? 0) : 0;

    // Concept space coverage: unique clusters / total dimensions
    const clusters = await this.conceptSpace.findClusters(2, 0.5);
    const coverage = dimCount > 0 ? Math.min(1, clusters.length / dimCount) : 0;

    // Knowledge retention: active / total traces
    const totalResult = await this.db.query<{ total: number; active: number }>(
      `SELECT count() AS total, count(archived = false) AS active FROM trace GROUP ALL`,
    );
    let retention = 1;
    if (totalResult.isOk() && totalResult.value.length > 0) {
      const { total, active } = totalResult.value[0];
      retention = total > 0 ? active / total : 1;
    }

    // Cross-modal binding: avg edge weight between traces from different modalities
    const crossModalResult = await this.db.query<{ avg_w: number }>(
      `SELECT math::mean(weight) AS avg_w FROM activates GROUP ALL`,
    );
    const crossModal = crossModalResult.isOk() && crossModalResult.value.length > 0
      ? (crossModalResult.value[0].avg_w ?? 0) : 0;

    return {
      dimension_growth_rate: Math.round(rate * 1000) / 1000,
      abstraction_count: abstractionCount,
      schema_complexity: Math.round(schemaComplexity * 100) / 100,
      concept_space_coverage: Math.round(coverage * 100) / 100,
      knowledge_retention: Math.round(retention * 100) / 100,
      cross_modal_binding_strength: Math.round(crossModal * 100) / 100,
    };
  }

  // ═══════════════════════════════════════════
  // VITALITY
  // ═══════════════════════════════════════════

  private computeVitality(tick: number): VitalityMetrics {
    const energyState = this.energy.getState();

    // Sleep regularity: std deviation of cycles between sleeps
    let sleepRegularity = 0;
    if (this.sleepCycles.length >= 2) {
      const gaps: number[] = [];
      for (let i = 1; i < this.sleepCycles.length; i++) {
        gaps.push(this.sleepCycles[i] - this.sleepCycles[i - 1]);
      }
      const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
      const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
      // Invert: lower variance = more regular = higher score
      sleepRegularity = Math.max(0, 1 - Math.sqrt(variance) / Math.max(1, mean));
    }

    // Energy efficiency: accuracy improvement / energy spent
    let energyEfficiency = 0;
    if (this.accuracyHistory.length >= 2 && energyState.total_energy_spent > 0) {
      const first = this.accuracyHistory[0].accuracy;
      const last = this.accuracyHistory[this.accuracyHistory.length - 1].accuracy;
      energyEfficiency = Math.max(0, (last - first)) / energyState.total_energy_spent;
    }

    // Recovery quality: how well energy recovers after sleep
    const recoveryQuality = energyState.max > 0 ? energyState.current / energyState.max : 0;

    // Fatigue resilience: how many ticks before needsSleep
    const fatigueResilience = Math.max(0, 1 - energyState.fatigue_level);

    // Exploration budget: exploration actions / total actions
    const recentActions = this.actionLog.slice(-100);
    const explorationBudget = recentActions.length > 0
      ? recentActions.filter(a => a.wasExploration).length / recentActions.length
      : 0;

    return {
      sleep_regularity: Math.round(sleepRegularity * 100) / 100,
      energy_efficiency: Math.round(energyEfficiency * 1000) / 1000,
      recovery_quality: Math.round(recoveryQuality * 100) / 100,
      fatigue_resilience: Math.round(fatigueResilience * 100) / 100,
      exploration_budget: Math.round(explorationBudget * 100) / 100,
    };
  }

  // ═══════════════════════════════════════════
  // AFFECT TRAJECTORY
  // ═══════════════════════════════════════════

  private computeAffect(tick: number): AffectTrajectory {
    const affectSnap = this.affect.getSnapshot();

    // Valence trend: linear regression on recent valence values
    const recentSnaps = this.snapshots.slice(-20);
    let valenceTrend = 0;
    if (recentSnaps.length >= 3) {
      // Simple slope: (last - first) / n
      const first = recentSnaps[0].affect.valence_trend !== undefined
        ? recentSnaps[0].affect.valence_trend : affectSnap.valence;
      valenceTrend = (affectSnap.valence - first) / recentSnaps.length;
    }

    // Cortisol baseline: from hormones
    const cortisol = affectSnap.hormones?.cortisol ?? 0;

    // Curiosity sustain: ratio of exploration actions that persist
    const recentActions = this.actionLog.slice(-50);
    const curiositySustain = recentActions.length > 0
      ? recentActions.filter(a => a.wasExploration).length / recentActions.length
      : 0;

    // Pain resolution rate: avg cycles from onset to resolution
    const resolvedPains = this.painOnsets.filter(p => p.resolved_at);
    const painResolutionRate = resolvedPains.length > 0
      ? resolvedPains.reduce((s, p) => s + (p.resolved_at! - p.tick), 0) / resolvedPains.length
      : Infinity;
    // Invert: faster resolution = higher score
    const painScore = painResolutionRate === Infinity ? 0
      : Math.max(0, 1 - painResolutionRate / 100);

    // Emotional range: max-min valence over recent snapshots
    let emotionalRange = 0;
    if (recentSnaps.length >= 2) {
      const valences = recentSnaps.map(s => s.affect.valence_trend);
      emotionalRange = Math.max(...valences) - Math.min(...valences);
    }

    // Mode diversity: entropy of affect mode distribution
    const modes = affectSnap.mode_probabilities ?? {};
    let modeEntropy = 0;
    const modeValues = Object.values(modes).filter(v => v > 0);
    for (const p of modeValues) {
      modeEntropy -= p * Math.log2(p);
    }
    // Normalize: max entropy for N modes = log2(N)
    const maxEntropy = modeValues.length > 0 ? Math.log2(modeValues.length) : 1;
    const modeDiversity = maxEntropy > 0 ? modeEntropy / maxEntropy : 0;

    return {
      valence_trend: Math.round(valenceTrend * 1000) / 1000,
      cortisol_baseline: Math.round(cortisol * 100) / 100,
      curiosity_sustain: Math.round(curiositySustain * 100) / 100,
      pain_resolution_rate: Math.round(painScore * 100) / 100,
      emotional_range: Math.round(emotionalRange * 100) / 100,
      mode_diversity: Math.round(modeDiversity * 100) / 100,
    };
  }

  // ═══════════════════════════════════════════
  // AGENCY
  // ═══════════════════════════════════════════

  private computeAgency(tick: number): AgencyMetrics {
    const recentActions = this.actionLog.slice(-100);
    const allActions = this.actionLog;

    // Action diversity: unique actions / total
    const uniqueActions = new Set(recentActions.map(a => a.action));
    const actionDiversity = recentActions.length > 0
      ? uniqueActions.size / Math.min(6, recentActions.length)  // 6 possible actions
      : 0;

    // Target novelty preference: novel targets / total
    const seenTargets = new Set<string>();
    let novelTargets = 0;
    for (const a of recentActions) {
      if (!seenTargets.has(a.target)) {
        novelTargets++;
        seenTargets.add(a.target);
      }
    }
    const targetNovelty = recentActions.length > 0 ? novelTargets / recentActions.length : 0;

    // Explore→exploit shift: exploration ratio should decrease over time
    const firstHalf = allActions.slice(0, Math.floor(allActions.length / 2));
    const secondHalf = allActions.slice(Math.floor(allActions.length / 2));
    const firstExplore = firstHalf.length > 0
      ? firstHalf.filter(a => a.wasExploration).length / firstHalf.length : 0;
    const secondExplore = secondHalf.length > 0
      ? secondHalf.filter(a => a.wasExploration).length / secondHalf.length : 0;
    // Positive means shifting to exploitation (maturing)
    const exploreExploitShift = firstHalf.length > 0 ? firstExplore - secondExplore : 0;

    // Help-seeking frequency: help requests / total ticks (should decrease)
    const recentHelp = this.helpRequests.filter(h => h > tick - 100);
    const helpFrequency = Math.min(1, recentHelp.length / 100);

    // Prediction-action coupling: how often actions follow prediction signals
    // Approximated by: actions in the recent window / (predictions * 0.5 baseline)
    const predictionActionCoupling = recentActions.length > 0 ? Math.min(1, recentActions.length / 50) : 0;

    // Consequence learning: repeated negative outcomes should decrease
    // Track repeat actions on same targets that previously caused pain
    const consequenceLearning = this.computeConsequenceLearning();

    return {
      action_diversity: Math.round(Math.min(1, actionDiversity) * 100) / 100,
      target_novelty_preference: Math.round(targetNovelty * 100) / 100,
      explore_exploit_shift: Math.round(exploreExploitShift * 100) / 100,
      help_seeking_frequency: Math.round(helpFrequency * 100) / 100,
      prediction_action_coupling: Math.round(predictionActionCoupling * 100) / 100,
      consequence_learning: Math.round(consequenceLearning * 100) / 100,
    };
  }

  private computeConsequenceLearning(): number {
    // If we have pain events, check if the same action-target pairs are repeated after pain
    if (this.painOnsets.length === 0 || this.actionLog.length < 10) return 0.5;

    // Simple proxy: ratio of unique action-target pairs increases over time = learning
    const first = this.actionLog.slice(0, Math.floor(this.actionLog.length / 2));
    const second = this.actionLog.slice(Math.floor(this.actionLog.length / 2));

    const firstUnique = new Set(first.map(a => `${a.action}:${a.target}`)).size;
    const secondUnique = new Set(second.map(a => `${a.action}:${a.target}`)).size;

    const firstRatio = first.length > 0 ? firstUnique / first.length : 0;
    const secondRatio = second.length > 0 ? secondUnique / second.length : 0;

    // Higher uniqueness in second half means less repetition = learned from consequences
    return Math.min(1, 0.5 + (secondRatio - firstRatio));
  }

  // ═══════════════════════════════════════════
  // WORLD MODEL QUALITY
  // ═══════════════════════════════════════════

  private async computeWorldModel(): Promise<WorldModelQuality> {
    // Object coverage: objects with traces / total known objects
    const objectsResult = await this.db.query<{ count: number }>(
      `SELECT count() AS count FROM trace WHERE source_type = 'event' AND archived = false GROUP ALL`,
    );
    const objectTraces = objectsResult.isOk() && objectsResult.value.length > 0
      ? objectsResult.value[0].count ?? 0 : 0;
    // Rough: each object should have ~3 traces
    const objectCoverage = Math.min(1, objectTraces / 30);

    // Property accuracy: from accuracy history
    const propertyAccuracy = this.accuracyHistory.length > 0
      ? this.accuracyHistory[this.accuracyHistory.length - 1].accuracy
      : 0;

    // Generalization rate: abstractions / (objects seen)
    const abstractResult = await this.db.query<{ count: number }>(
      `SELECT count() AS count FROM trace WHERE (content CONTAINS '[ABSTRACT]' OR content CONTAINS '[PROPERTY]') AND archived = false GROUP ALL`,
    );
    const abstractions = abstractResult.isOk() && abstractResult.value.length > 0
      ? abstractResult.value[0].count ?? 0 : 0;
    const generalization = objectTraces > 0 ? Math.min(1, abstractions / (objectTraces * 0.1)) : 0;

    // Prediction precision: from commit history (prediction errors should decrease)
    const predRows = await this.db.query<{ prediction_error: number }>(
      `SELECT prediction_error FROM commit_log WHERE prediction_error IS NOT NONE LIMIT 20`,
    );
    const avgPredErr = predRows.isOk() && predRows.value.length > 0
      ? predRows.value.reduce((s, r) => s + (r.prediction_error || 0), 0) / predRows.value.length
      : 0.5;
    const predictionPrecision = Math.max(0, 1 - avgPredErr);

    // Causal understanding: trajectories with confidence > 0.5
    const snapshot = await this.conceptSpace.snapshot();
    const causalTrajectories = snapshot.trajectories.filter(t => t.confidence > 0.5);
    const causalUnderstanding = Math.min(1, causalTrajectories.length / 10);

    // Physics model: cross-modal correlations (round→rolls type)
    const crossModalEdges = await this.db.query<{ count: number }>(
      `SELECT count() AS count FROM activates WHERE weight > 0.5 GROUP ALL`,
    );
    const strongEdges = crossModalEdges.isOk() && crossModalEdges.value.length > 0
      ? crossModalEdges.value[0].count ?? 0 : 0;
    const physicsModel = Math.min(1, strongEdges / 20);

    return {
      object_coverage: Math.round(objectCoverage * 100) / 100,
      property_accuracy: Math.round(propertyAccuracy * 100) / 100,
      generalization_rate: Math.round(generalization * 100) / 100,
      prediction_precision: Math.round(predictionPrecision * 100) / 100,
      causal_understanding: Math.round(causalUnderstanding * 100) / 100,
      physics_model: Math.round(physicsModel * 100) / 100,
    };
  }

  // ═══════════════════════════════════════════
  // DEVELOPMENTAL STAGE DETECTION
  // ═══════════════════════════════════════════

  private detectStage(
    cognitive: CognitiveDevelopment,
    affect: AffectTrajectory,
    agency: AgencyMetrics,
    worldModel: WorldModelQuality,
  ): { stage: DevelopmentalStage; confidence: number } {
    // Score each stage independently; highest wins
    const scores: Record<DevelopmentalStage, number> = {
      sensory: 0,
      categorical: 0,
      predictive: 0,
      agentic: 0,
      reflective: 0,
    };

    // SENSORY: high dimension growth, low accuracy
    scores.sensory = cognitive.dimension_growth_rate * 5 + (1 - worldModel.property_accuracy) * 0.5;

    // CATEGORICAL: abstractions emerging, accuracy rising
    scores.categorical = Math.min(1, cognitive.abstraction_count / 5) * 0.6
      + worldModel.property_accuracy * 0.4;

    // PREDICTIVE: trajectories forming, prediction improving
    scores.predictive = worldModel.prediction_precision * 0.5
      + worldModel.causal_understanding * 0.5;

    // AGENTIC: explore→exploit shift, less help-seeking
    scores.agentic = Math.max(0, agency.explore_exploit_shift) * 0.5
      + (1 - agency.help_seeking_frequency) * 0.3
      + agency.action_diversity * 0.2;

    // REFLECTIVE: self-traces, mode diversity, wide emotional range
    scores.reflective = affect.mode_diversity * 0.4
      + affect.emotional_range * 0.3
      + agency.consequence_learning * 0.3;

    // Find dominant stage (stages are progressive — weight by progression)
    const stageOrder: DevelopmentalStage[] = ['sensory', 'categorical', 'predictive', 'agentic', 'reflective'];
    let bestStage: DevelopmentalStage = 'sensory';
    let bestScore = -1;

    for (const stage of stageOrder) {
      // A later stage needs to clearly beat the earlier one
      const progressionBonus = stageOrder.indexOf(stage) * 0.05;
      const effective = scores[stage] - progressionBonus;
      if (effective > bestScore) {
        bestScore = effective;
        bestStage = stage;
      }
    }

    return { stage: bestStage, confidence: Math.round(Math.min(1, Math.max(0, bestScore)) * 100) / 100 };
  }

  // ═══════════════════════════════════════════
  // OVERALL HEALTH
  // ═══════════════════════════════════════════

  private computeOverallHealth(
    cognitive: CognitiveDevelopment,
    vitality: VitalityMetrics,
    affect: AffectTrajectory,
    agency: AgencyMetrics,
    worldModel: WorldModelQuality,
  ): number {
    // Weighted average across all 5 domains
    const cogScore = (
      cognitive.concept_space_coverage * 0.3 +
      cognitive.knowledge_retention * 0.3 +
      Math.min(1, cognitive.abstraction_count / 10) * 0.2 +
      cognitive.cross_modal_binding_strength * 0.2
    );

    const vitScore = (
      vitality.sleep_regularity * 0.2 +
      vitality.recovery_quality * 0.3 +
      vitality.fatigue_resilience * 0.3 +
      vitality.exploration_budget * 0.2
    );

    const affScore = (
      Math.max(0, 0.5 + affect.valence_trend) * 0.2 +
      (1 - affect.cortisol_baseline) * 0.2 +
      affect.curiosity_sustain * 0.2 +
      affect.pain_resolution_rate * 0.2 +
      affect.mode_diversity * 0.2
    );

    const agScore = (
      agency.action_diversity * 0.2 +
      agency.consequence_learning * 0.3 +
      agency.prediction_action_coupling * 0.2 +
      (1 - agency.help_seeking_frequency) * 0.3
    );

    const wmScore = (
      worldModel.object_coverage * 0.2 +
      worldModel.property_accuracy * 0.25 +
      worldModel.prediction_precision * 0.2 +
      worldModel.causal_understanding * 0.2 +
      worldModel.physics_model * 0.15
    );

    const overall = cogScore * 0.25 + vitScore * 0.15 + affScore * 0.15 + agScore * 0.2 + wmScore * 0.25;
    return Math.round(Math.min(1, Math.max(0, overall)) * 100) / 100;
  }

  /**
   * Format snapshot for human-readable display.
   */
  formatSnapshot(snap: DevelopmentalSnapshot): string {
    const lines: string[] = [];
    lines.push(`  Stage: ${snap.stage.toUpperCase()} (confidence=${snap.stage_confidence})`);
    lines.push(`  Overall health: ${(snap.overall_health * 100).toFixed(0)}%`);
    lines.push(`  Cognitive: dims_rate=${snap.cognitive.dimension_growth_rate} abstractions=${snap.cognitive.abstraction_count} coverage=${snap.cognitive.concept_space_coverage} retention=${snap.cognitive.knowledge_retention}`);
    lines.push(`  Vitality: sleep_reg=${snap.vitality.sleep_regularity} efficiency=${snap.vitality.energy_efficiency} resilience=${snap.vitality.fatigue_resilience}`);
    lines.push(`  Affect: valence_trend=${snap.affect.valence_trend} cortisol=${snap.affect.cortisol_baseline} curiosity=${snap.affect.curiosity_sustain} mode_div=${snap.affect.mode_diversity}`);
    lines.push(`  Agency: diversity=${snap.agency.action_diversity} novelty_pref=${snap.agency.target_novelty_preference} exploit_shift=${snap.agency.explore_exploit_shift} help=${snap.agency.help_seeking_frequency}`);
    lines.push(`  World: coverage=${snap.world_model.object_coverage} accuracy=${snap.world_model.property_accuracy} prediction=${snap.world_model.prediction_precision} causal=${snap.world_model.causal_understanding}`);
    return lines.join('\n');
  }
}
