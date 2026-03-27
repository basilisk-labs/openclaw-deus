import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { DeliberationService } from '../../deliberation/deliberation.service';
import { MetaLearningService } from '../../cognitive/meta-learning.service';
import { IntentionService } from '../../intention/intention.service';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { Knowledge } from '../../common/types/knowledge.types';

/**
 * StrategicAgent (rank 5): "What should we do? How should we approach this?"
 *
 * The most expensive agent. Uses full LLM deliberation.
 * Only fires when there are active intentions to deliberate on.
 *
 * Fast-path: meta-learning patterns, quick heuristic
 * Slow-path: Full deliberation with knowledge + episodes + causal context
 */
@Injectable()
export class StrategicAgent implements CognitiveAgent {
  readonly id = 'strategic';
  readonly rank = 5;
  private readonly logger = new Logger(StrategicAgent.name);

  constructor(
    private readonly deliberation: DeliberationService,
    private readonly metaLearning: MetaLearningService,
    private readonly intentions: IntentionService,
    private readonly knowledge: KnowledgeService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    // Only deliberate when: not deep reflection, budget available, and active intentions exist
    if ((context.is_reflection && context.cycle > 2) || context.llm_budget.remaining <= 0) return signals;

    // Find intentions that need deliberation
    const activeResult = await this.intentions.findActive();
    if (activeResult.isErr()) return signals;

    const needsDeliberation = activeResult.value.filter(
      (i) => i.status === 'recognized' || i.status === 'adopted',
    );

    if (needsDeliberation.length === 0) return signals;

    // SLOW PATH: deliberate on top intention
    const topIntention = needsDeliberation[0];
    try {
      // Get relevant knowledge for context
      const relevantKnowledge = await this.knowledge.findSimilar(topIntention.description, 0.5);
      const knowledgeContext = relevantKnowledge.isOk() ? relevantKnowledge.value : [];

      const result = await this.deliberation.deliberate(topIntention, { knowledge: knowledgeContext as Knowledge[] });

      if (result.isOk()) {
        const delib = result.value;
        signals.push({
          agent_id: this.id,
          agent_rank: this.rank,
          type: 'strategy',
          content: `Deliberated on "${topIntention.description.slice(0, 60)}": ${delib.action_to_take.slice(0, 100)}`,
          payload: {
            intention_id: topIntention.intention_id,
            action: delib.action_to_take,
            safety_passed: delib.safety_passed,
            options_count: delib.deliberation.options.length,
          },
          confidence: delib.safety_passed ? 0.8 : 0.5,
          novelty_cost: 0.8,
          used_slow_path: true,
          // Target traces mentioning the intention (domain-specific, not mechanical top-3)
          targets: context.active_traces
            .filter(t => t.content.toLowerCase().includes(topIntention.description.slice(0, 20).toLowerCase()))
            .slice(0, 3)
            .map(t => t.trace_id),
          cycle: context.cycle,
        });
      }
    } catch (e) {
      this.logger.warn(`Strategic deliberation failed: ${e}`);
    }

    return signals;
  }
}
