import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { SurrealService } from '../../database/surreal.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';
import { Trace, TraceRelation, Signal } from '../kernel.types';
import { ConceptSpaceService } from '../space/concept-space.service';

/**
 * TraceGraph: Learning memory substrate.
 *
 * Not just storage — a LEARNING system:
 * - Spreading activation with Hebbian weight updates
 * - Prediction error backpropagation through edges
 * - Outcome reinforcement from episodes
 * - Forgetting modulated by emotional charge + reactivation frequency
 */

@Injectable()
export class TraceGraphService {
  private readonly logger = new Logger(TraceGraphService.name);
  private cycle = 0;
  private traceIdCounter = 0;

  // Per-cycle caches — invalidated on tick()
  private activeTracesCache: { cycle: number; traces: Trace[] } | null = null;
  private traceCountCache: { cycle: number; count: number } | null = null;

  constructor(
    private readonly db: SurrealService,
    private readonly config: CognitiveConfigService,
    @Inject(forwardRef(() => ConceptSpaceService))
    private readonly conceptSpace: ConceptSpaceService,
  ) {}

  getCycle(): number { return this.cycle; }
  tick(): number {
    this.activeTracesCache = null;
    this.traceCountCache = null;
    return ++this.cycle;
  }

  // ═══════════════════════════════════════════
  // TRACE CRUD
  // ═══════════════════════════════════════════

  async createTrace(data: {
    source_type: Trace['source_type'];
    source_id?: string;
    content: string;
    initial_weight?: number;
    confidence?: number;
    emotional_charge?: number;
  }): Promise<Result<Trace, DomainError>> {
    // Compute initial position in concept space
    const position = this.conceptSpace
      ? await this.conceptSpace.projectNewTrace(data.content)
      : [];

    const trace: Omit<Trace, 'id'> = {
      trace_id: `T${Date.now()}_${this.traceIdCounter++}`,
      source_type: data.source_type,
      source_id: data.source_id,
      content: data.content,
      weight: data.initial_weight ?? 0.5,
      initial_weight: data.initial_weight ?? 0.5,
      freshness: 1.0,
      confidence: data.confidence ?? 0.5,
      emotional_charge: data.emotional_charge ?? 0,
      reactivation_count: 0,
      last_reactivated_cycle: this.cycle,
      reactivation_history: [this.cycle],
      created_at_cycle: this.cycle,
      position,
      velocity: new Array(position.length).fill(0),
      suppressed: false,
      archived: false,
    };

    return this.db.create<Trace>('trace', trace as unknown as Trace);
  }

  // ═══════════════════════════════════════════
  // SIGNAL INGESTION
  // ═══════════════════════════════════════════

  /**
   * Ingest signals → create/reactivate traces → spreading activation → Hebbian learning.
   * Returns activated trace IDs for convergence detection.
   */
  async ingestSignals(signals: Signal[]): Promise<Result<string[], DomainError>> {
    const activatedTraces: string[] = [];

    for (const signal of signals) {
      // Find existing trace by content OR create new
      const existing = await this.findTraceBySimilarity(signal.content);

      if (existing) {
        await this.reactivate(existing.trace_id, signal.confidence, signal.novelty_cost);
        activatedTraces.push(existing.trace_id);
      } else {
        const result = await this.createTrace({
          source_type: 'signal',
          content: signal.content,
          initial_weight: signal.confidence * 0.8,
          confidence: signal.confidence,
          emotional_charge: signal.type === 'affect' ? (signal.payload.charge as number ?? 0) : 0,
        });
        if (result.isOk()) {
          activatedTraces.push(result.value.trace_id);
          // Link new trace to existing targets
          for (const target of signal.targets) {
            await this.link(result.value.trace_id, target, 'activates', signal.confidence * 0.5);
          }
        }
      }
    }

    // CONFLICT DETECTION → DIMENSION BIRTH
    if (this.conceptSpace && activatedTraces.length > 1) {
      await this.detectAndResolveConflicts(activatedTraces);
    }

    // Auto-create edges between traces created/activated in the same cycle (bootstrap)
    if (activatedTraces.length > 1) {
      for (let i = 0; i < activatedTraces.length; i++) {
        for (let j = i + 1; j < Math.min(activatedTraces.length, i + 4); j++) {
          // Co-occurrence in same cycle → weak activates edge (Hebbian will strengthen if relevant)
          await this.link(activatedTraces[i], activatedTraces[j], 'activates', 0.2);
        }
      }
    }

    // Run spreading activation + Hebbian learning on activated traces
    for (const traceId of activatedTraces) {
      await this.spreadActivation(traceId);
    }

    return ok(activatedTraces);
  }

  // ═══════════════════════════════════════════
  // REACTIVATION
  // ═══════════════════════════════════════════

  async reactivate(traceId: string, confidence: number, _novelty = 0): Promise<void> {
    const boost = this.config.get('kernel.activation_boost');
    const history = await this.getReactivationHistory(traceId);
    const newHistory = [...history, this.cycle].slice(-50);

    // CRITICAL: clamp weight to [0, 1.0] — was accumulating above 1.0
    await this.db.execute(
      `UPDATE trace SET
        weight = math::min([1.0, weight + $boost * (1.0 - weight)]),
        freshness = 1.0,
        confidence = math::min([1.0, math::max([$conf, confidence])]),
        reactivation_count = reactivation_count + 1,
        last_reactivated_cycle = $cycle,
        reactivation_history = $history,
        suppressed = false
      WHERE trace_id = $tid AND weight <= 1.0`,
      { boost, conf: Math.min(1, confidence), cycle: this.cycle, history: newHistory, tid: traceId },
    );

    // Force-clamp any traces that escaped above 1.0
    await this.db.execute(
      `UPDATE trace SET weight = 1.0 WHERE trace_id = $tid AND weight > 1.0`,
      { tid: traceId },
    );
  }

  // ═══════════════════════════════════════════
  // SPREADING ACTIVATION + HEBBIAN LEARNING
  // ═══════════════════════════════════════════

  /**
   * Spreading activation + Hebbian learning via SurrealDB stored procedure.
   * Single DB call instead of N+1 queries. Atomic.
   */
  async spreadActivation(sourceTraceId: string, depth = 0): Promise<void> {
    if (depth > 3) return;

    const result = await this.db.execute(
      `fn::spread_activation($tid, $spread, $inhibit, $hebb_lr, $hebb_decay, $cycle)`,
      {
        tid: sourceTraceId,
        spread: this.config.get('kernel.spread_factor'),
        inhibit: this.config.get('kernel.inhibition_factor'),
        hebb_lr: this.config.get('kernel.hebbian_learning_rate'),
        hebb_decay: this.config.get('kernel.hebbian_decay_rate'),
        cycle: this.cycle,
      },
    );

    // Recurse on heavily activated neighbors (depth-limited)
    if (result.isOk() && depth < 2) {
      const activated = await this.db.query<{ trace_id: string }>(
        `SELECT trace_id FROM trace WHERE last_reactivated_cycle = $cycle AND weight > 0.3 AND archived = false LIMIT 5`,
        { cycle: this.cycle },
      );
      if (activated.isOk()) {
        for (const t of activated.value.slice(0, 3)) {
          if (t.trace_id !== sourceTraceId) {
            await this.spreadActivation(t.trace_id, depth + 1);
          }
        }
      }
    }
  }

  // ═══════════════════════════════════════════
  // PREDICTION ERROR BACKPROPAGATION
  // ═══════════════════════════════════════════

  /**
   * Prediction error backpropagation via SurrealDB stored procedure.
   */
  async backpropagatePredictionError(traceId: string, error: number): Promise<void> {
    if (error < 0.01) return;
    await this.db.execute(
      `fn::backprop_pred_error($tid, $error, $rate)`,
      { tid: traceId, error, rate: this.config.get('kernel.pred_error_backprop_rate') },
    );
  }

  // ═══════════════════════════════════════════
  // OUTCOME REINFORCEMENT
  // ═══════════════════════════════════════════

  /**
   * Outcome reinforcement via SurrealDB stored procedure.
   */
  async reinforceFromOutcome(traceIds: string[], reward: number): Promise<void> {
    await this.db.execute(
      `fn::reinforce_outcome($tids, $reward, $rate)`,
      { tids: traceIds, reward, rate: this.config.get('kernel.reinforcement_rate') },
    );
  }

  // ═══════════════════════════════════════════
  // FORGETTING
  // ═══════════════════════════════════════════

  /**
   * Forgetting via SurrealDB stored procedure — single atomic operation.
   */
  async forget(): Promise<Result<{ decayed: number; archived: number }, DomainError>> {
    const result = await this.db.execute(
      `fn::forget_traces($decay, $threshold)`,
      {
        decay: this.config.get('kernel.freshness_decay'),
        threshold: this.config.get('kernel.archive_threshold'),
      },
    );
    return ok({ decayed: 1, archived: result.isOk() ? ((result.value as Record<string, unknown>)?.archived as number ?? 0) : 0 });
  }

  // ═══════════════════════════════════════════
  // CONVERGENCE DETECTION
  // ═══════════════════════════════════════════

  /**
   * Find convergent clusters: traces activated by signals from MULTIPLE agents.
   * Uses both structural co-reference AND content similarity.
   */
  async findConvergentClusters(recentSignals: Signal[], convergenceThreshold?: number): Promise<Array<{
    traces: string[];
    agents: string[];
    convergence: number;
    avg_urgency: number;
  }>> {
    const threshold = convergenceThreshold ?? this.config.get('kernel.convergence_threshold');

    // Step 1: structural — signals targeting same traces
    const traceAgentMap = new Map<string, Set<string>>();
    const traceUrgencyMap = new Map<string, number[]>();

    for (const signal of recentSignals) {
      for (const target of signal.targets) {
        if (!traceAgentMap.has(target)) traceAgentMap.set(target, new Set());
        traceAgentMap.get(target)!.add(signal.agent_id);
        if (!traceUrgencyMap.has(target)) traceUrgencyMap.set(target, []);
        traceUrgencyMap.get(target)!.push(signal.confidence);
      }
    }

    // Step 2: content similarity — signals from different agents about same topic
    // Group by agent, then cross-compare content
    const byAgent = new Map<string, Signal[]>();
    for (const s of recentSignals) {
      if (!byAgent.has(s.agent_id)) byAgent.set(s.agent_id, []);
      byAgent.get(s.agent_id)!.push(s);
    }

    const agentIds = Array.from(byAgent.keys());
    for (let i = 0; i < agentIds.length; i++) {
      for (let j = i + 1; j < agentIds.length; j++) {
        const signalsA = byAgent.get(agentIds[i])!;
        const signalsB = byAgent.get(agentIds[j])!;

        for (const a of signalsA) {
          for (const b of signalsB) {
            // Convergence via shared targets (graph-based, not text)
            const sharedTargets = a.targets.filter(t => b.targets.includes(t));
            if (sharedTargets.length > 0) {
              // These agents noticed something similar → synthetic convergence
              const syntheticId = `convergent_${a.agent_id}_${b.agent_id}_${this.cycle}`;
              if (!traceAgentMap.has(syntheticId)) traceAgentMap.set(syntheticId, new Set());
              traceAgentMap.get(syntheticId)!.add(a.agent_id);
              traceAgentMap.get(syntheticId)!.add(b.agent_id);
              if (!traceUrgencyMap.has(syntheticId)) traceUrgencyMap.set(syntheticId, []);
              traceUrgencyMap.get(syntheticId)!.push(Math.max(a.confidence, b.confidence));
            }
          }
        }
      }
    }

    // Step 3: build clusters
    const clusters: Array<{ traces: string[]; agents: string[]; convergence: number; avg_urgency: number }> = [];

    for (const [traceId, agents] of traceAgentMap.entries()) {
      const convergence = agents.size / 5;
      const urgencies = traceUrgencyMap.get(traceId) || [];
      const maxUrgency = Math.max(0, ...urgencies);

      if (convergence >= threshold || maxUrgency > this.config.get('kernel.escalation_threshold')) {
        clusters.push({
          traces: [traceId],
          agents: Array.from(agents),
          convergence,
          avg_urgency: urgencies.length > 0 ? urgencies.reduce((s, u) => s + u, 0) / urgencies.length : 0,
        });
      }
    }

    return clusters.sort((a, b) => b.convergence - a.convergence);
  }

  // ═══════════════════════════════════════════
  // LINKING
  // ═══════════════════════════════════════════

  async link(fromTraceId: string, toTraceId: string, relation: TraceRelation, weight: number): Promise<void> {
    await this.db.execute(
      `RELATE (SELECT id FROM trace WHERE trace_id = $from LIMIT 1)
        -> ${relation}
        -> (SELECT id FROM trace WHERE trace_id = $to LIMIT 1)
        SET weight = $w, initial_weight = $w, co_activation_count = 0, last_co_activation = $cycle, prediction_error_sum = 0, outcome_reinforcement = 0`,
      { from: fromTraceId, to: toTraceId, w: weight, cycle: this.cycle },
    );
  }

  // ═══════════════════════════════════════════
  // RETRIEVAL
  // ═══════════════════════════════════════════

  async getActiveTraces(limit = 20): Promise<Result<Trace[], DomainError>> {
    // Cache full result set per cycle; slice to requested limit
    if (this.activeTracesCache && this.activeTracesCache.cycle === this.cycle) {
      return ok(this.activeTracesCache.traces.slice(0, limit));
    }
    const result = await this.db.query<Trace>(
      `SELECT * FROM trace WHERE archived = false AND suppressed = false ORDER BY weight DESC LIMIT $limit`,
      { limit: 50 }, // fetch a generous batch to serve various callers
    );
    if (result.isOk()) {
      this.activeTracesCache = { cycle: this.cycle, traces: result.value };
    }
    return result.isOk() ? ok(result.value.slice(0, limit)) : result;
  }

  async getTraceCount(): Promise<number> {
    if (this.traceCountCache && this.traceCountCache.cycle === this.cycle) {
      return this.traceCountCache.count;
    }
    const r = await this.db.query<{ c: number }>('SELECT count() AS c FROM trace WHERE archived = false GROUP ALL');
    const count = r.isOk() && r.value.length > 0 ? r.value[0].c : 0;
    this.traceCountCache = { cycle: this.cycle, count };
    return count;
  }


  /**
   * Query active inhibition edges for conflict detection.
   */
  async queryInhibits(): Promise<Result<Array<{ a: string; b: string; w: number }>, DomainError>> {
    return this.db.query<{ a: string; b: string; w: number }>(
      `SELECT in.content AS a, out.content AS b, weight AS w FROM inhibits WHERE in.trace_id IN (SELECT trace_id FROM trace WHERE archived = false AND suppressed = false AND weight > 0.3) ORDER BY weight DESC LIMIT 5`,
    );
  }

  // ═══════════════════════════════════════════
  // PRIVATE
  // ═══════════════════════════════════════════

  async getTracePosition(traceId: string): Promise<number[] | null> {
    const trace = await this.findById(traceId);
    return trace ? trace.position : null;
  }

  private async findById(traceId: string): Promise<Trace | null> {
    const r = await this.db.query<Trace>('SELECT * FROM trace WHERE trace_id = $tid LIMIT 1', { tid: traceId });
    return r.isOk() && r.value.length > 0 ? r.value[0] : null;
  }

  /**
   * Find trace by spatial proximity in concept space.
   * Graph-based: position the content, find nearest existing trace.
   * No text analysis — uses learned spatial positions.
   */
  private async findTraceBySimilarity(content: string): Promise<Trace | null> {
    if (!this.conceptSpace) return null;

    // Project content into concept space
    const position = await this.conceptSpace.projectNewTrace(content);
    if (position.length === 0) return null;

    // Find nearest trace by spatial distance
    const neighbors = await this.conceptSpace.findNeighbors(position, 2.0, 1);
    if (neighbors.length === 0) return null;

    return this.findById(neighbors[0].trace.trace_id);
  }

  /**
   * Detect spatial conflicts between recently activated traces.
   * If conflict found → birth new dimension.
   */
  private async detectAndResolveConflicts(activatedTraceIds: string[]): Promise<void> {
    // Get the actual traces
    const traces: Trace[] = [];
    for (const tid of activatedTraceIds.slice(0, 10)) {
      const t = await this.findById(tid);
      if (t) traces.push(t);
    }

    // Check all pairs for conflicts
    for (let i = 0; i < traces.length; i++) {
      for (let j = i + 1; j < traces.length; j++) {
        const conflict = this.conceptSpace.detectConflict(traces[i], traces[j]);
        if (conflict) {
          // BIRTH NEW DIMENSION
          await this.conceptSpace.birthDimension(conflict, this.cycle);
          conflict.resolved = true;
          return; // one dimension birth per cycle max
        }
      }
    }
  }

  /**
   * Similarity between traces via spatial distance in concept space.
   * Returns 0-1: 1 = identical position, 0 = very far apart.
   * No text analysis — uses learned spatial positions.
   */
  private spatialSimilarity(posA: number[], posB: number[]): number {
    if (!posA || !posB || posA.length === 0 || posB.length === 0) return 0;
    const dist = this.conceptSpace ? this.conceptSpace.distance(posA, posB) : 0;
    return Math.exp(-dist); // exponential decay: close = high similarity
  }

  private async getReactivationHistory(traceId: string): Promise<number[]> {
    const r = await this.db.query<{ reactivation_history: number[] }>(
      'SELECT reactivation_history FROM trace WHERE trace_id = $tid LIMIT 1',
      { tid: traceId },
    );
    return r.isOk() && r.value.length > 0 ? (r.value[0].reactivation_history || []) : [];
  }
}
