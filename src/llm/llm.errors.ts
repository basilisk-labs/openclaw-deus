import { DomainError } from '../common/types/result.types';

export class LlmError extends DomainError {
  readonly code = 'LLM_ERROR';
}

export class LlmBudgetExhaustedError extends DomainError {
  readonly code = 'LLM_BUDGET_EXHAUSTED';
}
