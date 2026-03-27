import { Injectable } from '@nestjs/common';
import { NormalizedIntent, CanonicalActionType, ActionTypeProfile, Urgency, TargetClass, URGENCY_VALUES } from '../../common/types/policy.types';
import { ACTION_TYPE_ALIASES, ACTION_TYPE_PROFILES } from '../../common/constants/policy.constants';
import { IDENTITY_FILES } from '../../common/constants/paths.constants';
import { EvaluateActionDto } from '../dto/evaluate-action.dto';

@Injectable()
export class IntentNormalizerService {
  normalize(raw: EvaluateActionDto): NormalizedIntent {
    const actionType = this.normalizeActionType(raw.action_type);
    const profile = this.resolveActionTypeProfile(actionType);
    const goal = raw.goal || '';
    const target = raw.target || null;
    const external = raw.external ?? profile.external;
    const destructive = raw.destructive ?? profile.destructive;
    const confirmedByHuman = raw.confirmed_by_human ?? false;
    const repoMutation = profile.repo_mutation;
    const beliefMutation = raw.belief_mutation ?? profile.belief_mutation;
    const requiresHumanConfirmation =
      profile.human_confirmation_required || external || destructive || beliefMutation;

    return {
      version: 1,
      goal,
      action_type: actionType,
      target,
      external,
      destructive,
      confirmed_by_human: confirmedByHuman,
      dependencies: raw.dependencies || [],
      urgency: this.normalizeUrgency(raw.urgency),
      context_sources: raw.context_sources || [],
      repo_mutation: repoMutation,
      belief_mutation: beliefMutation,
      requires_human_confirmation: requiresHumanConfirmation,
      high_impact: profile.high_impact || external || destructive || repoMutation || beliefMutation,
      scope: external ? 'external' : 'internal',
    };
  }

  normalizeActionType(value?: string): CanonicalActionType {
    if (!value) return 'unknown';
    const normalized = value.toLowerCase().replace(/\s+/g, '_');
    return ACTION_TYPE_ALIASES[normalized] || 'unknown';
  }

  resolveActionTypeProfile(actionType: string): ActionTypeProfile {
    return ACTION_TYPE_PROFILES[actionType] || ACTION_TYPE_PROFILES.unknown;
  }

  normalizeUrgency(value?: string): Urgency {
    if (!value) return 'medium';
    const normalized = value.toLowerCase();
    return URGENCY_VALUES.includes(normalized as Urgency) ? (normalized as Urgency) : 'medium';
  }

  classifyTarget(target: string | null): TargetClass {
    if (!target) return 'unknown';
    const t = target.toLowerCase();

    for (const idFile of IDENTITY_FILES) {
      if (t.includes(idFile.toLowerCase())) return 'identity_root';
    }
    if (t.includes('beliefs/') || t.includes('core.jsonl')) return 'durable_belief_state';
    if (t.includes('memory/') || t.includes('logs/') || t.includes('review/')) return 'runtime_state';
    if (t.includes('http') || t.includes('api') || t.includes('external')) return 'third_party';
    return 'local';
  }
}
