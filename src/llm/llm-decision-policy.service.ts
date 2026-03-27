import { Injectable } from '@nestjs/common';
import { LlmOperationType, LlmPriority } from './types/llm.types';
import {
  LLMBudgetClass,
  LLMModelPreference,
  LLMPriority,
  LLMRequest,
  LLMRequestContext,
  LLMRequestType,
  LLMPromptSpec,
} from './types/llm-port.types';

export interface LLMDecisionInput {
  operationType: LlmOperationType;
  reason: string;
  context: LLMRequestContext;
  prompt: LLMPromptSpec;
  maxTokens?: number;
  temperature?: number;
  traceId?: string;
  sessionId?: string;
  cacheKey?: string;
  cacheTtlMs?: number;
  noveltyScore?: number;
  predictionError?: number;
  operatorContext?: boolean;
  energyLevel?: number;
  priorityOverride?: LLMPriority;
  budgetClassOverride?: LLMBudgetClass;
  modelPreferenceOverride?: LLMModelPreference;
}

@Injectable()
export class LlmDecisionPolicyService {
  buildRequest(input: LLMDecisionInput): LLMRequest {
    const requestType = this.mapRequestType(input.operationType);
    const priority = input.priorityOverride || this.mapPriority(input.operationType);
    const budgetClass = input.budgetClassOverride || this.mapBudgetClass(input.operationType, input.operatorContext);
    const modelPreference = input.modelPreferenceOverride
      || this.mapModelPreference(input.operationType, input.noveltyScore, input.predictionError, input.energyLevel);

    return {
      request_type: requestType,
      reason: input.reason,
      priority,
      budget_class: budgetClass,
      model_preference: modelPreference,
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      trace_id: input.traceId,
      session_id: input.sessionId,
      context: input.context,
      prompt: input.prompt,
      cache: input.cacheKey || input.cacheTtlMs
        ? {
            key: input.cacheKey,
            ttl_ms: input.cacheTtlMs,
          }
        : undefined,
      metadata: {
        operation_type: input.operationType,
        novelty_score: input.noveltyScore,
        prediction_error: input.predictionError,
        operator_context: input.operatorContext || false,
      },
    };
  }

  private mapRequestType(operationType: LlmOperationType): LLMRequestType {
    switch (operationType) {
      case LlmOperationType.INTENTION_RECOGNITION:
        return 'intention';
      case LlmOperationType.KNOWLEDGE_EXTRACTION:
      case LlmOperationType.PROCEDURE_EXTRACTION:
      case LlmOperationType.BELIEF_EXTRACTION:
      case LlmOperationType.CONTRADICTION:
      case LlmOperationType.BELIEF_SYNTHESIS:
      case LlmOperationType.MEMORY_CONSOLIDATION:
        return 'knowledge_extraction';
      case LlmOperationType.DELIBERATION:
      case LlmOperationType.POLICY_REASONING:
        return 'deliberation';
      case LlmOperationType.DIAGNOSIS:
        return 'repair';
      case LlmOperationType.EPISODE_CREATION:
      case LlmOperationType.OPERATOR_MODEL_UPDATE:
      case LlmOperationType.SELF_ASSESSMENT:
      case LlmOperationType.INTROSPECTION:
      default:
        return 'narrative';
    }
  }

  private mapPriority(operationType: LlmOperationType): LLMPriority {
    switch (operationType) {
      case LlmOperationType.INTENTION_RECOGNITION:
      case LlmOperationType.DELIBERATION:
      case LlmOperationType.DIAGNOSIS:
        return 'high';
      case LlmOperationType.KNOWLEDGE_EXTRACTION:
      case LlmOperationType.EPISODE_CREATION:
      case LlmOperationType.OPERATOR_MODEL_UPDATE:
      case LlmOperationType.BELIEF_EXTRACTION:
      case LlmOperationType.CONTRADICTION:
        return 'medium';
      default:
        return 'low';
    }
  }

  private mapBudgetClass(operationType: LlmOperationType, operatorContext?: boolean): LLMBudgetClass {
    if (operatorContext) {
      return 'expensive_allowed';
    }

    switch (operationType) {
      case LlmOperationType.INTENTION_RECOGNITION:
      case LlmOperationType.DELIBERATION:
      case LlmOperationType.DIAGNOSIS:
        return 'standard';
      case LlmOperationType.KNOWLEDGE_EXTRACTION:
      case LlmOperationType.EPISODE_CREATION:
      case LlmOperationType.SELF_ASSESSMENT:
        return 'cheap';
      default:
        return 'cheap';
    }
  }

  private mapModelPreference(
    operationType: LlmOperationType,
    noveltyScore?: number,
    predictionError?: number,
    energyLevel?: number,
  ): LLMModelPreference {
    if ((energyLevel ?? 1) < 0.2) {
      return 'fast';
    }

    if ((predictionError ?? 0) > 0.4 || (noveltyScore ?? 0) > 0.8) {
      return 'reasoning';
    }

    switch (operationType) {
      case LlmOperationType.DELIBERATION:
      case LlmOperationType.DIAGNOSIS:
      case LlmOperationType.POLICY_REASONING:
        return 'reasoning';
      case LlmOperationType.INTENTION_RECOGNITION:
      case LlmOperationType.KNOWLEDGE_EXTRACTION:
        return 'balanced';
      default:
        return 'fast';
    }
  }

  mapLegacyPriority(priority: LlmPriority): LLMPriority {
    switch (priority) {
      case LlmPriority.CRITICAL:
      case LlmPriority.HIGH:
        return 'high';
      case LlmPriority.NORMAL:
        return 'medium';
      case LlmPriority.LOW:
      default:
        return 'low';
    }
  }
}
