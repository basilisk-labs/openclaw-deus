import { Injectable, Logger } from '@nestjs/common';
import { SurrealService } from '../../database/surreal.service';
import { TraceGraphService } from '../memory/trace-graph.service';
import { CausalGraphService } from '../../cognitive/causal-graph.service';
import { Signal } from '../kernel.types';

/**
 * ActiveCognitionService: Higher-order cognitive processes for idle reflection.
 *
 * 1. EPISODIC REPLAY (dreaming): replay past episodes through trace graph
 *    to strengthen important paths. Like the brain during sleep.
 *
 * 2. CURIOSITY: intrinsic motivation from VOI (Value of Information).
 *    High uncertainty + high expected info gain → curiosity signal.
 *
 * 3. ACTIVE INFERENCE: "if X and Y then Z" — deductive reasoning
 *    during reflection, not just reporting state changes.
 *
 * 4. SCHEMA DETECTION: find recurring patterns across episodes
 *    and abstract them into general rules.
 *
 * These are INTERNAL processes — no LLM needed.
 */
@Injectable()
export class ActiveCognitionService {
  private readonly logger = new Logger(ActiveCognitionService.name);
  private replayIndex = 0;

  constructor(
    private readonly db: SurrealService,
    private readonly traceGraph: TraceGraphService,
    private readonly causalGraph: CausalGraphService,
  ) {}

  /**
   * EPISODIC REPLAY: pick a past episode and "re-live" it through the trace graph.
   * Strengthens traces involved in important episodes. Like dreaming.
   */
  async replayEpisode(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Get episodes ordered by importance (failures first — learn from mistakes)
    const episodes = await this.db.query<any>(
      `SELECT episode_id, summary, outcome, intention_id, lessons, created_at
       FROM episode ORDER BY outcome ASC, created_at DESC
       LIMIT 20`,
    );
    if (episodes.isErr() || episodes.value.length === 0) return signals;

    // Round-robin through episodes
    const ep = episodes.value[this.replayIndex % episodes.value.length];
    this.replayIndex++;

    // Reactivate traces related to this episode
    const relatedTraces = await this.db.query<any>(
      `SELECT trace_id FROM trace WHERE source_id = $eid OR content CONTAINS $summary AND archived = false LIMIT 5`,
      { eid: ep.episode_id, summary: (ep.summary || '').slice(0, 30) },
    );

    if (relatedTraces.isOk()) {
      for (const t of relatedTraces.value) {
        await this.traceGraph.reactivate(t.trace_id, 0.3, 0);
      }
    }

    // Generate replay signal
    const charge = ep.outcome === 'failure' ? -0.3 : ep.outcome === 'success' ? 0.2 : 0;
    signals.push({
      agent_id: 'dreaming',
      agent_rank: 0, // lowest rank — background process
      type: 'perception',
      content: `Replay [${ep.outcome}]: ${ep.summary || ep.episode_id}`,
      payload: { episode_id: ep.episode_id, outcome: ep.outcome, replay: true },
      confidence: 0.4, // low confidence — it's a memory, not current perception
      novelty_cost: 0, // replay is free — no new info
      used_slow_path: false,
      targets: relatedTraces.isOk() ? relatedTraces.value.map((t: any) => t.trace_id) : [],
      cycle,
    });

    // Process lessons: reinforce knowledge paths
    for (const lesson of ep.lessons || []) {
      signals.push({
        agent_id: 'dreaming',
        agent_rank: 0,
        type: 'prediction',
        content: `Lesson recalled: ${lesson.content}`,
        payload: { lesson, from_episode: ep.episode_id },
        confidence: lesson.confidence || 0.5,
        novelty_cost: 0,
        used_slow_path: false,
        targets: [],
        cycle,
      });
    }

    return signals;
  }

  /**
   * CURIOSITY: compute intrinsic motivation from Value of Information.
   * Generates signals about what the system WANTS to know.
   */
  async generateCuriosity(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    try {
      const graph = await this.causalGraph.build();
      if (graph.isErr() || graph.value.nodes.length === 0) return signals;

      const topVOI = this.causalGraph.getTopVOIBeliefs(graph.value, 3);

      for (const voi of topVOI) {
        if (voi.voi > 0.15) {
          signals.push({
            agent_id: 'curiosity',
            agent_rank: 0,
            type: 'affect',
            content: `Curious about: "${voi.label}" (VOI=${voi.voi.toFixed(2)}) — resolving this would improve predictions`,
            payload: {
              belief_id: voi.beliefId,
              voi: voi.voi,
              charge: 0.2, // curiosity is mildly positive
              curiosity: true,
            },
            confidence: 0.5,
            novelty_cost: 0.1,
            used_slow_path: false,
            targets: [],
            cycle,
          });
        }
      }
    } catch { /* causal graph may be empty */ }

    // Also curious about knowledge gaps
    const gaps = await this.db.query<any>(
      `SELECT description, domain, impact FROM knowledge_gap WHERE status = 'open' ORDER BY impact DESC LIMIT 3`,
    );
    if (gaps.isOk()) {
      for (const gap of gaps.value) {
        if (gap.impact > 0.6) {
          signals.push({
            agent_id: 'curiosity',
            agent_rank: 0,
            type: 'affect',
            content: `Knowledge gap: "${gap.description}" (impact=${gap.impact})`,
            payload: { gap, domain: gap.domain, charge: 0.15, curiosity: true },
            confidence: 0.6,
            novelty_cost: 0.05,
            used_slow_path: false,
            targets: [],
            cycle,
          });
        }
      }
    }

    return signals;
  }

  /**
   * ACTIVE INFERENCE: deductive reasoning from active traces.
   * "If X is true AND Y is true, then Z should follow."
   * Uses graph structure: if A activates B and B activates C, infer A→C.
   */
  async activeInference(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Find pairs of strongly connected traces
    const chains = await this.db.query<any>(
      `SELECT
        in.content AS premise_a,
        out.content AS conclusion,
        weight AS strength,
        in.trace_id AS a_id,
        out.trace_id AS b_id
       FROM activates
       WHERE weight > 0.5
         AND in.archived = false AND out.archived = false
         AND in.weight > 0.3 AND out.weight > 0.3
       ORDER BY weight DESC LIMIT 5`,
    );

    if (chains.isErr() || chains.value.length === 0) return signals;

    for (const chain of chains.value) {
      // Check if conclusion's weight is lower than premise suggests
      // If strong edge but weak conclusion → inference opportunity
      const conclusionTrace = await this.db.query<any>(
        'SELECT weight, confidence FROM trace WHERE trace_id = $tid LIMIT 1',
        { tid: chain.b_id },
      );

      if (conclusionTrace.isOk() && conclusionTrace.value.length > 0) {
        const cWeight = conclusionTrace.value[0].weight;
        const expectedWeight = chain.strength * 0.7; // expected from edge strength

        if (cWeight < expectedWeight - 0.1) {
          // Conclusion weaker than expected → inference: should be stronger
          signals.push({
            agent_id: 'inference',
            agent_rank: 0,
            type: 'prediction',
            content: `Inference: "${chain.premise_a?.slice(0, 40)}" strongly implies "${chain.conclusion?.slice(0, 40)}" (edge=${chain.strength.toFixed(2)}) but conclusion is weak (${cWeight.toFixed(2)})`,
            payload: {
              premise_trace: chain.a_id,
              conclusion_trace: chain.b_id,
              edge_strength: chain.strength,
              expected_weight: expectedWeight,
              actual_weight: cWeight,
              inference: true,
            },
            confidence: chain.strength * 0.6,
            novelty_cost: 0.15,
            used_slow_path: false,
            targets: [chain.a_id, chain.b_id],
            cycle,
          });
        }
      }
    }

    return signals;
  }

  /**
   * SCHEMA DETECTION + ABSTRACTION EMERGENCE.
   *
   * How children learn: see ball (round), plate (round), wheel (round)
   * → notice "round" co-occurs → abstract "roundness" as its own concept.
   *
   * When traces co-activate frequently:
   * 1. Detect the pattern (schema signal)
   * 2. If frequency > threshold: CREATE an abstract trace that represents the pattern
   * 3. Link all instances to the abstract trace → it becomes a HUB
   * 4. The abstract trace is now a concept that can be retrieved independently
   *
   * Abstractions are NOT taught — they EMERGE from experience.
   */
  async detectSchemas(cycle: number): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Find clusters of traces that frequently co-activate
    const hotEdges = await this.db.query<any>(
      `SELECT
        in.content AS a_content,
        out.content AS b_content,
        co_activation_count,
        weight,
        in.trace_id AS a_id,
        out.trace_id AS b_id
       FROM activates
       WHERE co_activation_count > 2
       ORDER BY co_activation_count DESC LIMIT 10`,
    );

    if (hotEdges.isErr() || hotEdges.value.length === 0) return signals;

    for (const edge of hotEdges.value) {
      // Schema signal for any pattern
      if (edge.co_activation_count > 3) {
        signals.push({
          agent_id: 'schema',
          agent_rank: 0,
          type: 'strategy',
          content: `Pattern: "${(edge.a_content || '').slice(0, 40)}" → "${(edge.b_content || '').slice(0, 40)}" (${edge.co_activation_count}x)`,
          payload: {
            schema: true,
            a_trace: edge.a_id,
            b_trace: edge.b_id,
            strength: edge.weight,
            frequency: edge.co_activation_count,
          },
          confidence: Math.min(0.9, edge.co_activation_count * 0.1),
          novelty_cost: 0.05,
          used_slow_path: false,
          targets: [edge.a_id, edge.b_id],
          cycle,
        });
      }

      // ABSTRACTION EMERGENCE: high-frequency pattern → create abstract hub trace
      if (edge.co_activation_count > 5) {
        await this.materializeAbstraction(edge, cycle);
      }
    }

    // Also check for multi-trace convergence (3+ traces with shared words)
    await this.detectPropertyAbstractions(cycle, signals);

    return signals;
  }

  /**
   * Materialize an abstraction: create a HUB trace from a strong pattern.
   * The hub connects all instances, becoming a retrievable concept.
   */
  private async materializeAbstraction(edge: any, cycle: number): Promise<void> {
    // Extract common words between the two traces (the "shared concept")
    const wordsA = new Set((edge.a_content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const wordsB = new Set((edge.b_content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3));
    const shared: string[] = [];
    for (const w of wordsA) { if (wordsB.has(w)) shared.push(w as string); }

    if (shared.length === 0) return;

    const abstractionName = shared.join(' + ');

    // Check if this abstraction already exists
    const existing = await this.db.query<any>(
      `SELECT trace_id FROM trace WHERE source_type = 'signal' AND content CONTAINS $name AND archived = false LIMIT 1`,
      { name: `[ABSTRACT] ${abstractionName}` },
    );
    if (existing.isOk() && existing.value.length > 0) return; // already materialized

    // CREATE the abstract trace — it IS the concept
    const result = await this.traceGraph.createTrace({
      source_type: 'signal', // abstract concepts are signal-born
      content: `[ABSTRACT] ${abstractionName} (emerged from ${edge.co_activation_count} co-activations)`,
      initial_weight: 0.7,
      confidence: Math.min(0.9, edge.co_activation_count * 0.08),
      emotional_charge: 0.1, // abstractions have mild positive charge (understanding feels good)
    });

    if (result.isOk()) {
      const abstractId = result.value.trace_id;
      // Link instances to the abstract hub
      await this.traceGraph.link(edge.a_id, abstractId, 'activates', 0.5);
      await this.traceGraph.link(edge.b_id, abstractId, 'activates', 0.5);
      await this.traceGraph.link(abstractId, edge.a_id, 'activates', 0.3); // bidirectional
      await this.traceGraph.link(abstractId, edge.b_id, 'activates', 0.3);

      this.logger.log(`ABSTRACTION EMERGED: "${abstractionName}" from ${edge.co_activation_count} co-activations`);
    }
  }

  /**
   * Detect property abstractions: when 3+ traces share common words,
   * the shared words might represent an emergent property/category.
   *
   * Like a child seeing ball+plate+wheel and abstracting "круглое".
   */
  private async detectPropertyAbstractions(cycle: number, signals: Signal[]): Promise<void> {
    // Get recent active traces
    const active = await this.db.query<any>(
      `SELECT trace_id, content, weight FROM trace WHERE archived = false AND suppressed = false AND weight > 0.3 ORDER BY weight DESC LIMIT 20`,
    );
    if (active.isErr() || active.value.length < 3) return;

    // Find words that appear in 3+ traces
    const wordTraceMap = new Map<string, string[]>();
    for (const trace of active.value) {
      const words = (trace.content || '').toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
      for (const word of words) {
        if (!wordTraceMap.has(word)) wordTraceMap.set(word, []);
        wordTraceMap.get(word)!.push(trace.trace_id);
      }
    }

    // Words appearing in 3+ traces = candidate abstractions
    for (const [word, traceIds] of wordTraceMap) {
      if (traceIds.length >= 3) {
        // Check if abstract trace already exists for this word
        const existing = await this.db.query<any>(
          `SELECT trace_id FROM trace WHERE content CONTAINS $pattern AND archived = false LIMIT 1`,
          { pattern: `[PROPERTY] ${word}` },
        );
        if (existing.isOk() && existing.value.length > 0) continue;

        // Create property abstraction
        const result = await this.traceGraph.createTrace({
          source_type: 'signal',
          content: `[PROPERTY] ${word} (shared by ${traceIds.length} traces)`,
          initial_weight: 0.5,
          confidence: Math.min(0.8, traceIds.length * 0.15),
          emotional_charge: 0.05,
        });

        if (result.isOk()) {
          // Link all instances to the property
          for (const tid of traceIds.slice(0, 5)) {
            await this.traceGraph.link(tid, result.value.trace_id, 'activates', 0.4);
            await this.traceGraph.link(result.value.trace_id, tid, 'activates', 0.2);
          }
          this.logger.log(`PROPERTY EMERGED: "${word}" (shared by ${traceIds.length} instances)`);

          signals.push({
            agent_id: 'schema',
            agent_rank: 0,
            type: 'strategy',
            content: `Property "${word}" emerged across ${traceIds.length} traces`,
            payload: { property: word, instances: traceIds.length, abstraction: true },
            confidence: 0.6,
            novelty_cost: 0.2,
            used_slow_path: false,
            targets: [result.value.trace_id],
            cycle,
          });
        }
      }
    }
  }
}
