import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { IntentionRecognitionService } from '../../intention/services/intention-recognition.service';
import { KnowledgeExtractionService } from '../../knowledge/services/knowledge-extraction.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';

/**
 * SensoryAgent (rank 1): "What changed? What is new?"
 *
 * NOT just forwarding substrate results. Adds:
 * - Change detection: compares current perceptions vs active traces
 * - Novelty assessment: what is NEW vs already known
 * - Reflection sensing: detects changes in INTERNAL state, not just external
 *
 * On reflection cycles: senses changes in OWN state (new commits, prediction errors,
 * affective shifts) — this IS interoception.
 */
@Injectable()
export class SensoryAgent implements CognitiveAgent {
  readonly id = 'sensory';
  readonly rank = 1;
  private readonly logger = new Logger(SensoryAgent.name);
  private previousTraceWeights = new Map<string, number>();

  constructor(
    private readonly intentionRecognition: IntentionRecognitionService,
    private readonly knowledgeExtraction: KnowledgeExtractionService,
    private readonly config: CognitiveConfigService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];
    const targets = context.active_traces.slice(0, 3).map(t => t.trace_id);

    if (context.is_reflection) {
      // INTEROCEPTION: sense changes in own state
      return this.senseInternalChanges(context);
    }

    // === EXTERNAL SENSING ===

    // Change detection: what in the input is NEW vs already in active traces
    const { novelty, changed, unchanged } = this.detectChanges(input, context);

    // Bootstrap: if no active traces exist, this is a completely new context → high confidence (escalation)
    const isBootstrap = context.active_traces.length === 0;
    const confidence = isBootstrap ? this.config.get('sensory.bootstrap_confidence') : this.config.get('sensory.default_confidence');

    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'perception',
      content: `Input: novelty=${novelty.toFixed(2)}, ${changed.length} new aspects, ${unchanged.length} reinforcements`,
      payload: { raw_input: input.slice(0, 500), novelty, changed, unchanged, is_novel: novelty > this.config.get('sensory.novelty_signal_threshold'), bootstrap: isBootstrap },
      confidence,
      novelty_cost: novelty > this.config.get('sensory.novelty_signal_threshold') ? 0.3 : 0.05,
      used_slow_path: false,
      targets,
      cycle: context.cycle,
    });

    // SLOW PATH: LLM extraction — only for TRULY novel events, not routine observations
    // High novelty threshold prevents LLM spam on mundane events like "на полу лежит мячик"
    if (novelty > this.config.get('sensory.novelty_slow_path_threshold') && context.llm_budget.remaining > 0) {
      await this.slowPathExtraction(input, signals, context);
    }

    // Update trace weight snapshot for next change detection
    this.previousTraceWeights.clear();
    for (const t of context.active_traces) {
      this.previousTraceWeights.set(t.trace_id, t.weight);
    }

    return signals;
  }

  /**
   * INTEROCEPTION: sense changes in internal state during reflection.
   * Detects: trace weight shifts, new high-energy traces, affective changes.
   */
  private senseInternalChanges(context: AgentContext): Signal[] {
    const signals: Signal[] = [];
    const targets = context.active_traces.slice(0, 3).map(t => t.trace_id);

    // Detect trace weight changes since last cycle
    const weightChanges: Array<{ trace_id: string; delta: number; content: string }> = [];
    for (const trace of context.active_traces) {
      const prev = this.previousTraceWeights.get(trace.trace_id);
      if (prev !== undefined) {
        const delta = trace.weight - prev;
        if (Math.abs(delta) > this.config.get('sensory.change_detection_threshold')) {
          weightChanges.push({ trace_id: trace.trace_id, delta, content: trace.content });
        }
      }
    }

    if (weightChanges.length > 0) {
      const rising = weightChanges.filter(c => c.delta > 0);
      const falling = weightChanges.filter(c => c.delta < 0);

      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'perception',
        content: `Internal shift: ${rising.length} traces rising, ${falling.length} falling`,
        payload: {
          rising: rising.map(c => ({ id: c.trace_id, delta: c.delta, content: c.content.slice(0, 50) })),
          falling: falling.map(c => ({ id: c.trace_id, delta: c.delta, content: c.content.slice(0, 50) })),
        },
        confidence: 0.7,
        novelty_cost: weightChanges.length * 0.05,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Detect prediction errors in recent commits
    if (context.recent_commits.some(c => c.prediction_error > 0.2)) {
      const errors = context.recent_commits.filter(c => c.prediction_error > 0.2);
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'perception',
        content: `Prediction errors detected: ${errors.length} commits with significant error`,
        payload: { error_count: errors.length, max_error: Math.max(...errors.map(e => e.prediction_error)) },
        confidence: 0.8,
        novelty_cost: 0.3,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Detect affective shifts
    if (context.phenomenal_state) {
      const ps = context.phenomenal_state;
      if (ps.felt_valence < -0.3 || ps.felt_urgency > 0.7) {
        signals.push({
          agent_id: this.id,
          agent_rank: this.rank,
          type: 'perception',
          content: `Affective signal: valence=${ps.felt_valence}, urgency=${ps.felt_urgency}`,
          payload: { valence: ps.felt_valence, urgency: ps.felt_urgency, tension: ps.self_world_tension },
          confidence: 0.7,
          novelty_cost: 0.2,
          used_slow_path: false,
          targets,
          cycle: context.cycle,
        });
      }
    }

    // Update snapshot
    this.previousTraceWeights.clear();
    for (const t of context.active_traces) {
      this.previousTraceWeights.set(t.trace_id, t.weight);
    }

    return signals;
  }

  /**
   * Change detection: compare current active trace state vs previous state.
   * Novelty = how much trace weights shifted. Graph-based, not text-based.
   */
  private detectChanges(_input: string, context: AgentContext): {
    novelty: number;
    changed: string[];
    unchanged: string[];
  } {
    const changed: string[] = [];
    const unchanged: string[] = [];

    // Compare trace weights vs previous snapshot
    for (const trace of context.active_traces) {
      const prev = this.previousTraceWeights.get(trace.trace_id);
      if (prev !== undefined) {
        const delta = Math.abs(trace.weight - prev);
        if (delta > this.config.get('sensory.change_detection_threshold')) {
          changed.push(trace.trace_id);
        } else {
          unchanged.push(trace.trace_id);
        }
      } else {
        // Completely new trace in active set → novel
        changed.push(trace.trace_id);
      }
    }

    // Novelty = ratio of changed/new traces in active set
    const totalActive = context.active_traces.length;
    const novelty = totalActive > 0
      ? Math.max(0.1, changed.length / totalActive)
      : 0.9; // no traces = everything is new

    return { novelty, changed, unchanged };
  }

  private async slowPathExtraction(input: string, signals: Signal[], context: AgentContext): Promise<void> {
    const targets = context.active_traces.slice(0, 3).map(t => t.trace_id);

    try {
      const intentResult = await this.intentionRecognition.recognizeFromMessage(input);
      if (intentResult.isOk()) {
        for (const intent of intentResult.value.new_intentions) {
          signals.push({
            agent_id: this.id, agent_rank: this.rank, type: 'perception',
            content: `Intention: "${intent.description}"`,
            payload: { intention: intent },
            confidence: 0.7, novelty_cost: 0.6, used_slow_path: true,
            targets, cycle: context.cycle,
          });
        }
        for (const completed of intentResult.value.completed_intentions) {
          signals.push({
            agent_id: this.id, agent_rank: this.rank, type: 'perception',
            content: `Completed: ${completed.intention_id} (${completed.outcome})`,
            payload: { completed },
            confidence: 0.9, novelty_cost: 0.4, used_slow_path: true,
            targets, cycle: context.cycle,
          });
        }
      }

      const knowResult = await this.knowledgeExtraction.extractFromInteraction(input);
      if (knowResult.isOk()) {
        for (const k of knowResult.value.new_knowledge || []) {
          signals.push({
            agent_id: this.id, agent_rank: this.rank, type: 'perception',
            content: `Knowledge: "${k.content}"`,
            payload: { knowledge: k },
            confidence: k.confidence, novelty_cost: 0.5, used_slow_path: true,
            targets, cycle: context.cycle,
          });
        }
      }
    } catch (e) {
      this.logger.warn(`Slow-path extraction failed: ${e}`);
    }
  }
}
