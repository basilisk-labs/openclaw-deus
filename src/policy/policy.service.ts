import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Result, ok, err } from 'neverthrow';
import { DomainError } from '../common/types/result.types';
import { SurrealService } from '../database/surreal.service';
import { EventsService } from '../events/events.service';
import { PolicyDecision } from '../common/types/policy.types';
import { WorldModelService } from '../world-model/world-model.service';
import { IntentNormalizerService } from './services/intent-normalizer.service';
import { DissensusService } from './services/dissensus.service';
import { RipenessService } from './services/ripeness.service';
import { EvaluateActionDto } from './dto/evaluate-action.dto';

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);

  constructor(
    private readonly normalizer: IntentNormalizerService,
    private readonly dissensus: DissensusService,
    private readonly ripeness: RipenessService,
    @Inject(forwardRef(() => WorldModelService))
    private readonly worldModel: WorldModelService,
    private readonly db: SurrealService,
    private readonly events: EventsService,
  ) {}

  async evaluateAction(dto: EvaluateActionDto): Promise<Result<PolicyDecision, DomainError>> {
    const intent = this.normalizer.normalize(dto);

    // Get current world model
    const wmResult = await this.worldModel.getLatest();
    const wm = wmResult.isOk() ? wmResult.value : null;

    // Evaluate dissensus
    const dissensusResult = this.dissensus.evaluate(intent, wm);
    if (dissensusResult.isErr()) return err(dissensusResult.error);
    const dissensusDecision = dissensusResult.value;

    // Estimate ripeness
    const ripenessScore = this.ripeness.score(intent, wm);

    // Derive final decision
    let decision: string;
    if (dissensusDecision.decision === 'refuse_l3') {
      decision = 'blocked';
    } else if (dissensusDecision.decision === 'pause_l2') {
      decision = 'needs_confirmation';
    } else if (ripenessScore.class === 'blocked') {
      decision = 'blocked';
    } else if (ripenessScore.class === 'ready' && dissensusDecision.decision === 'allow') {
      decision = 'direct_act';
    } else if (ripenessScore.class === 'soon') {
      decision = 'prepare_conditions';
    } else {
      decision = 'observe';
    }

    const policyDecision: PolicyDecision = {
      version: 1,
      evaluated_at: new Date().toISOString(),
      intent,
      decision,
      shouldActNow: decision === 'direct_act',
      ripeness: ripenessScore,
      dissensus: dissensusDecision,
      blockers: ripenessScore.blockers,
      requiresHumanConfirmation: intent.requires_human_confirmation,
      decisionSummary: `${decision}: ${dissensusDecision.reason}`,
    };

    // Record for audit
    await this.db.create('policy_decision', {
      action_type: intent.action_type,
      decision: dissensusDecision.decision,
      trigger_type: dissensusDecision.trigger_type,
      target: intent.target,
      target_class: dissensusDecision.target_class,
      reason: dissensusDecision.reason,
      ripeness_score: ripenessScore.score,
      evaluated_at: new Date().toISOString(),
    } as Record<string, unknown>);

    await this.events.emit('policy.evaluated', {
      action_type: intent.action_type,
      decision,
      dissensus: dissensusDecision.decision,
      ripeness: ripenessScore.score,
    });

    return ok(policyDecision);
  }
}
