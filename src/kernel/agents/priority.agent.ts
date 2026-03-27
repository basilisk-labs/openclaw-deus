import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { IntentionStackService } from '../../intention/services/intention-stack.service';
import { IntentionService } from '../../intention/intention.service';

/**
 * PriorityAgent (rank 4): "What should we do NOW? What conflicts?"
 *
 * NOT just forwarding the top intention. Adds:
 * - Conflict detection between competing intentions
 * - Urgency assessment from phenomenal state
 * - Reprioritization when affect state shifts (stress → conservative priorities)
 */
@Injectable()
export class PriorityAgent implements CognitiveAgent {
  readonly id = 'priority';
  readonly rank = 4;
  private readonly logger = new Logger(PriorityAgent.name);

  constructor(
    private readonly intentionStack: IntentionStackService,
    private readonly intentions: IntentionService,
  ) {}

  async process(input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];

    const activeResult = await this.intentions.findActive();
    if (activeResult.isErr()) return signals;
    const active = activeResult.value;
    if (active.length === 0) return signals;

    // Target traces related to current top intention (not mechanical top-3)
    const topDesc = active[0]?.description?.toLowerCase().slice(0, 20) || '';
    const targets = topDesc
      ? context.active_traces.filter(t => t.content.toLowerCase().includes(topDesc)).slice(0, 3).map(t => t.trace_id)
      : context.active_traces.slice(0, 2).map(t => t.trace_id);

    // Top priority
    const top = active[0];
    signals.push({
      agent_id: this.id, agent_rank: this.rank, type: 'priority',
      content: `Top: "${top.description}" (p=${top.priority})`,
      payload: { intention_id: top.intention_id, priority: top.priority, status: top.status, total_active: active.length },
      confidence: 0.7, novelty_cost: 0.1, used_slow_path: false,
      targets, cycle: context.cycle,
    });

    // CONFLICT DETECTION: multiple high-priority intentions competing
    const highPriority = active.filter((i: any) => i.priority > 0.6);
    if (highPriority.length > 1) {
      const conflicting = highPriority.slice(0, 3).map((i: any) => `"${i.description.slice(0, 40)}" (p=${i.priority})`);
      signals.push({
        agent_id: this.id, agent_rank: this.rank, type: 'priority',
        content: `CONFLICT: ${highPriority.length} competing high-priority intentions: ${conflicting.join(' vs ')}`,
        payload: { conflict: true, competing_count: highPriority.length, intentions: highPriority.map((i: any) => i.intention_id) },
        confidence: 0.8, novelty_cost: 0.3, used_slow_path: false,
        targets, cycle: context.cycle,
      });
    }

    // URGENCY from phenomenal state: if system is stressed, flag current priority as urgent
    if (context.phenomenal_state) {
      const ps = context.phenomenal_state;
      if (ps.felt_urgency > 0.6 && ps.self_world_tension > 0.3) {
        signals.push({
          agent_id: this.id, agent_rank: this.rank, type: 'priority',
          content: `URGENCY: tension=${ps.self_world_tension.toFixed(2)}, system stressed — need action on "${top.description.slice(0, 40)}"`,
          payload: { urgency: ps.felt_urgency, tension: ps.self_world_tension },
          confidence: 0.9, novelty_cost: 0.2, used_slow_path: false,
          targets, cycle: context.cycle,
        });
      }
    }

    // Auto-adopt ripe intentions
    const adoptResult = await this.intentionStack.autoAdopt();
    if (adoptResult.isOk() && adoptResult.value > 0) {
      signals.push({
        agent_id: this.id, agent_rank: this.rank, type: 'priority',
        content: `Adopted ${adoptResult.value} intentions`,
        payload: { adopted: adoptResult.value },
        confidence: 0.8, novelty_cost: 0.2, used_slow_path: false,
        targets, cycle: context.cycle,
      });
    }

    return signals;
  }
}
