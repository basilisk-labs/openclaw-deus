import { Injectable } from '@nestjs/common';
import { NormalizedIntent, RipenessScore } from '../../common/types/policy.types';
import { WorldModel } from '../../common/types/world-model.types';
import { CognitiveConfigService } from '../../cognitive/cognitive-config.service';

@Injectable()
export class RipenessService {
  constructor(private readonly config: CognitiveConfigService) {}

  /**
   * Score how "ripe" (ready to execute) an intent is based on preconditions.
   * Evaluates goal clarity, world model quality, dependency readiness, authorization,
   * environment readiness, and context freshness. Returns classification:
   * ready, soon, preparing, not_ready, or blocked.
   *
   * @param intent - Normalized intent to assess
   * @param worldModel - Current world model (may be null)
   * @returns Ripeness score (0-1), classification, blockers, and factor breakdown
   */
  score(intent: NormalizedIntent, worldModel: WorldModel | null): RipenessScore {
    const factors: Record<string, number> = {
      goal_clarity: this.getGoalClarityScore(intent),
      world_model_quality: this.getWorldModelQualityScore(worldModel),
      dependency_readiness: this.getDependencyReadinessScore(intent),
      authorization: this.getAuthorizationScore(intent),
      environment_readiness: this.getEnvironmentReadinessScore(worldModel),
      context_freshness: this.getContextFreshnessScore(worldModel),
    };

    const weights: Record<string, number> = {
      goal_clarity: this.config.get('ripeness.w_goal_clarity'),
      world_model_quality: this.config.get('ripeness.w_world_quality'),
      dependency_readiness: this.config.get('ripeness.w_dependency'),
      authorization: this.config.get('ripeness.w_authorization'),
      environment_readiness: this.config.get('ripeness.w_environment'),
      context_freshness: this.config.get('ripeness.w_freshness'),
    };

    let total = 0;
    for (const [key, weight] of Object.entries(weights)) {
      total += (factors[key] ?? 0) * weight;
    }

    const blockers: string[] = [];
    const missingPreconditions: string[] = [];

    if (!intent.goal) blockers.push('no_goal_specified');
    if (intent.requires_human_confirmation && !intent.confirmed_by_human) {
      missingPreconditions.push('human_confirmation');
    }
    if (intent.dependencies.length > 0) {
      missingPreconditions.push('unresolved_dependencies');
    }

    if (missingPreconditions.length > 0) {
      total -= Math.min(0.25, missingPreconditions.length * 0.05);
    }

    total = Math.max(0, Math.min(1, total));
    const ripenessClass = this.classifyRipeness(total, blockers, missingPreconditions);

    return {
      score: Math.round(total * 1000) / 1000,
      class: ripenessClass,
      blockers,
      missing_preconditions: missingPreconditions,
      factor_scores: factors,
      rationale: `Ripeness ${ripenessClass} (score: ${total.toFixed(3)})`,
    };
  }

  getGoalClarityScore(intent: NormalizedIntent): number {
    if (!intent.goal) return 0;
    if (intent.goal.length > 20 && intent.action_type !== 'unknown') return 1.0;
    if (intent.goal.length > 10) return 0.7;
    return 0.4;
  }

  getWorldModelQualityScore(worldModel: WorldModel | null): number {
    if (!worldModel) return 0.2;
    return Math.min(1.0, worldModel.confidence);
  }

  getDependencyReadinessScore(intent: NormalizedIntent): number {
    if (intent.dependencies.length === 0) return 1.0;
    return 0.3; // unresolved deps reduce score
  }

  getAuthorizationScore(intent: NormalizedIntent): number {
    if (!intent.requires_human_confirmation) return 1.0;
    if (intent.confirmed_by_human) return 1.0;
    return 0.1;
  }

  getEnvironmentReadinessScore(worldModel: WorldModel | null): number {
    if (!worldModel) return 0.5;
    const blocks = worldModel.action_priors?.hard_blocks || [];
    if (blocks.length > 0) return 0.1;
    return 0.9;
  }

  getContextFreshnessScore(worldModel: WorldModel | null): number {
    if (!worldModel) return 0.3;
    const hoursOld = (Date.now() - new Date(worldModel.generated_at).getTime()) / 3600000;
    if (hoursOld < 1) return 1.0;
    if (hoursOld < 6) return 0.8;
    if (hoursOld < 24) return 0.5;
    return 0.2;
  }

  private classifyRipeness(score: number, blockers: string[], missing: string[]): string {
    if (blockers.length > 0) return 'blocked';
    if (score >= this.config.get('ripeness.threshold_ready')) return 'ready';
    if (score >= this.config.get('ripeness.threshold_soon')) return 'soon';
    if (score >= 0.4) return 'preparing';
    return 'not_ready';
  }
}
