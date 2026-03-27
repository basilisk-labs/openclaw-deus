import { Injectable, Logger } from '@nestjs/common';
import { Signal } from '../kernel.types';
import { CognitiveAgent, AgentContext } from '../kernel-loop.service';
import { AffectiveStateService } from '../affect/affective-state.service';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';

/**
 * AffectiveAgent (rank 3): "How does this FEEL? What matters?"
 *
 * Reads ONLY from the hormonal system — no text analysis, no keyword matching.
 * The child is pre-linguistic. Affect comes from:
 * - Hormonal state (cortisol, dopamine, NE, serotonin)
 * - Pain/reward accumulators
 * - Prediction error history
 * - Energy level
 *
 * Pain/reward signals come from the WORLD (consequences of actions),
 * not from parsing text content.
 */
@Injectable()
export class AffectiveAgent implements CognitiveAgent {
  readonly id = 'affective';
  readonly rank = 3;
  private readonly logger = new Logger(AffectiveAgent.name);

  constructor(
    private readonly affectiveState: AffectiveStateService,
    private readonly config: CognitiveConfigService,
  ) {}

  async process(_input: string, context: AgentContext): Promise<Signal[]> {
    const signals: Signal[] = [];
    const affect = this.affectiveState.getSnapshot();
    const targets = context.active_traces.slice(0, 3).map(t => t.trace_id);

    // Core signal: current affective state (always produced)
    signals.push({
      agent_id: this.id,
      agent_rank: this.rank,
      type: 'affect',
      content: `Affect: mode=${affect.mode}, valence=${affect.valence}, arousal=${affect.arousal}`,
      payload: {
        charge: affect.valence,
        hormones: affect.hormones,
        pain: affect.pain,
        mode: affect.mode,
      },
      confidence: 0.7 + affect.arousal * 0.2, // higher arousal → more confident affect signal
      novelty_cost: affect.arousal * 0.4 + Math.abs(affect.valence) * 0.2,
      used_slow_path: false,
      targets,
      cycle: context.cycle,
    });

    // Pain escalation — threshold from config, not hardcoded
    const painThreshold = this.config.get('kernel.pain_escalation_threshold') ?? 0.4;
    if (affect.pain.intensity > painThreshold) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `PAIN: intensity=${affect.pain.intensity.toFixed(2)}, ${affect.pain.chronic ? 'chronic' : 'acute'}`,
        payload: { pain: affect.pain, charge: -affect.pain.intensity },
        confidence: affect.pain.intensity,
        novelty_cost: affect.pain.chronic ? 0.1 : 0.5,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Stress signal — from hormone level, threshold from config
    const stressThreshold = this.config.get('kernel.stress_hormone_threshold') ?? 0.6;
    if (affect.hormones.cortisol > stressThreshold) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `STRESS: cortisol=${affect.hormones.cortisol.toFixed(2)}`,
        payload: { cortisol: affect.hormones.cortisol, mode: 'defensive' },
        confidence: Math.min(1, affect.hormones.cortisol),
        novelty_cost: 0.2,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // Reward signal — from dopamine level
    const rewardThreshold = this.config.get('kernel.reward_hormone_threshold') ?? 0.6;
    if (affect.hormones.dopamine > rewardThreshold) {
      signals.push({
        agent_id: this.id,
        agent_rank: this.rank,
        type: 'affect',
        content: `REWARD: dopamine=${affect.hormones.dopamine.toFixed(2)}`,
        payload: { dopamine: affect.hormones.dopamine, mode: 'explore' },
        confidence: Math.min(1, affect.hormones.dopamine),
        novelty_cost: 0.1,
        used_slow_path: false,
        targets,
        cycle: context.cycle,
      });
    }

    // NO detectPainReward() from text — pain/reward comes from world consequences
    // through affect.inflictPain() and affect.reward() called by WorldBridge

    return signals;
  }
}
