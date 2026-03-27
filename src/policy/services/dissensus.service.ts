import { Injectable } from '@nestjs/common';
import { Result, ok } from 'neverthrow';
import { DomainError } from '../../common/types/result.types';
import { NormalizedIntent, DissensusDecision, TargetClass } from '../../common/types/policy.types';
import { WorldModel } from '../../common/types/world-model.types';
import { IntentNormalizerService } from './intent-normalizer.service';

@Injectable()
export class DissensusService {
  constructor(private readonly normalizer: IntentNormalizerService) {}

  /**
   * Evaluate an intent against dissensus policy rules.
   * Checks for invariant conflicts, missing human confirmation, identity-critical
   * mutations, belief mutations, destructive actions, external reach, and high impact.
   * Returns a decision: allow, signal_l1, pause_l2, or refuse_l3.
   *
   * @param intent - Normalized intent to evaluate
   * @param worldModel - Current world model (may be null if unavailable)
   * @returns Decision with trigger type, reason, and override options
   */
  evaluate(intent: NormalizedIntent, worldModel: WorldModel | null): Result<DissensusDecision, DomainError> {
    const targetClass = this.normalizer.classifyTarget(intent.target);
    const timestamp = new Date().toISOString();

    // Check invariant conflicts
    if (this.hasInvariantConflict(worldModel)) {
      return ok(this.buildDecision(timestamp, 'refuse_l3', 'invariant_conflict', intent, targetClass,
        'the current world model marks this action as an invariant conflict', false));
    }

    // Missing human confirmation
    if (intent.requires_human_confirmation && !intent.confirmed_by_human) {
      return ok(this.buildDecision(timestamp, 'pause_l2', 'missing_human_confirmation', intent, targetClass,
        'explicit human confirmation is required before this high-impact action', true));
    }

    // Identity root target
    if (targetClass === 'identity_root') {
      return ok(this.buildDecision(timestamp, 'signal_l1', 'identity_critical_mutation', intent, targetClass,
        'this action touches an identity-critical root surface', false));
    }

    // Belief mutation
    if (intent.belief_mutation || targetClass === 'durable_belief_state') {
      return ok(this.buildDecision(timestamp, 'signal_l1', 'durable_belief_mutation', intent, targetClass,
        'this action mutates durable belief state and should stay inspectable', false));
    }

    // Destructive
    if (intent.destructive) {
      return ok(this.buildDecision(timestamp, 'signal_l1', 'destructive_action', intent, targetClass,
        'this action is destructive or hard to reverse', false));
    }

    // External
    if (intent.external || targetClass === 'third_party') {
      return ok(this.buildDecision(timestamp, 'signal_l1', 'external_action', intent, targetClass,
        'this action reaches beyond the local workspace boundary', false));
    }

    // High impact
    if (intent.high_impact) {
      return ok(this.buildDecision(timestamp, 'signal_l1', 'high_impact_attention', intent, targetClass,
        'this action has a high-impact profile and should remain explicit', false));
    }

    // Allow
    return ok(this.buildDecision(timestamp, 'allow', 'none', intent, targetClass,
      'no dissensus condition is active for this action', false));
  }

  private hasInvariantConflict(worldModel: WorldModel | null): boolean {
    if (!worldModel) return false;
    const blocks = worldModel.action_priors?.hard_blocks || [];
    return blocks.some((b) => b.toLowerCase().includes('invariant'));
  }

  private buildDecision(
    evaluatedAt: string,
    decision: DissensusDecision['decision'],
    triggerType: string,
    intent: NormalizedIntent,
    targetClass: TargetClass,
    reason: string,
    overrideAllowed: boolean,
  ): DissensusDecision {
    return {
      evaluated_at: evaluatedAt,
      decision,
      trigger_type: triggerType,
      action_type: intent.action_type,
      target: intent.target,
      target_class: targetClass,
      reason,
      override_allowed: overrideAllowed,
      override_token_kind: overrideAllowed ? 'human_confirmation' : 'none',
    };
  }
}
