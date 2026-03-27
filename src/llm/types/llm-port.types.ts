import { DomainError, Result } from '../../common/types/result.types';

export type LLMRequestType =
  | 'deliberation'
  | 'intention'
  | 'knowledge_extraction'
  | 'narrative'
  | 'repair';

export type LLMPriority = 'low' | 'medium' | 'high';
export type LLMBudgetClass = 'cheap' | 'standard' | 'expensive_allowed';
export type LLMModelPreference = 'fast' | 'balanced' | 'reasoning';

export interface LLMRequestContext {
  self_state?: unknown;
  active_traces?: unknown[];
  recent_commits?: unknown[];
  world_snapshot?: unknown;
  input?: string;
}

export interface LLMToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LLMPromptSpec {
  system_prompt: string;
  user_message: string;
  tools?: LLMToolDefinition[];
  force_tool?: string;
}

export interface LLMRequest {
  request_type: LLMRequestType;
  reason: string;
  priority: LLMPriority;
  budget_class: LLMBudgetClass;
  model_preference?: LLMModelPreference;
  temperature?: number;
  max_tokens?: number;
  trace_id?: string;
  session_id?: string;
  call_id?: string;
  context: LLMRequestContext;
  prompt: LLMPromptSpec;
  cache?: {
    key?: string;
    ttl_ms?: number;
  };
  metadata?: Record<string, unknown>;
}

export interface LLMTokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  cache_read_tokens?: number;
}

export interface LLMResponse {
  output_text: string;
  output_data?: unknown;
  usage?: LLMTokenUsage;
  provider?: string;
  model?: string;
  latency_ms?: number;
  cached?: boolean;
  call_id?: string;
}

export interface LLMCallEvent {
  call_id: string;
  trace_id?: string;
  request_type: LLMRequestType;
  reason: string;
  priority: LLMPriority;
  budget_class: LLMBudgetClass;
  provider?: string;
  model?: string;
  latency_ms?: number;
  token_usage?: LLMTokenUsage;
  mode: 'direct' | 'openclaw';
  cached?: boolean;
  success: boolean;
  fallback_used?: boolean;
  error_code?: string;
  error_message?: string;
}

export interface LLMPort {
  complete(request: LLMRequest): Promise<Result<LLMResponse, DomainError>>;
  isAvailable(): boolean;
}
